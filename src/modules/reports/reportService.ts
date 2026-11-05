import {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    type Attachment,
    type Guild,
    type GuildMember,
    type Message,
    type TextChannel,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { humanizeDuration, timestamp } from "../../lib/time.js";
import { casesOf } from "../../repositories/modCaseRepository.js";
import { appendAuditLog } from "../../services/auditService.js";
import { selectField, textField, uploadField } from "../config/panelKit.js";
import { caseSummary } from "../moderation/memberFile.js";
import { banUser, hierarchyProblem, kickMember, rankProblem, timeoutMember, warnMember } from "../moderation/moderationService.js";
import { getReportSettings, isReportReason, REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason, type ReportSettings } from "./reportSettings.js";

// Denúncias: um membro denuncia uma mensagem (motivo, detalhes, provas) → cartão no canal da
// equipa com a cópia da mensagem (fica, mesmo que seja apagada), as imagens guardadas no próprio
// cartão, o histórico do autor e um menu "Resolver". Várias denúncias da mesma mensagem juntam-se
// no mesmo cartão. Quando a equipa trata, quem denunciou é avisado por DM.

export const REPORT_NS = "report";
const cid = (...parts: Array<string | number>) => buildCustomId(REPORT_NS, ...parts);
const FILE_MAX_BYTES = 4 * 1024 * 1024;
const FILES_BUDGET_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 6;

export type ReportStatus = "open" | "claimed" | "resolved" | "dismissed";

export interface ReportReporter { id: string; reason: ReportReason; details: string | null; at: number }
export interface ReportFile { name: string; source: "message" | "evidence" }

export interface MessageReport {
    id: number;
    guild_id: string;
    channel_id: string;
    message_id: string;
    author_id: string;
    author_tag: string;
    content: string;
    attachments: ReportFile[];
    message_created_at: number;
    reporters: ReportReporter[];
    status: ReportStatus;
    claimed_by: string | null;
    resolved_by: string | null;
    resolution: string | null;
    card_message_id: string | null;
    created_at: number;
    updated_at: number;
}

function toReport(row: Record<string, unknown>): MessageReport {
    return {
        id: Number(row.id),
        guild_id: String(row.guild_id),
        channel_id: String(row.channel_id),
        message_id: String(row.message_id),
        author_id: String(row.author_id),
        author_tag: String(row.author_tag ?? ""),
        content: String(row.content ?? ""),
        attachments: Array.isArray(row.attachments) ? row.attachments as ReportFile[] : [],
        message_created_at: Number(row.message_created_at),
        reporters: Array.isArray(row.reporters) ? row.reporters as ReportReporter[] : [],
        status: row.status as ReportStatus,
        claimed_by: (row.claimed_by as string | null) ?? null,
        resolved_by: (row.resolved_by as string | null) ?? null,
        resolution: (row.resolution as string | null) ?? null,
        card_message_id: (row.card_message_id as string | null) ?? null,
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

export async function getReport(guildId: string, id: number): Promise<MessageReport | null> {
    const row = await queryOne("SELECT * FROM message_reports WHERE guild_id = $1 AND id = $2", [guildId, id]);
    return row ? toReport(row) : null;
}

async function openReportFor(guildId: string, messageId: string): Promise<MessageReport | null> {
    const row = await queryOne("SELECT * FROM message_reports WHERE guild_id = $1 AND message_id = $2 AND status IN ('open', 'claimed') ORDER BY id DESC LIMIT 1", [guildId, messageId]);
    return row ? toReport(row) : null;
}

export async function openReports(guildId: string, limit = 15): Promise<MessageReport[]> {
    const { rows } = await query("SELECT * FROM message_reports WHERE guild_id = $1 AND status IN ('open', 'claimed') ORDER BY id DESC LIMIT $2", [guildId, limit]);
    return rows.map(toReport);
}

async function saveReport(report: MessageReport): Promise<void> {
    await query(
        `UPDATE message_reports SET reporters = $3, attachments = $4, status = $5, claimed_by = $6, resolved_by = $7, resolution = $8, card_message_id = $9, updated_at = $10
         WHERE guild_id = $1 AND id = $2`,
        [report.guild_id, report.id, JSON.stringify(report.reporters), JSON.stringify(report.attachments), report.status, report.claimed_by, report.resolved_by, report.resolution, report.card_message_id, Date.now()],
    );
}

// ─── Resoluções ──────────────────────────────────────────────────────────────

export interface ResolutionPlan { remove: boolean; warn: boolean; timeoutMs: number | null; kick: boolean; ban: boolean }

export const RESOLUTIONS: Array<{ value: string; label: string; emoji: string; plan: ResolutionPlan }> = [
    { value: "delete", label: "Apagar a mensagem", emoji: "🗑️", plan: { remove: true, warn: false, timeoutMs: null, kick: false, ban: false } },
    { value: "delete_warn", label: "Apagar + avisar", emoji: "⚠️", plan: { remove: true, warn: true, timeoutMs: null, kick: false, ban: false } },
    { value: "delete_t10m", label: "Apagar + castigo de 10 min", emoji: "⏲️", plan: { remove: true, warn: false, timeoutMs: 10 * 60_000, kick: false, ban: false } },
    { value: "delete_t1h", label: "Apagar + castigo de 1 hora", emoji: "⏲️", plan: { remove: true, warn: false, timeoutMs: 3_600_000, kick: false, ban: false } },
    { value: "delete_t1d", label: "Apagar + castigo de 1 dia", emoji: "⏲️", plan: { remove: true, warn: false, timeoutMs: 86_400_000, kick: false, ban: false } },
    { value: "warn", label: "Só avisar (a mensagem fica)", emoji: "⚠️", plan: { remove: false, warn: true, timeoutMs: null, kick: false, ban: false } },
    { value: "delete_kick", label: "Apagar + expulsar", emoji: "👢", plan: { remove: true, warn: false, timeoutMs: null, kick: true, ban: false } },
    { value: "delete_ban", label: "Apagar + banir", emoji: "🔨", plan: { remove: true, warn: false, timeoutMs: null, kick: false, ban: true } },
];

export function resolutionLabel(plan: ResolutionPlan): string {
    return [
        plan.remove ? t("mensagem apagada") : null,
        plan.warn ? t("aviso") : null,
        plan.timeoutMs ? t("castigo de {d}", { d: humanizeDuration(plan.timeoutMs) }) : null,
        plan.kick ? t("expulsão") : null,
        plan.ban ? t("banimento") : null,
    ].filter(Boolean).join(" + ") || t("sem ação");
}

/** Motivo mais escolhido pelas pessoas que denunciaram. */
export function mainReason(reporters: ReportReporter[]): ReportReason {
    const counts = new Map<ReportReason, number>();
    for (const reporter of reporters) counts.set(reporter.reason, (counts.get(reporter.reason) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "outro";
}

// ─── Cartão da equipa ────────────────────────────────────────────────────────

const STATUS_LINE: Record<ReportStatus, string> = { open: "🟡 Por tratar", claimed: "🔵 Em análise", resolved: "✅ Resolvida", dismissed: "⚪ Arquivada" };

export async function buildReportCard(guild: Guild, report: MessageReport, settings: ReportSettings): Promise<ContainerPlusBuilder> {
    const cases = await casesOf(guild.id, report.author_id, 50).catch(() => []);
    const previous = await queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM message_reports WHERE guild_id = $1 AND author_id = $2 AND id <> $3", [guild.id, report.author_id, report.id]).catch(() => null);
    const summary = caseSummary(cases);
    const reason = mainReason(report.reporters);
    const done = report.status === "resolved" || report.status === "dismissed";
    const messageUrl = `https://discord.com/channels/${guild.id}/${report.channel_id}/${report.message_id}`;

    const reporters = settings.anonymous
        ? t("{count, plural, one {# pessoa} other {# pessoas}}", { count: report.reporters.length })
        : report.reporters.map((entry) => `<@${entry.id}> (${REPORT_REASON_LABELS[entry.reason].emoji})`).join(", ");
    const details = report.reporters.filter((entry) => entry.details).slice(0, 5).map((entry) => `> ${entry.details!.slice(0, 300).replace(/\n/g, "\n> ")}${settings.anonymous ? "" : ` — <@${entry.id}>`}`);

    let status = `${t(STATUS_LINE[report.status])}`;
    if (report.status === "claimed" && report.claimed_by) status += ` — <@${report.claimed_by}>`;
    if (done && report.resolved_by) status += ` — <@${report.resolved_by}>${report.resolution ? `: ${report.resolution}` : ""}`;
    if (!done && report.resolution) status += `\n${report.resolution}`;

    const container = buildContainer({
        color: done ? (report.status === "resolved" ? COLORS.success : COLORS.neutral) : report.reporters.length >= 3 ? COLORS.danger : COLORS.warning,
        title: `${e("report")} ${t("Denúncia #{id}", { id: report.id })} · ${REPORT_REASON_LABELS[reason].emoji} ${t(REPORT_REASON_LABELS[reason].label)}`,
        description: [
            t("{author} em {channel} · {when}", { author: `<@${report.author_id}> (\`${report.author_tag}\` · ${report.author_id})`, channel: `<#${report.channel_id}>`, when: timestamp(report.message_created_at, "R") }),
            report.content ? `\`\`\`\n${report.content.slice(0, 1500).replace(/```/g, "ˋˋˋ")}\n\`\`\`` : `-# ${t("[sem texto]")}`,
        ].join("\n"),
        fields: [
            { name: t("Denunciada por"), value: `${reporters}${details.length ? `\n${details.join("\n")}` : ""}` },
            { name: t("Histórico do autor"), value: t("Avisos ativos {warns} · castigos {timeouts} · expulsões {kicks} · bans {bans} · outras denúncias {reports}", { warns: summary.activeWarns, timeouts: summary.timeouts, kicks: summary.kicks, bans: summary.bans, reports: Number(previous?.n ?? 0) }) },
            { name: t("Estado"), value: status },
        ],
    });

    const images = report.attachments.filter((file) => /\.(png|jpe?g|gif|webp)$/i.test(file.name));
    if (images.length) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(images.slice(0, 10).map((file) => new MediaGalleryItemBuilder().setURL(`attachment://${file.name}`).setDescription(file.source === "evidence" ? t("Prova enviada por quem denunciou") : t("Anexo da mensagem")))));

    const links = new ButtonBuilder().setLabel(t("Ir para a mensagem")).setStyle(ButtonStyle.Link).setURL(messageUrl);
    const file = new ButtonBuilder().setCustomId(cid("file", report.id)).setLabel(t("Ficha do autor")).setEmoji(ei("id")).setStyle(ButtonStyle.Secondary);
    if (done) {
        container.addActionRowComponents(row(links, file));
        return container;
    }
    container.addActionRowComponents(
        row(new StringSelectMenuBuilder()
            .setCustomId(cid("resolve", report.id))
            .setPlaceholder(t("Resolver…"))
            .addOptions(RESOLUTIONS.map((entry) => ({ label: t(entry.label), value: entry.value, emoji: entry.emoji })))),
        row(
            new ButtonBuilder().setCustomId(cid("claim", report.id)).setLabel(report.status === "claimed" ? t("Largar") : t("Assumir")).setEmoji(ei("assign")).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(cid("dismiss", report.id)).setLabel(t("Arquivar sem ação")).setStyle(ButtonStyle.Secondary),
            file,
            links,
        ),
    );
    return container;
}

// ─── Denunciar ───────────────────────────────────────────────────────────────

export function buildReportModal(channelId: string, messageId: string): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("submit", channelId, messageId)).setTitle(t("Reportar mensagem")).addLabelComponents(
        selectField("reason", t("Motivo"), REPORT_REASONS.map((value) => ({ label: t(REPORT_REASON_LABELS[value].label), value, emoji: REPORT_REASON_LABELS[value].emoji })), null),
        textField("details", t("Detalhes (opcional)"), "", { paragraph: true, max: 800, placeholder: t("O que se passou? Contexto ajuda a equipa a decidir.") }),
        uploadField("evidence", t("Provas (opcional)"), { max: 3, description: t("Capturas de ecrã, até 3.") }),
    );
}

