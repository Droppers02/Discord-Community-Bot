import { randomUUID } from "node:crypto";
import {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    FileBuilder,
    PermissionFlagsBits,
    SnowflakeUtil,
    type ButtonInteraction,
    type Guild,
    type GuildMember,
    type GuildTextBasedChannel,
    type Message,
    type RepliableInteraction,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, errorContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import { renderMessagesHtml } from "../transcripts/transcriptManager.js";
import { recordPurge } from "./moderationService.js";
import { describeFilter, markPurgeDeletion, matchesFilter, pastBounds, scanBounds, splitByAge, tally, type PurgeFilter, type PurgeScope } from "./purgeFilters.js";

// /limpar e os atalhos do botão direito. Fluxo: procurar (da mais recente para trás, com filtros)
// → pré-visualizar (quem, onde, quantas, o que fica de fora) → confirmar → guardar uma cópia HTML
// (com as imagens embutidas, que deixam de abrir quando a mensagem é apagada) → apagar → registar
// o caso com a cópia no registo de moderação. Pedidos pequenos (menos de 20, sem antigas) apagam logo.

/** Máximo de mensagens apagadas por pedido. */
export const PURGE_MAX = 1_000;
/** Mensagens com mais de 14 dias: só uma a uma (lento), por isso há um teto. */
export const OLD_MAX = 100;
/** Mensagens vistas por canal à procura das que batem certo com os filtros. */
const MAX_SCAN = 5_000;
/** O mesmo, por canal, quando se limpa um membro em todos os canais. */
const MAX_SCAN_WIDE = 1_000;
/** A partir de quantas mensagens o /limpar pede confirmação. */
const CONFIRM_FROM = 20;
const PENDING_TTL_MS = 5 * 60_000;
const MARK_TTL_MS = 15 * 60_000;
const IMAGE_BUDGET_BYTES = 5 * 1024 * 1024;
const IMAGE_MAX_BYTES = 1024 * 1024;
const PROGRESS_EVERY_MS = 2_500;

export type PurgeInteraction = RepliableInteraction<"cached">;

export interface PurgeRequest {
    channelIds: string[];
    /** Um membro em todos os canais (só com `periodo`). */
    wide: boolean;
    scope: PurgeScope;
    filter: PurgeFilter;
    /** Pedidos do botão direito pedem sempre confirmação. */
    confirm: boolean;
    /** Autor da mensagem escolhida — dá o botão "Só as de X". */
    authorHint: { id: string; name: string } | null;
    /** Links das mensagens de início/fim, para a pré-visualização. */
    fromUrl: string | null;
    toUrl: string | null;
}

export interface PurgePlan {
    /** Da mais recente para a mais antiga. */
    messages: Message[];
    scanned: number;
    pinnedKept: number;
    undeletable: number;
    truncated: boolean;
    channels: number;
}

interface PendingPurge {
    id: string;
    moderatorId: string;
    request: PurgeRequest;
    plan: PurgePlan;
    expiresAt: number;
}

const pending = new Map<string, PendingPurge>();
const busyChannels = new Set<string>();
const rangeMarks = new Map<string, { channelId: string; messageId: string; url: string; at: number }>();

// ─── Canais ───────────────────────────────────────────────────────────────────

/** O bot consegue limpar este canal, e quem pede vê-o? (texto do problema, ou null) */
export function purgeChannelProblem(channel: GuildTextBasedChannel, moderator: GuildMember): string | null {
    const me = channel.guild.members.me;
    const mine = me ? channel.permissionsFor(me) : null;
    if (!mine?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages])) {
        return t("Preciso de **Ver canal**, **Ler histórico** e **Gerir mensagens** em {channel}.", { channel: `<#${channel.id}>` });
    }
    if (!channel.permissionsFor(moderator)?.has(PermissionFlagsBits.ViewChannel)) return t("Não tens acesso a {channel}.", { channel: `<#${channel.id}>` });
    return null;
}

