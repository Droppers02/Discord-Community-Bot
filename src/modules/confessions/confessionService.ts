import {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ModalBuilder,
    type Attachment,
    type Guild,
    type GuildMember,
    type Message,
    type TextChannel,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne, withTransaction } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { humanizeDuration, timestamp } from "../../lib/time.js";
import { appendAuditLog } from "../../services/auditService.js";
import { textField, uploadField } from "../config/panelKit.js";
import { findBannedWord } from "../protection/protectionService.js";
import { getProtectionSettings } from "../protection/protectionSettings.js";
import { getConfessionSettings, saveConfessionSettings, type ConfessionSettings } from "./confessionSettings.js";

// Confissões anónimas. O autor fica guardado na BD (para bloqueios e casos graves), mas ninguém o
// vê: a equipa aprova/rejeita/bloqueia sem saber quem é, e só a administração pode revelar — e
// isso fica no registo de auditoria. Respostas anónimas vão num fio por baixo da confissão.

export const CONFESS_NS = "confess";
const cid = (...parts: Array<string | number>) => buildCustomId(CONFESS_NS, ...parts);
export const MAX_CONFESSION = 1800;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export type ConfessionStatus = "pending" | "approved" | "rejected" | "deleted";

export interface Confession {
    guild_id: string;
    number: number;
    kind: "confession" | "reply";
    parent_number: number | null;
    author_id: string;
    content: string;
    image_url: string | null;
    status: ConfessionStatus;
    review_message_id: string | null;
    posted_channel_id: string | null;
    posted_message_id: string | null;
    thread_id: string | null;
    reviewed_by: string | null;
    reject_reason: string | null;
    created_at: number;
    reviewed_at: number | null;
}

function toConfession(row: Record<string, unknown>): Confession {
    const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
    return {
        guild_id: String(row.guild_id),
        number: Number(row.number),
        kind: row.kind === "reply" ? "reply" : "confession",
        parent_number: row.parent_number === null || row.parent_number === undefined ? null : Number(row.parent_number),
        author_id: String(row.author_id),
        content: String(row.content),
        image_url: str(row.image_url),
        status: row.status as ConfessionStatus,
        review_message_id: str(row.review_message_id),
        posted_channel_id: str(row.posted_channel_id),
        posted_message_id: str(row.posted_message_id),
        thread_id: str(row.thread_id),
        reviewed_by: str(row.reviewed_by),
        reject_reason: str(row.reject_reason),
        created_at: Number(row.created_at),
        reviewed_at: row.reviewed_at === null || row.reviewed_at === undefined ? null : Number(row.reviewed_at),
    };
}

export async function getConfession(guildId: string, number: number): Promise<Confession | null> {
    const row = await queryOne("SELECT * FROM confessions WHERE guild_id = $1 AND number = $2", [guildId, number]);
    return row ? toConfession(row) : null;
}

async function updateConfession(entry: Confession): Promise<void> {
    await query(
        `UPDATE confessions SET status = $3, image_url = $4, review_message_id = $5, posted_channel_id = $6, posted_message_id = $7, thread_id = $8, reviewed_by = $9, reject_reason = $10, reviewed_at = $11
         WHERE guild_id = $1 AND number = $2`,
        [entry.guild_id, entry.number, entry.status, entry.image_url, entry.review_message_id, entry.posted_channel_id, entry.posted_message_id, entry.thread_id, entry.reviewed_by, entry.reject_reason, entry.reviewed_at],
    );
}

/** Número seguinte do servidor (sequência partilhada por confissões e respostas). */
async function createConfession(entry: Pick<Confession, "guild_id" | "kind" | "parent_number" | "author_id" | "content">): Promise<Confession> {
    return withTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`confessions:${entry.guild_id}`]);
        const { rows } = await client.query("SELECT COALESCE(MAX(number), 0) + 1 AS n FROM confessions WHERE guild_id = $1", [entry.guild_id]);
        const number = Number(rows[0]?.n ?? 1);
        const inserted = await client.query(
            `INSERT INTO confessions (guild_id, number, kind, parent_number, author_id, content, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING *`,
            [entry.guild_id, number, entry.kind, entry.parent_number, entry.author_id, entry.content, Date.now()],
        );
        return toConfession(inserted.rows[0] as Record<string, unknown>);
    });
}