const lastReport = new Map<string, number>();

export function cooldownLeft(guildId: string, userId: string, settings: ReportSettings, now = Date.now()): number {
    const last = lastReport.get(`${guildId}:${userId}`) ?? 0;
    return Math.max(0, last + settings.cooldown_minutes * 60_000 - now);
}

interface PendingFile { url: string; name: string; size: number; contentType: string | null; source: ReportFile["source"] }

async function downloadFiles(files: PendingFile[], reportId: number, offset: number): Promise<{ builders: AttachmentBuilder[]; saved: ReportFile[] }> {
    const builders: AttachmentBuilder[] = [];
    const saved: ReportFile[] = [];
    let budget = FILES_BUDGET_BYTES;
    for (const file of files.slice(0, MAX_FILES)) {
        if (file.size > FILE_MAX_BYTES || file.size > budget) continue;
        try {
            const response = await fetch(file.url, { signal: AbortSignal.timeout(10_000) });
            if (!response.ok) continue;
            const data = Buffer.from(await response.arrayBuffer());
            budget -= data.length;
            const extension = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "bin").toLowerCase();
            const name = `denuncia-${reportId}-${offset + saved.length + 1}.${extension}`;
            builders.push(new AttachmentBuilder(data, { name }));
            saved.push({ name, source: file.source });
        } catch {
            // Sem a prova, a denúncia segue na mesma.
        }
    }
    return { builders, saved };
}