/** Canais (e fios ativos) com mensagens desde `since`, onde o bot pode apagar e quem pede vê. */
export function wideChannels(guild: Guild, moderator: GuildMember, since: number): string[] {
    const ids: string[] = [];
    for (const channel of guild.channels.cache.values()) {
        if (!channel.isTextBased()) continue;
        if (channel.isThread() && channel.archived) continue;
        if (!channel.lastMessageId || SnowflakeUtil.timestampFrom(channel.lastMessageId) < since) continue;
        if (purgeChannelProblem(channel, moderator)) continue;
        ids.push(channel.id);
    }
    return ids;
}

// ─── Procura ──────────────────────────────────────────────────────────────────

async function collectChannel(channel: GuildTextBasedChannel, request: PurgeRequest, limit: number, maxScan: number, onPage: (scanned: number) => Promise<void>) {
    const bounds = scanBounds(request.scope, limit);
    const out = { messages: [] as Message[], scanned: 0, pinnedKept: 0, undeletable: 0, truncated: false };
    let before = bounds.before ?? undefined;
    scan: while (bounds.limit > 0) {
        if (out.scanned >= maxScan) { out.truncated = true; break; }
        const batch = await channel.messages.fetch({ limit: 100, before, cache: false });
        if (!batch.size) break;
        for (const message of batch.values()) {
            out.scanned++;
            if (pastBounds(message, bounds)) break scan;
            if (!matchesFilter(message, request.filter)) continue;
            if (message.pinned && !request.filter.includePinned) { out.pinnedKept++; continue; }
            if (!message.deletable) { out.undeletable++; continue; }
            out.messages.push(message);
            if (out.messages.length >= bounds.limit) {
                // "As últimas N" acaba quando chega a N; o resto parou no teto (pode haver mais).
                out.truncated = request.scope.type !== "recentes";
                break scan;
            }
        }
        if (batch.size < 100) break;
        before = batch.last()!.id;
        await onPage(out.scanned);
    }
    return out;
}

/** Procura as mensagens a apagar (exportada para os testes). */
export async function collectPlan(guild: Guild, request: PurgeRequest, onProgress: (scanned: number) => Promise<void> = async () => {}): Promise<PurgePlan> {
    const plan: PurgePlan = { messages: [], scanned: 0, pinnedKept: 0, undeletable: 0, truncated: false, channels: 0 };
    const queue = request.channelIds
        .map((id) => guild.channels.cache.get(id))
        .filter((channel): channel is GuildTextBasedChannel => Boolean(channel?.isTextBased()));
    const maxScan = request.wide ? MAX_SCAN_WIDE : MAX_SCAN;

    const worker = async () => {
        for (let channel = queue.shift(); channel; channel = queue.shift()) {
            const remaining = PURGE_MAX - plan.messages.length;
            if (remaining <= 0) { plan.truncated = true; return; }
            try {
                const part = await collectChannel(channel, request, remaining, maxScan, (seen) => onProgress(plan.scanned + seen));
                plan.messages.push(...part.messages);
                plan.scanned += part.scanned;
                plan.pinnedKept += part.pinnedKept;
                plan.undeletable += part.undeletable;
                plan.truncated ||= part.truncated;
                plan.channels++;
            } catch (error) {
                logger.warn(`Limpeza: falha a ler ${channel.id}:`, error);
            }
        }
    };
    await Promise.all(Array.from({ length: request.wide ? 4 : 1 }, worker));

    plan.messages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    if (plan.messages.length > PURGE_MAX) {
        plan.messages = plan.messages.slice(0, PURGE_MAX);
        plan.truncated = true;
    }
    return plan;
}

// ─── Vistas ───────────────────────────────────────────────────────────────────

function plural(count: number, one: string, other: string): string {
    return t(`{count, plural, one {${one}} other {${other}}}`, { count });
}