async function lastConfessionAt(guildId: string, authorId: string): Promise<number> {
    const row = await queryOne<{ at: string | null }>("SELECT MAX(created_at) AS at FROM confessions WHERE guild_id = $1 AND author_id = $2", [guildId, authorId]);
    return Number(row?.at ?? 0);
}

// ─── Vistas ──────────────────────────────────────────────────────────────────

function imageName(entry: Confession, extension: string): string {
    return `confissao-${entry.number}.${extension}`;
}

function title(entry: Confession): string {
    return entry.kind === "reply"
        ? `↪️ ${t("Resposta anónima #{n}", { n: entry.number })} · ${t("à confissão #{p}", { p: entry.parent_number ?? "?" })}`
        : `💬 ${t("Confissão #{n}", { n: entry.number })}`;
}

export function publicView(entry: Confession, settings: ConfessionSettings): ContainerPlusBuilder {
    const container = buildContainer({ color: entry.kind === "reply" ? COLORS.info : COLORS.primary, title: title(entry), description: entry.content });
    if (entry.image_url) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${entry.image_url}`)));
    const buttons: ButtonBuilder[] = [];
    if (entry.kind === "confession" && settings.allow_replies) buttons.push(new ButtonBuilder().setCustomId(cid("reply", entry.number)).setLabel(t("Responder anonimamente")).setEmoji("↪️").setStyle(ButtonStyle.Primary));
    buttons.push(
        new ButtonBuilder().setCustomId(cid("new", 0)).setLabel(t("Confessar")).setEmoji("💬").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(cid("report", entry.number)).setLabel(t("Reportar")).setEmoji(ei("report")).setStyle(ButtonStyle.Secondary),
    );
    container.addActionRowComponents(row(...buttons));
    return container;
}

const REVIEW_STATUS: Record<ConfessionStatus, string> = { pending: "🟡 À espera de aprovação", approved: "✅ Publicada", rejected: "❌ Rejeitada", deleted: "🗑️ Apagada" };

export function reviewView(entry: Confession, guildId: string): ContainerPlusBuilder {
    const posted = entry.posted_message_id && entry.posted_channel_id ? `https://discord.com/channels/${guildId}/${entry.thread_id && entry.kind === "reply" ? entry.thread_id : entry.posted_channel_id}/${entry.posted_message_id}` : null;
    const status = [
        t(REVIEW_STATUS[entry.status]),
        entry.reviewed_by ? t("por {user}", { user: `<@${entry.reviewed_by}>` }) : null,
        entry.reject_reason ? `— ${entry.reject_reason}` : null,
    ].filter(Boolean).join(" ");
    const container = buildContainer({
        color: entry.status === "pending" ? COLORS.warning : entry.status === "approved" ? COLORS.success : COLORS.neutral,
        title: `📝 ${title(entry)}`,
        description: `${entry.content}\n\n-# ${status} · ${timestamp(entry.created_at, "R")}`,
    });
    if (entry.image_url) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${entry.image_url}`)));
    const reveal = new ButtonBuilder().setCustomId(cid("reveal", entry.number)).setLabel(t("Revelar autor (admin)")).setEmoji("🔎").setStyle(ButtonStyle.Secondary);
    if (entry.status === "pending") {
        container.addActionRowComponents(row(
            new ButtonBuilder().setCustomId(cid("approve", entry.number)).setLabel(t("Aprovar")).setEmoji(ei("accept")).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(cid("reject", entry.number)).setLabel(t("Rejeitar")).setEmoji(ei("error")).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(cid("block", entry.number)).setLabel(t("Rejeitar e bloquear autor")).setEmoji("🚫").setStyle(ButtonStyle.Secondary),
            reveal,
        ));
    } else {
        const buttons: ButtonBuilder[] = [];
        if (posted) buttons.push(new ButtonBuilder().setLabel(t("Ver publicação")).setStyle(ButtonStyle.Link).setURL(posted));
        if (entry.status === "approved") buttons.push(new ButtonBuilder().setCustomId(cid("remove", entry.number)).setLabel(t("Apagar publicação")).setEmoji(ei("trash")).setStyle(ButtonStyle.Danger));
        buttons.push(new ButtonBuilder().setCustomId(cid("block", entry.number)).setLabel(t("Bloquear autor")).setEmoji("🚫").setStyle(ButtonStyle.Secondary), reveal);
        container.addActionRowComponents(row(...buttons));
    }
    return container;
}

export function buildConfessionModal(parent: number, allowImages: boolean): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(cid("submit", parent))
        .setTitle(parent ? t("Resposta anónima à #{n}", { n: parent }) : t("Confissão anónima"))
        .addLabelComponents(textField("text", parent ? t("A tua resposta") : t("A tua confissão"), "", {
            required: true,
            paragraph: true,
            max: MAX_CONFESSION,
            placeholder: parent ? t("Ninguém vai saber que foste tu.") : t("Desabafa. Ninguém vai saber que foste tu — nem a equipa."),
        }));
    if (allowImages) modal.addLabelComponents(uploadField("image", t("Imagem (opcional)"), { max: 1 }));
    return modal;
}

// ─── Enviar ──────────────────────────────────────────────────────────────────

async function download(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
    } catch {
        return null;
    }
}

function extensionOf(name: string, contentType: string | null): string {
    return (name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? contentType?.split("/")[1] ?? "png").toLowerCase();
}

async function postPublic(guild: Guild, entry: Confession, settings: ConfessionSettings, image: Buffer | null): Promise<boolean> {
    const channel = settings.channel ? guild.channels.cache.get(settings.channel) : null;
    if (!channel?.isTextBased()) return false;
    const files = image && entry.image_url ? [new AttachmentBuilder(image, { name: entry.image_url })] : [];
    const view = publicView(entry, settings);

    if (entry.kind === "confession") {
        const sent = await (channel as TextChannel).send({ components: [view], files, flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch((error) => { logger.warn("Confissões: falha a publicar:", error); return null; });
        if (!sent) return false;
        entry.posted_channel_id = channel.id;
        entry.posted_message_id = sent.id;
        return true;
    }

    // Resposta: num fio por baixo da confissão (criado na primeira resposta).
    const parent = entry.parent_number ? await getConfession(guild.id, entry.parent_number) : null;
    if (!parent?.posted_message_id || !parent.posted_channel_id) return false;
    let thread = parent.thread_id ? await guild.channels.fetch(parent.thread_id).catch(() => null) : null;
    if (!thread?.isThread()) {
        const original = await (channel as TextChannel).messages.fetch(parent.posted_message_id).catch(() => null);
        if (!original) return false;
        thread = await original.startThread({ name: t("Respostas à confissão #{n}", { n: parent.number }), autoArchiveDuration: 10080 }).catch(() => null);
        if (!thread) return false;
        parent.thread_id = thread.id;
        await updateConfession(parent);
    }
    if (thread.archived) await thread.setArchived(false).catch(() => null);
    const sent = await thread.send({ components: [view], files, flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch(() => null);
    if (!sent) return false;
    entry.posted_channel_id = channel.id;
    entry.thread_id = thread.id;
    entry.posted_message_id = sent.id;
    return true;
}

async function dmAuthor(guild: Guild, entry: Confession, text: string): Promise<void> {
    const user = await guild.client.users.fetch(entry.author_id).catch(() => null);
    await user?.send({ components: [buildContainer({ color: COLORS.primary, title: `💬 ${guild.name}`, description: text })], flags: CV2_FLAG }).catch(() => null);
}

export type SubmitResult = { ok: true; number: number; pending: boolean; url: string | null } | { ok: false; reason: string };

export async function submitConfession(member: GuildMember, rawText: string, uploads: Attachment[], parentNumber: number): Promise<SubmitResult> {
    const guild = member.guild;
    const settings = await getConfessionSettings(guild.id);
    if (!settings.enabled || !settings.channel) return { ok: false, reason: t("As confissões não estão ligadas neste servidor.") };
    if (settings.blocked.includes(member.id)) return { ok: false, reason: t("Não podes enviar confissões neste servidor.") };
    const text = rawText.trim().slice(0, MAX_CONFESSION);
    if (text.length < 5) return { ok: false, reason: t("Escreve um bocadinho mais. 🙂") };

    const wait = settings.cooldown_minutes * 60_000 - (Date.now() - await lastConfessionAt(guild.id, member.id));
    if (wait > 0) return { ok: false, reason: t("Espera {time} antes de enviar outra.", { time: humanizeDuration(wait) }) };
    if (settings.use_word_filter) {
        const banned = findBannedWord(text, (await getProtectionSettings(guild.id)).words);
        if (banned) return { ok: false, reason: t("Isso tem palavras que não são permitidas aqui.") };
    }

    let parent: Confession | null = null;
    if (parentNumber) {
        if (!settings.allow_replies) return { ok: false, reason: t("As respostas anónimas estão desligadas.") };
        parent = await getConfession(guild.id, parentNumber);
        if (!parent || parent.kind !== "confession" || parent.status !== "approved") return { ok: false, reason: t("Essa confissão já não aceita respostas.") };
    }

    const upload = settings.allow_images ? uploads.find((file) => file.contentType?.startsWith("image/") && file.size <= IMAGE_MAX_BYTES) : undefined;
    if (uploads.length && settings.allow_images && !upload) return { ok: false, reason: t("A imagem tem de ser PNG/JPG/GIF/WEBP com até 8 MB.") };
    const image = upload ? await download(upload.url) : null;

    const entry = await createConfession({ guild_id: guild.id, kind: parent ? "reply" : "confession", parent_number: parent?.number ?? null, author_id: member.id, content: text });
    if (image && upload) entry.image_url = imageName(entry, extensionOf(upload.name, upload.contentType));
    appendAuditLog({ guildId: guild.id, actorId: null, action: "confession.create", details: { number: entry.number, kind: entry.kind } });

    const review = settings.review_channel ? guild.channels.cache.get(settings.review_channel) : null;
    if (review?.isTextBased()) {
        const files = image && entry.image_url ? [new AttachmentBuilder(image, { name: entry.image_url })] : [];
        const sent = await (review as TextChannel).send({ components: [reviewView(entry, guild.id)], files, flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch(() => null);
        if (sent) {
            entry.review_message_id = sent.id;
            await updateConfession(entry);
            return { ok: true, number: entry.number, pending: true, url: null };
        }
    }

    // Sem revisão (ou o canal da revisão falhou): publica logo.
    const posted = await postPublic(guild, entry, settings, image);
    if (!posted) {
        entry.status = "deleted";
        await updateConfession(entry);
        return { ok: false, reason: t("Não consegui publicar — avisa a equipa (permissões do bot no canal).") };
    }
    entry.status = "approved";
    entry.reviewed_at = Date.now();
    await updateConfession(entry);
    const url = `https://discord.com/channels/${guild.id}/${entry.kind === "reply" ? entry.thread_id : entry.posted_channel_id}/${entry.posted_message_id}`;
    return { ok: true, number: entry.number, pending: false, url };
}