function messageFiles(message: Message): PendingFile[] {
    return [...message.attachments.values()].map((file) => ({ url: file.url, name: file.name, size: file.size, contentType: file.contentType, source: "message" as const }));
}

function evidenceFiles(files: Iterable<Attachment>): PendingFile[] {
    return [...files].map((file) => ({ url: file.url, name: file.name, size: file.size, contentType: file.contentType, source: "evidence" as const }));
}

export type SubmitOutcome = { ok: true; id: number; merged: boolean; hidden: boolean } | { ok: false; reason: string };

/** Regista a denúncia (nova ou junta a uma aberta) e atualiza o cartão da equipa. */
export async function submitReport(reporter: GuildMember, message: Message<true>, reason: ReportReason, details: string | null, evidence: Iterable<Attachment>): Promise<SubmitOutcome> {
    const guild = reporter.guild;
    const settings = await getReportSettings(guild.id);
    if (!settings.enabled || !settings.channel) return { ok: false, reason: t("As denúncias não estão ligadas neste servidor — fala com a equipa por ticket.") };
    const staffChannel = guild.channels.cache.get(settings.channel);
    if (!staffChannel?.isTextBased()) return { ok: false, reason: t("O canal das denúncias já não existe — avisa a equipa.") };
    if (message.author.id === reporter.id) return { ok: false, reason: t("Não podes denunciar uma mensagem tua. 🙂") };
    const wait = cooldownLeft(guild.id, reporter.id, settings);
    if (wait > 0) return { ok: false, reason: t("Espera {time} antes de outra denúncia.", { time: humanizeDuration(wait) }) };

    const entry: ReportReporter = { id: reporter.id, reason, details: details?.slice(0, 800) || null, at: Date.now() };
    let report = await openReportFor(guild.id, message.id);
    let merged = false;
    const newFiles: AttachmentBuilder[] = [];

    if (report) {
        if (report.reporters.some((existing) => existing.id === reporter.id)) return { ok: false, reason: t("Já denunciaste esta mensagem — a equipa está a ver. Obrigado!") };
        merged = true;
        report.reporters.push(entry);
        const { builders, saved } = await downloadFiles(evidenceFiles(evidence), report.id, report.attachments.length);
        newFiles.push(...builders);
        report.attachments.push(...saved);
    } else {
        const now = Date.now();
        const created = await queryOne(
            `INSERT INTO message_reports (guild_id, channel_id, message_id, author_id, author_tag, content, attachments, message_created_at, reporters, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, $7, $8, 'open', $9, $9) RETURNING *`,
            [guild.id, message.channelId, message.id, message.author.id, message.author.username, message.content.slice(0, 4000), message.createdTimestamp, JSON.stringify([entry]), now],
        );
        report = toReport(created!);
        const { builders, saved } = await downloadFiles([...messageFiles(message), ...evidenceFiles(evidence)], report.id, 0);
        newFiles.push(...builders);
        report.attachments = saved;
    }
    lastReport.set(`${guild.id}:${reporter.id}`, Date.now());

    // Muitas pessoas diferentes a denunciar a mesma mensagem: esconde-a já (a cópia fica no cartão).
    let hidden = false;
    if (settings.auto_hide > 0 && report.reporters.length >= settings.auto_hide && !report.resolution) {
        hidden = await message.delete().then(() => true).catch(() => false);
        if (hidden) report.resolution = `🙈 ${t("Mensagem escondida automaticamente ({n} denúncias).", { n: report.reporters.length })}`;
    }

    const card = await buildReportCard(guild, report, settings);
    const channel = staffChannel as TextChannel;
    const existing = report.card_message_id ? await channel.messages.fetch(report.card_message_id).catch(() => null) : null;
    if (existing) {
        await existing.edit({ components: [card], files: newFiles, allowedMentions: { parse: [] } }).catch((error) => logger.warn("Denúncias: falha a atualizar o cartão:", error));
    } else {
        // Os cartões CV2 não levam `content`: a menção à equipa vai numa linha simples antes do cartão.
        if (settings.ping_role) {
            await channel.send({ content: t("{role} nova denúncia (#{id})", { role: `<@&${settings.ping_role}>`, id: report.id }), allowedMentions: { roles: [settings.ping_role] } }).catch(() => null);
        }
        const cardMessage = await channel.send({ components: [card], files: newFiles, flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch((error) => {
            logger.warn("Denúncias: falha a publicar o cartão:", error);
            return null;
        });
        report.card_message_id = cardMessage?.id ?? null;
    }
    await saveReport(report);
    appendAuditLog({ guildId: guild.id, actorId: reporter.id, action: merged ? "report.merge" : "report.create", details: { report: report.id, message: message.id, author: message.author.id, reason } });
    return { ok: true, id: report.id, merged, hidden };
}

// ─── Tratar ──────────────────────────────────────────────────────────────────

async function refreshCard(guild: Guild, report: MessageReport, settings: ReportSettings): Promise<void> {
    if (!settings.channel || !report.card_message_id) return;
    const channel = guild.channels.cache.get(settings.channel);
    if (!channel?.isTextBased()) return;
    const message = await (channel as TextChannel).messages.fetch(report.card_message_id).catch(() => null);
    await message?.edit({ components: [await buildReportCard(guild, report, settings)], allowedMentions: { parse: [] } }).catch(() => null);
}

async function notifyReporters(guild: Guild, report: MessageReport, settings: ReportSettings, acted: boolean): Promise<void> {
    if (!settings.notify_reporter) return;
    const text = acted
        ? t("A tua denúncia **#{id}** em **{server}** foi tratada e a equipa tomou medidas. Obrigado por ajudares a manter o servidor fixe! 💙", { id: report.id, server: guild.name })
        : t("A tua denúncia **#{id}** em **{server}** foi analisada pela equipa e arquivada sem ação. Obrigado na mesma!", { id: report.id, server: guild.name });
    for (const reporter of report.reporters) {
        const user = await guild.client.users.fetch(reporter.id).catch(() => null);
        await user?.send({ components: [buildContainer({ color: acted ? COLORS.success : COLORS.neutral, title: `${e("report")} ${t("Denúncia tratada")}`, description: text })], flags: CV2_FLAG }).catch(() => null);
    }
}

export async function claimReport(guild: Guild, report: MessageReport, staffId: string): Promise<void> {
    const settings = await getReportSettings(guild.id);
    if (report.status === "claimed" && report.claimed_by === staffId) {
        report.status = "open";
        report.claimed_by = null;
    } else {
        report.status = "claimed";
        report.claimed_by = staffId;
    }
    await saveReport(report);
    await refreshCard(guild, report, settings);
}

export async function dismissReport(guild: Guild, report: MessageReport, staffId: string): Promise<void> {
    const settings = await getReportSettings(guild.id);
    report.status = "dismissed";
    report.resolved_by = staffId;
    report.resolution = report.resolution?.startsWith("🙈") ? t("arquivada (a mensagem já tinha sido escondida)") : t("arquivada sem ação");
    await saveReport(report);
    await refreshCard(guild, report, settings);
    await notifyReporters(guild, report, settings, false);
    appendAuditLog({ guildId: guild.id, actorId: staffId, action: "report.dismiss", details: { report: report.id } });
}

/** Aplica a resolução escolhida. Devolve um texto de problema, ou null se correu bem. */
export async function resolveReport(guild: Guild, report: MessageReport, staff: GuildMember, value: string): Promise<string | null> {
    const entry = RESOLUTIONS.find((option) => option.value === value);
    if (!entry) return t("Ação desconhecida.");
    const settings = await getReportSettings(guild.id);
    const plan = entry.plan;
    const reason = t("Denúncia #{id}: {reason}", { id: report.id, reason: t(REPORT_REASON_LABELS[mainReason(report.reporters)].label) });
    const member = await guild.members.fetch(report.author_id).catch(() => null);
    const user = member?.user ?? await guild.client.users.fetch(report.author_id).catch(() => null);

    if ((plan.warn || plan.timeoutMs || plan.kick) && !member) return t("O autor já não está no servidor — usa «Apagar a mensagem» ou «Apagar + banir».");
    if (member && (plan.warn || plan.timeoutMs || plan.kick || plan.ban)) {
        const problem = plan.warn && !plan.timeoutMs && !plan.kick && !plan.ban
            ? rankProblem(staff, member)
            : hierarchyProblem(staff, member, plan.ban ? "ban" : plan.kick ? "kick" : "moderate");
        if (problem) return problem;
    }

    const done: string[] = [];
    if (plan.remove) {
        const channel = guild.channels.cache.get(report.channel_id);
        const message = channel?.isTextBased() ? await channel.messages.fetch(report.message_id).catch(() => null) : null;
        if (message) await message.delete().then(() => done.push(t("mensagem apagada"))).catch(() => null);
        else done.push(t("a mensagem já não existia"));
    }
    try {
        if (plan.warn && member) { const result = await warnMember(member, staff, reason); done.push(t("aviso (caso #{n})", { n: result.entry.case_number })); }
        if (plan.timeoutMs && member) { const result = await timeoutMember(member, staff, plan.timeoutMs, reason); done.push(t("castigo de {d} (caso #{n})", { d: humanizeDuration(plan.timeoutMs), n: result.entry.case_number })); }
        if (plan.kick && member) { const result = await kickMember(member, staff, reason); done.push(t("expulsão (caso #{n})", { n: result.entry.case_number })); }
        if (plan.ban && user) { const result = await banUser(guild, user, staff, reason, 1); done.push(t("ban (caso #{n})", { n: result.entry.case_number })); }
    } catch (error) {
        logger.warn("Denúncias: falha a aplicar a ação:", error);
        return t("A ação falhou — confirma as permissões do bot.");
    }

    report.status = "resolved";
    report.resolved_by = staff.id;
    report.resolution = done.join(" · ") || resolutionLabel(plan);
    await saveReport(report);
    await refreshCard(guild, report, settings);
    await notifyReporters(guild, report, settings, true);
    appendAuditLog({ guildId: guild.id, actorId: staff.id, action: "report.resolve", details: { report: report.id, resolution: value } });
    return null;
}

export function openReportsView(guildId: string, reports: MessageReport[], channelId: string | null): ContainerPlusBuilder {
    return buildContainer({
        color: reports.length ? COLORS.warning : COLORS.success,
        title: `${e("report")} ${t("Denúncias por tratar")}`,
        description: reports.length
            ? reports.map((report) => {
                const link = channelId && report.card_message_id ? `https://discord.com/channels/${guildId}/${channelId}/${report.card_message_id}` : null;
                const label = `#${report.id}`;
                return `${report.status === "claimed" ? "🔵" : "🟡"} ${link ? `[${label}](${link})` : label} · <@${report.author_id}> · ${REPORT_REASON_LABELS[mainReason(report.reporters)].emoji} · ${t("{n} pessoas", { n: report.reporters.length })} · ${timestamp(report.created_at, "R")}`;
            }).join("\n")
            : t("Nada por tratar. 🎉"),
    });
}

export { isReportReason };
