import { ButtonBuilder, ButtonStyle, type Client, type TextChannel } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t, withGuildLocale } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { humanizeDuration } from "../../lib/time.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { updateTicketByChannel } from "../../repositories/ticketRepository.js";
import { isAllowedGuild } from "../../config.js";
import type { GuildConfig, TicketPriority, TicketRecord } from "../../types.js";
import { getCategoryLabel } from "../tickets/categories.js";
import { isSupportOffline } from "../tickets/officeHours.js";
import { priorityLabel } from "../tickets/priorities.js";
import { formatTicketNumber } from "../tickets/ticketOverview.js";
import { openTickets } from "../tickets/ticketManager.js";
import { getSlaSettings, type SlaSettings } from "./slaSettings.js";

// Monitor dos avisos de SLA: de minuto a minuto, percorre os tickets abertos (já em memória)
// e avisa uma só vez por etapa — a marca fica no ticket (sla_alerted_at, …), por isso um
// reinício não repete avisos.

const CHECK_INTERVAL_MS = 60_000;
let timer: NodeJS.Timeout | null = null;

export type SlaEvent = "first" | "escalate" | "resolution";

type SlaConfig = Pick<GuildConfig, "sla_first_response_minutes" | "sla_resolution_hours" | "support_hours_json">;

/** Meta de primeira resposta (minutos) para a prioridade do ticket. */
export function firstResponseTarget(priority: TicketPriority | null | undefined, settings: SlaSettings, config: SlaConfig): number {
    const own = settings.priority_minutes[priority ?? "normal"];
    return own ?? Math.max(1, config.sla_first_response_minutes ?? 15);
}

/** As etapas de SLA que este ticket acabou de atingir e ainda não foram avisadas. */
export function dueSlaEvents(ticket: TicketRecord, settings: SlaSettings, config: SlaConfig, now: number): SlaEvent[] {
    if (!settings.enabled || ticket.status !== "open") return [];
    if (settings.office_hours_only && isSupportOffline(config, new Date(now))) return [];
    const ageMin = (now - Date.parse(ticket.created_at)) / 60_000;
    if (!Number.isFinite(ageMin)) return [];
    const events: SlaEvent[] = [];
    const target = firstResponseTarget(ticket.priority, settings, config);
    if (!ticket.first_response_at) {
        if (!ticket.sla_alerted_at && ageMin >= target) events.push("first");
        else if (ticket.sla_alerted_at && !ticket.sla_escalated_at && settings.escalate_after_minutes > 0 && ageMin >= target + settings.escalate_after_minutes) events.push("escalate");
    }
    const resolutionMin = Math.max(1, config.sla_resolution_hours ?? 24) * 60;
    if (settings.resolution_alert && !ticket.sla_resolution_alerted_at && ageMin >= resolutionMin) events.push("resolution");
    return events;
}

function ticketName(ticket: TicketRecord): string {
    return ticket.ticket_number ? formatTicketNumber(ticket.ticket_number) : `<#${ticket.channel_id}>`;
}