function scopeText(request: PurgeRequest): string {
    const scope = request.scope;
    switch (scope.type) {
        case "recentes": return plural(scope.amount, "a última mensagem", "as últimas # mensagens");
        case "desde": return t("desde {from} (inclusive) até à mais recente", { from: request.fromUrl ?? t("a mensagem escolhida") });
        case "intervalo": return t("de {from} a {to} (as duas inclusive)", { from: request.fromUrl ?? "?", to: request.toUrl ?? "?" });
        case "periodo": return request.wide
            ? t("tudo desde {when}, em todos os canais", { when: timestamp(scope.since, "f") })
            : t("tudo desde {when}", { when: timestamp(scope.since, "f") });
    }
}

function where(channelIds: string[]): string {
    return channelIds.length === 1 ? t("em {channel}", { channel: `<#${channelIds[0]}>` }) : plural(channelIds.length, "em # canal", "em # canais");
}

function topList(entries: Array<[string, number]>, format: (key: string) => string, max = 6): string {
    const shown = entries.slice(0, max).map(([key, count]) => `${format(key)} **${count}**`);
    const rest = entries.slice(max);
    if (rest.length) shown.push(t("+{n} outros ({count})", { n: rest.length, count: rest.reduce((sum, [, count]) => sum + count, 0) }));
    return shown.join(" · ");
}

function notes(plan: PurgePlan, old: number): string[] {
    return [
        plan.pinnedKept ? `${e("pin")} ${plural(plan.pinnedKept, "# fixada fica", "# fixadas ficam")} ${t("(para as apagar também: `/limpar` com `fixadas: True`)")}` : null,
        plan.undeletable ? `${e("info")} ${plural(plan.undeletable, "# mensagem do sistema não se pode apagar", "# mensagens do sistema não se podem apagar")}` : null,
        old ? `${e("clock")} ${plural(old, "# tem mais de 14 dias", "# têm mais de 14 dias")}: ${t("o Discord só as deixa apagar uma a uma (mais lento, até {max} de cada vez).", { max: OLD_MAX })}` : null,
        plan.truncated ? `${e("warn")} ${t("Parei nas {max} — no fim, repete para continuar.", { max: Math.min(plan.messages.length, PURGE_MAX) })}` : null,
    ].filter((line): line is string => Boolean(line));
}

function previewView(entry: PendingPurge): ContainerPlusBuilder {
    const { request, plan } = entry;
    const { bulk, old } = splitByAge(plan.messages);
    const channelIds = tally(plan.messages.map((message) => message.channelId));
    const authors = tally(plan.messages.map((message) => message.author.id));
    const newest = plan.messages[0]!;
    const oldest = plan.messages.at(-1)!;
    const filters = describeFilter(request.filter);

    const buttons: ButtonBuilder[] = [];
    if (bulk.length) {
        buttons.push(new ButtonBuilder().setCustomId(buildCustomId("purge", "ok", entry.id)).setStyle(ButtonStyle.Danger).setEmoji(ei("trash"))
            .setLabel(plural(bulk.length, "Apagar #", "Apagar #")));
    }
    if (old.length) {
        const oldCount = Math.min(old.length, OLD_MAX);
        buttons.push(new ButtonBuilder().setCustomId(buildCustomId("purge", "old", entry.id)).setStyle(ButtonStyle.Danger).setEmoji(ei("clock"))
            .setLabel(bulk.length ? t("Apagar {n} + {old} antigas", { n: bulk.length, old: oldCount }) : t("Apagar {old} antigas (uma a uma)", { old: oldCount })));
    }
    const hint = request.authorHint;
    if (hint && !request.filter.userId && authors.length > 1) {
        buttons.push(new ButtonBuilder().setCustomId(buildCustomId("purge", "only", entry.id)).setStyle(ButtonStyle.Secondary).setEmoji(ei("assign"))
            .setLabel(t("Só as de {name}", { name: hint.name }).slice(0, 80)));
    }
    buttons.push(new ButtonBuilder().setCustomId(buildCustomId("purge", "cancel", entry.id)).setStyle(ButtonStyle.Secondary).setLabel(t("Cancelar")));

    return buildContainer({
        color: COLORS.warning,
        title: `${e("trash")} ${t("Limpeza — confirma")}`,
        description: [
            `**${plural(plan.messages.length, "# mensagem", "# mensagens")}** ${where(channelIds.map(([id]) => id))}`,
            `-# ${t("Critério: {scope}", { scope: scopeText(request) })}`,
            `-# ${t("Mais antiga {oldest} · mais recente {newest} · vi {seen} mensagens", { oldest: timestamp(oldest.createdTimestamp, "f"), newest: timestamp(newest.createdTimestamp, "R"), seen: plan.scanned })}`,
        ].join("\n"),
        fields: [
            { name: t("Quem escreveu"), value: topList(authors, (id) => `<@${id}>`) },
            ...(channelIds.length > 1 ? [{ name: t("Onde"), value: topList(channelIds, (id) => `<#${id}>`) }] : []),
            { name: t("Filtros"), value: filters.length ? filters.join(" · ") : t("nenhum — apaga tudo o que estiver no critério") },
            ...(() => {
                const lines = notes(plan, old.length);
                return lines.length ? [{ name: t("A ter em conta"), value: lines.join("\n") }] : [];
            })(),
        ],
        footerText: t("Fica uma cópia (HTML, com as imagens) no registo de moderação. O pedido expira {when}.", { when: timestamp(entry.expiresAt, "R") }),
        rows: [row(...buttons.slice(0, 5))],
    });
}