// ─── Revisão ─────────────────────────────────────────────────────────────────

async function reviewMessage(guild: Guild, entry: Confession, settings: ConfessionSettings): Promise<Message | null> {
    if (!entry.review_message_id || !settings.review_channel) return null;
    const channel = guild.channels.cache.get(settings.review_channel);
    if (!channel?.isTextBased()) return null;
    return (channel as TextChannel).messages.fetch(entry.review_message_id).catch(() => null);
}

async function refreshReview(guild: Guild, entry: Confession, settings: ConfessionSettings): Promise<void> {
    const message = await reviewMessage(guild, entry, settings);
    await message?.edit({ components: [reviewView(entry, guild.id)], allowedMentions: { parse: [] } }).catch(() => null);
}

export async function approveConfession(guild: Guild, entry: Confession, staffId: string): Promise<string | null> {
    const settings = await getConfessionSettings(guild.id);
    if (entry.status !== "pending") return t("Esta já foi tratada.");
    let image: Buffer | null = null;
    if (entry.image_url) {
        const message = await reviewMessage(guild, entry, settings);
        const attachment = message?.attachments.find((file) => file.name === entry.image_url);
        image = attachment ? await download(attachment.url) : null;
        if (!image) entry.image_url = null;
    }
    const posted = await postPublic(guild, entry, settings, image);
    if (!posted) return entry.kind === "reply" ? t("A confissão original já não existe — rejeita esta resposta.") : t("Não consegui publicar no canal das confissões (permissões?).");
    entry.status = "approved";
    entry.reviewed_by = staffId;
    entry.reviewed_at = Date.now();
    await updateConfession(entry);
    await refreshReview(guild, entry, settings);
    await dmAuthor(guild, entry, t("A tua {kind} **#{n}** foi publicada. 💜", { kind: entry.kind === "reply" ? t("resposta") : t("confissão"), n: entry.number }));
    appendAuditLog({ guildId: guild.id, actorId: staffId, action: "confession.approve", details: { number: entry.number } });
    return null;
}