function alertContainer(ticket: TicketRecord, config: GuildConfig, settings: SlaSettings, event: SlaEvent, now: number) {
    const waited = humanizeDuration(now - Date.parse(ticket.created_at));
    const target = firstResponseTarget(ticket.priority, settings, config);
    const copy = {
        first: {
            color: COLORS.warning,
            title: `${e("hourglass")} ${t("Ticket sem resposta")}`,
            text: t("O ticket {ticket} está à espera de resposta há **{waited}** (meta: {target}).", { ticket: ticketName(ticket), waited, target: humanizeDuration(target * 60_000) }),
        },
        escalate: {
            color: COLORS.danger,
            title: `${e("flame")} ${t("Ticket continua sem resposta")}`,
            text: t("O ticket {ticket} continua sem resposta há **{waited}**. Alguém tem de o assumir.", { ticket: ticketName(ticket), waited }),
        },
        resolution: {
            color: COLORS.danger,
            title: `${e("clock")} ${t("Ticket aberto há demasiado tempo")}`,
            text: t("O ticket {ticket} está aberto há **{waited}** — passou a meta de resolução ({target}).", { ticket: ticketName(ticket), waited, target: humanizeDuration(Math.max(1, config.sla_resolution_hours ?? 24) * 3_600_000) }),
        },
    }[event];
    return buildContainer({
        color: copy.color,
        title: copy.title,
        description: copy.text,
        fields: [
            { name: t("Prioridade"), value: priorityLabel(ticket.priority) },
            { name: t("Categoria"), value: getCategoryLabel(config, ticket.category) },
            { name: t("Aberto por"), value: `<@${ticket.owner_id}>` },
        ],
        rows: [row(new ButtonBuilder()
            .setLabel(t("Ir para o ticket"))
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${ticket.guild_id}/${ticket.channel_id}`))],
    });
}

async function sendTo(client: Client<true>, channelId: string, payload: ReturnType<typeof alertContainer>, mention: string | null): Promise<void> {
    const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    await (channel as TextChannel).send({ components: [payload], flags: CV2_FLAG }).catch(() => null);
    // As mensagens CV2 não levam `content`: a menção vai numa mensagem curta à parte.
    if (mention) await (channel as TextChannel).send({ content: mention, allowedMentions: { parse: ["roles"] } }).catch(() => null);
}

async function alert(client: Client<true>, ticket: TicketRecord, config: GuildConfig, settings: SlaSettings, event: SlaEvent, now: number): Promise<void> {
    const roleId = event === "escalate"
        ? settings.escalate_role ?? config.admin_role ?? settings.mention_role ?? config.staff_role
        : settings.mention_role ?? config.staff_role;
    const mention = roleId ? `<@&${roleId}>` : null;
    const container = alertContainer(ticket, config, settings, event, now);
    if (settings.alert_channel) await sendTo(client, settings.alert_channel, container, mention);
    // Sem canal da equipa, o aviso vai sempre para o ticket (senão ninguém o via).
    if (settings.alert_in_ticket || !settings.alert_channel) await sendTo(client, ticket.channel_id, container, settings.alert_channel ? null : mention);
}

const MARK: Record<SlaEvent, "sla_alerted_at" | "sla_escalated_at" | "sla_resolution_alerted_at"> = {
    first: "sla_alerted_at",
    escalate: "sla_escalated_at",
    resolution: "sla_resolution_alerted_at",
};

async function checkAll(client: Client<true>): Promise<void> {
    const now = Date.now();
    const settingsByGuild = new Map<string, SlaSettings | null>();
    for (const [channelId, ticket] of openTickets) {
        if (!isAllowedGuild(ticket.guild_id)) continue;
        let settings = settingsByGuild.get(ticket.guild_id);
        if (settings === undefined) {
            settings = await getSlaSettings(ticket.guild_id).catch(() => null);
            settingsByGuild.set(ticket.guild_id, settings);
        }
        if (!settings?.enabled) continue;
        const config = await ensureGuildConfig(ticket.guild_id).catch(() => null);
        if (!config) continue;
        const events = dueSlaEvents(ticket, settings, config, now);
        if (events.length === 0) continue;
        // Marca primeiro: se o envio falhar a meio, não se repete o aviso a cada minuto.
        const stamp = new Date(now).toISOString();
        const patch = Object.fromEntries(events.map((event) => [MARK[event], stamp])) as Partial<TicketRecord>;
        await updateTicketByChannel(channelId, patch);
        openTickets.set(channelId, { ...ticket, ...patch });
        await withGuildLocale(ticket.guild_id, async () => {
            for (const event of events) await alert(client, ticket, config, settings as SlaSettings, event, now);
        });
    }
}

export function startSlaMonitor(client: Client<true>): void {
    if (timer) return;
    timer = setInterval(() => void checkAll(client).catch((err) => logger.warn("SLA: falha na verificação:", err)), CHECK_INTERVAL_MS);
    timer.unref?.();
}