function nothingView(request: PurgeRequest, plan: PurgePlan): ContainerPlusBuilder {
    const filters = describeFilter(request.filter);
    return buildContainer({
        color: COLORS.neutral,
        title: `${e("info")} ${t("Nada para apagar")}`,
        description: [
            t("Não encontrei mensagens {where} com esse critério.", { where: where(request.channelIds) }),
            `-# ${t("Critério: {scope}", { scope: scopeText(request) })}${filters.length ? ` · ${filters.join(" · ")}` : ""}`,
            `-# ${plural(plan.scanned, "Vi # mensagem.", "Vi # mensagens.")}`,
            ...notes(plan, 0),
        ].join("\n"),
    });
}

function progressView(text: string): ContainerPlusBuilder {
    return buildContainer({ color: COLORS.info, title: `${e("pending")} ${t("A limpar…")}`, description: text });
}

async function show(interaction: PurgeInteraction, container: ContainerPlusBuilder, files: AttachmentBuilder[] = []): Promise<void> {
    await interaction.editReply({ components: [container], files, flags: CV2_FLAG, allowedMentions: { parse: [] } })
        .catch((error) => logger.warn("Limpeza: falha a atualizar a resposta:", error));
}

// ─── Cópia das mensagens ──────────────────────────────────────────────────────

/** Descarrega as imagens antes de apagar: depois disso o link do Discord deixa de abrir. */
async function downloadImages(messages: Message[]): Promise<Map<string, string>> {
    const images = new Map<string, string>();
    const queue = messages
        .flatMap((message) => [...message.attachments.values()])
        .filter((file) => /^image\/[a-z0-9.+-]+$/i.test(file.contentType ?? "") && file.size <= IMAGE_MAX_BYTES);
    let budget = IMAGE_BUDGET_BYTES;
    const worker = async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
            if (file.size > budget) continue;
            budget -= file.size;
            try {
                const response = await fetch(file.url, { signal: AbortSignal.timeout(8_000) });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = Buffer.from(await response.arrayBuffer());
                images.set(file.id, `data:${file.contentType};base64,${data.toString("base64")}`);
            } catch {
                budget += file.size;
            }
        }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    return images;
}

function lisbon(ms: number): string {
    return new Date(ms).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
}