export async function rejectConfession(guild: Guild, entry: Confession, staffId: string, reason: string | null, block = false): Promise<void> {
    const settings = await getConfessionSettings(guild.id);
    if (block && !settings.blocked.includes(entry.author_id)) await saveConfessionSettings(guild.id, { blocked: [...settings.blocked, entry.author_id] });
    if (entry.status === "pending") {
        entry.status = "rejected";
        entry.reviewed_by = staffId;
        entry.reviewed_at = Date.now();
        entry.reject_reason = [reason, block ? t("autor bloqueado") : null].filter(Boolean).join(" · ") || null;
        await updateConfession(entry);
        await dmAuthor(guild, entry, reason ? t("A tua confissão **#{n}** não foi publicada: {reason}", { n: entry.number, reason }) : t("A tua confissão **#{n}** não foi publicada.", { n: entry.number }));
    } else if (block) {
        entry.reject_reason = [entry.reject_reason, t("autor bloqueado")].filter(Boolean).join(" · ");
        await updateConfession(entry);
    }
    await refreshReview(guild, entry, settings);
    appendAuditLog({ guildId: guild.id, actorId: staffId, action: block ? "confession.block" : "confession.reject", details: { number: entry.number } });
}

/** Apaga a publicação (e o fio de respostas, se for uma confissão). */
export async function removeConfession(guild: Guild, entry: Confession, staffId: string): Promise<void> {
    const settings = await getConfessionSettings(guild.id);
    const channelId = entry.kind === "reply" ? entry.thread_id : entry.posted_channel_id;
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (channel?.isTextBased() && entry.posted_message_id) await channel.messages.delete(entry.posted_message_id).catch(() => null);
    if (entry.kind === "confession" && entry.thread_id) {
        const thread = await guild.channels.fetch(entry.thread_id).catch(() => null);
        if (thread?.isThread()) await thread.delete().catch(() => null);
    }
    entry.status = "deleted";
    entry.reviewed_by = staffId;
    entry.reviewed_at = Date.now();
    await updateConfession(entry);
    await refreshReview(guild, entry, settings);
    appendAuditLog({ guildId: guild.id, actorId: staffId, action: "confession.delete", details: { number: entry.number } });
}