/** Texto sem markdown/menções do Discord (para o HTML e o nome do ficheiro). */
function plain(guild: Guild, text: string): string {
    return text
        .replace(/<@!?(\d+)>/g, (_match, id: string) => `@${guild.client.users.cache.get(id)?.username ?? id}`)
        .replace(/<#(\d+)>/g, (_match, id: string) => `#${guild.channels.cache.get(id)?.name ?? id}`)
        .replace(/<t:(\d+):\w>/g, (_match, seconds: string) => lisbon(Number(seconds) * 1000))
        .replace(/https:\/\/discord\.com\/channels\/\d+\/\d+\/(\d+)/g, (_match, id: string) => t("mensagem {id}", { id }))
        .replace(/[*`]/g, "");
}

function buildBackup(guild: Guild, moderator: GuildMember, request: PurgeRequest, deleted: Message[], images: Map<string, string>): AttachmentBuilder {
    const messages = [...deleted].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const channelIds = [...new Set(messages.map((message) => message.channelId))];
    const names = channelIds.map((id) => guild.channels.cache.get(id)?.name ?? id);
    const now = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Lisbon" });
    const stamp = `${now.slice(0, 10)}_${now.slice(11, 16).replace(":", "h")}`;
    const slug = (names.length === 1 ? names[0]! : "varios-canais").normalize("NFKD").replace(/[^\w-]+/g, "").toLowerCase().slice(0, 40) || "canal";
    const filters = describeFilter(request.filter);
    const html = renderMessagesHtml({
        title: t("Limpeza · {where}", { where: names.map((name) => `#${name}`).join(", ").slice(0, 80) }),
        heading: t("Mensagens apagadas — {where}", { where: names.length === 1 ? `#${names[0]}` : plural(names.length, "# canal", "# canais") }),
        meta: [
            [t("Servidor"), guild.name],
            [t("Canais"), names.map((name) => `#${name}`).join(", ")],
            [t("Moderador"), `${moderator.user.username} (${moderator.id})`],
            [t("Critério"), plain(guild, scopeText(request))],
            [t("Filtros"), filters.length ? plain(guild, filters.join(" · ")) : t("nenhum")],
            [t("Mensagens"), String(messages.length)],
            [t("Apagadas em"), lisbon(Date.now())],
        ],
        messages,
        showChannel: channelIds.length > 1,
        images,
        footer: t("EPA BOTCHI · as imagens até 1 MB ficam dentro do ficheiro; os outros anexos apontam para o Discord e já podem não abrir."),
    });
    return new AttachmentBuilder(Buffer.from(html, "utf8"), { name: `limpeza-${slug}-${stamp}.html`, description: t("Cópia das mensagens apagadas") });
}

// ─── Apagar ───────────────────────────────────────────────────────────────────

async function executePlan(guild: Guild, plan: PurgePlan, includeOld: boolean, onProgress: (done: number, total: number) => Promise<void>) {
    const byChannel = new Map<string, Message[]>();
    for (const message of plan.messages) byChannel.set(message.channelId, [...(byChannel.get(message.channelId) ?? []), message]);
    const { bulk, old } = splitByAge(plan.messages);
    const total = bulk.length + (includeOld ? Math.min(old.length, OLD_MAX) : 0);
    const deleted: Message[] = [];
    let failed = 0;
    let oldDeleted = 0;
    let oldAttempts = 0;
    let oldSkipped = 0;

    for (const [channelId, messages] of byChannel) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) { failed += messages.length; continue; }
        const split = splitByAge(messages);
        for (let i = 0; i < split.bulk.length; i += 100) {
            const chunk = split.bulk.slice(i, i + 100);
            if (chunk.length === 1) markPurgeDeletion([chunk[0]!.id]);
            try {
                await channel.bulkDelete(chunk.map((message) => message.id), false);
                deleted.push(...chunk);
            } catch (error) {
                failed += chunk.length;
                logger.warn(`Limpeza: falha a apagar em massa em ${channelId}:`, error);
            }
            await onProgress(deleted.length + failed, total);
        }
        for (const message of split.old) {
            if (!includeOld || oldAttempts >= OLD_MAX) { oldSkipped++; continue; }
            oldAttempts++;
            markPurgeDeletion([message.id]);
            try {
                await channel.messages.delete(message.id);
                deleted.push(message);
                oldDeleted++;
            } catch {
                failed++;
            }
            await onProgress(deleted.length + failed, total);
        }
    }
    return { deleted, failed, oldDeleted, oldSkipped };
}

async function runPurge(interaction: PurgeInteraction, entry: PendingPurge, includeOld: boolean): Promise<void> {
    const guild = interaction.guild;
    const moderator = interaction.member;
    const channelIds = [...new Set(entry.plan.messages.map((message) => message.channelId))];
    if (channelIds.some((id) => busyChannels.has(id))) {
        return show(interaction, errorContainer(t("Já está a decorrer uma limpeza num destes canais — espera que acabe.")));
    }
    channelIds.forEach((id) => busyChannels.add(id));
    try {
        await show(interaction, progressView(t("A guardar uma cópia das mensagens…")));
        const images = await downloadImages(entry.plan.messages);

        let lastEdit = 0;
        const result = await executePlan(guild, entry.plan, includeOld, async (done, total) => {
            if (Date.now() - lastEdit < PROGRESS_EVERY_MS) return;
            lastEdit = Date.now();
            await show(interaction, progressView(t("Apagadas {done} de {total}…", { done, total })));
        });
        if (!result.deleted.length) {
            return show(interaction, errorContainer(t("Não consegui apagar nenhuma mensagem — confirma as minhas permissões no canal.")));
        }

        const deletedChannels = [...new Set(result.deleted.map((message) => message.channelId))];
        const filters = describeFilter(entry.request.filter);
        const summary = [
            `${plural(result.deleted.length, "# mensagem", "# mensagens")} ${where(deletedChannels)}`,
            scopeText(entry.request),
            filters.length ? filters.join(" · ") : null,
        ].filter(Boolean).join(" — ").slice(0, 900);
        const backup = buildBackup(guild, moderator, entry.request, result.deleted, images);
        const target = entry.request.filter.userId ? await guild.client.users.fetch(entry.request.filter.userId).catch(() => null) : null;
        const { caseNumber, logged } = await recordPurge(guild, moderator, target, summary, backup);

        const container = buildContainer({
            color: COLORS.success,
            title: `${e("trash")} ${t("Limpeza feita")}`,
            description: [
                `${e("success")} **${plural(result.deleted.length, "# mensagem apagada", "# mensagens apagadas")}** ${where(deletedChannels)}`,
                result.oldDeleted ? `-# ${plural(result.oldDeleted, "# antiga apagada uma a uma", "# antigas apagadas uma a uma")}` : null,
                result.oldSkipped ? `-# ${plural(result.oldSkipped, "# com mais de 14 dias ficou", "# com mais de 14 dias ficaram")}` : null,
                result.failed ? `-# ${plural(result.failed, "# não deu para apagar (já tinha sido apagada?)", "# não deu para apagar (já tinham sido apagadas?)")}` : null,
                entry.plan.truncated ? `-# ${e("warn")} ${t("Havia mais: repete o comando para continuar.")}` : null,
                logged
                    ? `${e("transcript")} ${t("Caso #{n} · a cópia (HTML) ficou no registo de moderação.", { n: caseNumber })}`
                    : `${e("transcript")} ${t("Caso #{n} · não há canal de registo de moderação, por isso a cópia fica aqui:", { n: caseNumber })}`,
            ].filter(Boolean).join("\n"),
        });
        if (!logged) container.addFileComponents(new FileBuilder().setURL(`attachment://${backup.name}`));
        await show(interaction, container, logged ? [] : [backup]);
    } finally {
        channelIds.forEach((id) => busyChannels.delete(id));
    }
}

// ─── Pedidos ──────────────────────────────────────────────────────────────────

function remember(moderatorId: string, request: PurgeRequest, plan: PurgePlan): PendingPurge {
    const now = Date.now();
    for (const [id, entry] of pending) if (entry.expiresAt < now) pending.delete(id);
    const entry: PendingPurge = { id: randomUUID().slice(0, 12), moderatorId, request, plan, expiresAt: now + PENDING_TTL_MS };
    pending.set(entry.id, entry);
    return entry;
}