/** Denúncia de uma confissão publicada → alerta no canal da revisão (com as ações à mão). */
export async function reportConfession(guild: Guild, entry: Confession, reporterId: string): Promise<boolean> {
    const settings = await getConfessionSettings(guild.id);
    const target = settings.review_channel ?? null;
    const channel = target ? guild.channels.cache.get(target) : null;
    if (!channel?.isTextBased()) return false;
    const view = buildContainer({
        color: COLORS.danger,
        title: `${e("report")} ${t("Confissão #{n} denunciada", { n: entry.number })}`,
        description: `${entry.content.slice(0, 1500)}\n\n-# ${t("Denunciada por {user} · {when}", { user: `<@${reporterId}>`, when: timestamp(Date.now(), "R") })}`,
        rows: [row(
            new ButtonBuilder().setCustomId(cid("remove", entry.number)).setLabel(t("Apagar publicação")).setEmoji(ei("trash")).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(cid("block", entry.number)).setLabel(t("Bloquear autor")).setEmoji("🚫").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(cid("reveal", entry.number)).setLabel(t("Revelar autor (admin)")).setEmoji("🔎").setStyle(ButtonStyle.Secondary),
        )],
    });
    return (channel as TextChannel).send({ components: [view], flags: CV2_FLAG, allowedMentions: { parse: [] } }).then(() => true).catch(() => false);
}

export function buildRejectModal(number: number): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("rejectsave", number)).setTitle(t("Rejeitar confissão #{n}", { n: number })).addLabelComponents(
        textField("reason", t("Motivo (vai para o autor, sem saberes quem é)"), "", { paragraph: true, max: 300 }),
    );
}