/** Procura, e apaga logo (pedido pequeno) ou mostra a pré-visualização. A interação já foi adiada. */
export async function startPurge(interaction: PurgeInteraction, request: PurgeRequest): Promise<void> {
    const guild = interaction.guild;
    const moderator = interaction.member;
    if (!request.channelIds.length) return show(interaction, errorContainer(t("Não encontrei canais com mensagens desse período onde eu possa apagar.")));
    if (!request.wide) {
        for (const id of request.channelIds) {
            const channel = guild.channels.cache.get(id);
            if (!channel?.isTextBased()) return show(interaction, errorContainer(t("Nesse canal não há mensagens para apagar.")));
            const problem = purgeChannelProblem(channel, moderator);
            if (problem) return show(interaction, errorContainer(problem));
        }
    } else {
        await show(interaction, progressView(t("A procurar em {count} canais…", { count: request.channelIds.length })));
    }

    let lastEdit = Date.now();
    const plan = await collectPlan(guild, request, async (seen) => {
        if (Date.now() - lastEdit < PROGRESS_EVERY_MS) return;
        lastEdit = Date.now();
        await show(interaction, progressView(t("A procurar… vi {seen} mensagens até agora.", { seen })));
    });
    if (!plan.messages.length) return show(interaction, nothingView(request, plan));

    const entry = remember(moderator.id, request, plan);
    const { bulk, old } = splitByAge(plan.messages);
    if (!request.confirm && !old.length && !plan.truncated && bulk.length < CONFIRM_FROM) {
        pending.delete(entry.id);
        return runPurge(interaction, entry, false);
    }
    await show(interaction, previewView(entry));
}

/** Botões da pré-visualização: purge/<ok|old|only|cancel>/<id>. */
export async function handlePurgeButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const entry = pending.get(id);
    if (!entry || entry.expiresAt < Date.now() || entry.moderatorId !== interaction.user.id) {
        pending.delete(id);
        await interaction.update({ components: [errorContainer(t("Este pedido de limpeza já expirou — volta a usar o /limpar."))], flags: CV2_FLAG }).catch(() => null);
        return;
    }
    pending.delete(id);
    switch (action) {
        case "cancel":
            await interaction.update({ components: [buildContainer({ color: COLORS.neutral, description: `${e("success")} ${t("Limpeza cancelada — não apaguei nada.")}` })], flags: CV2_FLAG });
            return;
        case "only": {
            const hint = entry.request.authorHint;
            await interaction.deferUpdate();
            if (!hint) return;
            await startPurge(interaction, { ...entry.request, filter: { ...entry.request.filter, userId: hint.id }, authorHint: null, confirm: true });
            return;
        }
        case "ok":
        case "old":
            await interaction.deferUpdate();
            await runPurge(interaction, entry, action === "old");
            return;
    }
}

// ─── "Limpar intervalo" pelo botão direito ───────────────────────────────────

/**
 * 1.º uso marca o início; 2.º uso (no mesmo canal, até 15 min) devolve o início para limpar o
 * intervalo. Usar outra vez na mesma mensagem, ou noutro canal, volta a marcar.
 */
export function toggleRangeMark(guildId: string, userId: string, message: Message): { messageId: string; url: string } | null {
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    for (const [other, mark] of rangeMarks) if (now - mark.at > MARK_TTL_MS) rangeMarks.delete(other);
    const mark = rangeMarks.get(key);
    if (mark && mark.channelId === message.channelId && mark.messageId !== message.id) {
        rangeMarks.delete(key);
        return { messageId: mark.messageId, url: mark.url };
    }
    rangeMarks.set(key, { channelId: message.channelId, messageId: message.id, url: message.url, at: now });
    return null;
}

export function rangeMarkedView(message: Message): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.info,
        title: `${e("pin")} ${t("Início marcado")}`,
        description: [
            t("Mensagem de {user} · {when} · {link}", { user: `<@${message.author.id}>`, when: timestamp(message.createdTimestamp, "f"), link: message.url }),
            "",
            t("Agora vai à **última** mensagem a apagar e usa outra vez: botão direito → **Apps** → **Limpar intervalo**."),
            `-# ${t("A marca dura 15 minutos. Antes de apagar mostro tudo para confirmares.")}`,
        ].join("\n"),
    });
}
