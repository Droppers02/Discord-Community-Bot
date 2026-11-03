import { t } from "../../lib/i18n.js";
import { ButtonBuilder, ButtonStyle, Client, GuildMember, TextChannel } from "discord.js";
import {
    getTicketByChannel,
    getTicketsWithPendingCloseRequest,
    updateTicketByChannel,
} from "../../repositories/ticketRepository.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getEmbedColor, COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG, safeFireAndForget } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";
import { clearManagedTimeout, scheduleManagedTimeout } from "../../lib/scheduler.js";
import type { TicketRecord } from "../../types.js";
import { sendLog } from "../logs/logManager.js";
import { generateTranscript } from "../transcripts/transcriptManager.js";
import { syncTicketOverviewMessage } from "./ticketOverview.js";
import { ValidationError } from "../../errors/index.js";
import { appendAuditLog } from "../../services/auditService.js";

const DEFAULT_CLOSE_REQUEST_HOURS = 120;
const MIN_CLOSE_REQUEST_HOURS = 12;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const closeRequestTimers = new Map<string, NodeJS.Timeout>();

function buildTicketUrl(ticket: TicketRecord) {
    return `https://discord.com/channels/${ticket.guild_id}/${ticket.channel_id}`;
}

function formatRemaining(milliseconds: number) {
    const totalHours = Math.max(0, Math.ceil(milliseconds / (60 * 60 * 1000)));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    if (days > 0 && hours > 0) return `${days}d ${hours}h`;
    if (days > 0) return `${days}d`;
    return `${Math.max(1, totalHours)}h`;
}

export function getDelayHours(value: string | null | undefined): number {
    if (!value?.trim()) return DEFAULT_CLOSE_REQUEST_HOURS;
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isInteger(parsed) || parsed < MIN_CLOSE_REQUEST_HOURS) {
        throw new ValidationError(t("O tempo mínimo para fecho automático é {hours} horas.", { hours: MIN_CLOSE_REQUEST_HOURS }));
    }
    return parsed;
}

export function getNextReminderAt(ticket: TicketRecord): Date | null {
    if (!ticket.close_requested_at || !ticket.close_request_deadline_at) return null;

    const requestedAt = new Date(ticket.close_requested_at);
    const deadlineAt = new Date(ticket.close_request_deadline_at);
    const totalMs = deadlineAt.getTime() - requestedAt.getTime();
    const now = Date.now();

    if (deadlineAt.getTime() <= now) return null;

    if (totalMs < ONE_DAY_MS) {
        if (ticket.close_request_last_reminder_at) return null;
        const reminderAt = new Date(deadlineAt.getTime() - SIX_HOURS_MS);
        return reminderAt.getTime() <= now ? new Date(now) : reminderAt;
    }

    const anchor = ticket.close_request_last_reminder_at ? new Date(ticket.close_request_last_reminder_at).getTime() : requestedAt.getTime();
    const reminderAt = new Date(anchor + ONE_DAY_MS);
    if (reminderAt >= deadlineAt) return null;
    return reminderAt.getTime() <= now ? new Date(now) : reminderAt;
}

function clearTimer(channelId: string) {
    clearManagedTimeout(closeRequestTimers, channelId);
}

/** Cancel a pending close-request timer without touching the database (e.g. channel deleted). */
export function clearCloseRequestTimer(channelId: string): void {
    clearTimer(channelId);
}

export async function clearCloseRequestState(channelId: string): Promise<void> {
    clearTimer(channelId);
    await updateTicketByChannel(channelId, {
        close_request_message: null,
        close_requested_by_id: null,
        close_requested_by_tag: null,
        close_requested_at: null,
        close_request_deadline_at: null,
        close_request_last_reminder_at: null,
    });
}

async function sendReminderDm(ticket: TicketRecord, client: Client) {
    if (!ticket.close_request_deadline_at) return;
    const config = await ensureGuildConfig(ticket.guild_id);
    const user = await client.users.fetch(ticket.owner_id).catch(() => null);
    if (!user) return;

    const remaining = new Date(ticket.close_request_deadline_at).getTime() - Date.now();
    safeFireAndForget(user.send({
        components: [buildContainer({
            color: getEmbedColor(config),
            title: `${emoji.bell} ${t("Ticket a aguardar resposta")}`,
            description: `${t("Existe um ticket a aguardar pela tua resposta. Se não responderes, será encerrado automaticamente dentro de {time}.", { time: formatRemaining(remaining) })}\n\n[${t("Ir para o ticket")}](${buildTicketUrl(ticket)})`,
            footerText: t("Ticket {id}", { id: ticket.id }),
        })],
        flags: CV2_FLAG,
    }));
}

async function closeTicketAutomatically(ticket: TicketRecord, client: Client) {
    const config = await ensureGuildConfig(ticket.guild_id);
    const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
        await clearCloseRequestState(ticket.channel_id);
        return;
    }

    const textChannel = channel as TextChannel;
    const latest = await getTicketByChannel(ticket.channel_id);
    if (!latest || latest.status === "closed") {
        await clearCloseRequestState(ticket.channel_id);
        return;
    }

    const transcriptId = await generateTranscript(textChannel, latest);
    await updateTicketByChannel(textChannel.id, {
        status: "closed",
        transcript_id: transcriptId,
        closed_at: new Date().toISOString(),
        close_request_message: null,
        close_requested_by_id: null,
        close_requested_by_tag: null,
        close_requested_at: null,
        close_request_deadline_at: null,
        close_request_last_reminder_at: null,
    });
    clearTimer(textChannel.id);
    await syncTicketOverviewMessage(textChannel, config);

    safeFireAndForget(textChannel.send({
        components: [buildContainer({
            color: COLORS.danger,
            title: `${emoji.close} ${t("Pedido encerrado")}`,
            description: t("O ticket foi encerrado automaticamente porque não houve resposta ao pedido de fecho da staff dentro do prazo definido."),
            fields: [{ name: t("Transcript"), value: transcriptId ? t("Registo guardado com o ID `{id}`.", { id: transcriptId }) : t("O transcript não ficou disponível.") }],
            footerText: t("Ticket {id}", { id: latest.id }),
        })],
        flags: CV2_FLAG,
    }));

    const user = await client.users.fetch(latest.owner_id).catch(() => null);
    if (user) {
        safeFireAndForget(user.send({
            components: [buildContainer({
                color: getEmbedColor(config),
                title: `${emoji.close} ${t("Ticket encerrado automaticamente")}`,
                description: t("O ticket foi fechado automaticamente pelo sistema porque não houve resposta ao pedido de fecho da staff dentro do tempo definido."),
                footerText: t("Ticket {id}", { id: latest.id }),
            })],
            flags: CV2_FLAG,
        }));
    }

    await sendLog(client, latest.guild_id, "TICKET_CLOSED", {
        description: t("O ticket {id} foi fechado automaticamente por falta de resposta do utilizador ao pedido de fecho.", { id: latest.id }),
        fields: [
            { name: t("Informação do ticket"), value: t("Nome do ticket: {name}\nID do transcript: `{transcript}`\nMotivo: Fecho automático por falta de resposta", { name: textChannel.name, transcript: transcriptId }) },
            { name: t("Informação do criador"), value: t("Criador: {user}\nUsername: {tag}\nID: {id}", { user: `<@${latest.owner_id}>`, tag: latest.owner_tag, id: latest.owner_id }) },
            { name: t("Informação do executor"), value: t("Executor: Sistema automático\nUsername: Sistema automático\nID: sistema") },
        ],
        transcriptId,
    });

    setTimeout(() => {
        safeFireAndForget(textChannel.delete(t("Ticket encerrado automaticamente por falta de resposta do utilizador.")));
    }, 5000);
}

async function processCloseRequest(channelId: string, client: Client) {
    const ticket = await getTicketByChannel(channelId);
    if (!ticket || ticket.status !== "open" || !ticket.close_request_deadline_at) {
        clearTimer(channelId);
        return;
    }

    const deadlineAt = new Date(ticket.close_request_deadline_at).getTime();
    if (Date.now() >= deadlineAt) {
        await closeTicketAutomatically(ticket, client);
        return;
    }

    const nextReminderAt = getNextReminderAt(ticket);
    if (nextReminderAt && nextReminderAt.getTime() <= Date.now()) {
        await sendReminderDm(ticket, client);
        await updateTicketByChannel(channelId, { close_request_last_reminder_at: new Date().toISOString() });
    }

    scheduleCloseRequestForTicket((await getTicketByChannel(channelId)) ?? ticket, client);
}

export function scheduleCloseRequestForTicket(ticket: TicketRecord, client: Client) {
    clearTimer(ticket.channel_id);
    if (!ticket.close_request_deadline_at || ticket.status !== "open") return;

    const deadlineAt = new Date(ticket.close_request_deadline_at).getTime();
    const nextReminderAt = getNextReminderAt(ticket)?.getTime() ?? Number.POSITIVE_INFINITY;
    const nextRunAt = Math.min(deadlineAt, nextReminderAt);
    const delay = Math.max(0, nextRunAt - Date.now());

    scheduleManagedTimeout(closeRequestTimers, ticket.channel_id, delay, () => {
        safeFireAndForget(processCloseRequest(ticket.channel_id, client), (error) => logger.error("Erro ao processar pedido de fecho automático:", error));
    });
}

export async function requestTicketClosure(
    channel: TextChannel,
    ticket: TicketRecord,
    requester: GuildMember,
    message: string,
    hoursInput: string | null | undefined,
): Promise<void> {
    if (ticket.close_request_deadline_at && new Date(ticket.close_request_deadline_at).getTime() > Date.now()) {
        throw new ValidationError(t("Já existe um pedido de fecho pendente para este ticket."));
    }

    const hours = getDelayHours(hoursInput);
    const config = await ensureGuildConfig(ticket.guild_id);
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

    await updateTicketByChannel(channel.id, {
        close_request_message: message,
        close_requested_by_id: requester.id,
        close_requested_by_tag: requester.user.tag,
        close_requested_at: now.toISOString(),
        close_request_deadline_at: deadlineAt,
        close_request_last_reminder_at: null,
    });

    await syncTicketOverviewMessage(channel, config);

    await channel.send({
        components: [buildContainer({
            color: getEmbedColor(config),
            title: `${emoji.open} ${t("Pedido de fecho do ticket")}`,
            description: t("{owner}, {requester} está a pedir para encerrar este ticket. Se não houver resposta, o sistema irá encerrá-lo automaticamente {when}.", { owner: `<@${ticket.owner_id}>`, requester: String(requester), when: `<t:${Math.floor(new Date(deadlineAt).getTime() / 1000)}:R>` }),
            fields: [{ name: t("Mensagem da staff"), value: message.slice(0, 1024) }],
            footerText: t("Ticket {id}", { id: ticket.id }),
            rows: [row(
                new ButtonBuilder().setCustomId(buildCustomId("ticket", "requestclose-accept", ticket.id)).setLabel(t("Aceitar e fechar")).setEmoji(emoji.accept).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(buildCustomId("ticket", "requestclose-decline", ticket.id)).setLabel(t("Manter aberto")).setEmoji(emoji.decline).setStyle(ButtonStyle.Secondary),
            )],
        })],
        flags: CV2_FLAG,
    });

    appendAuditLog({ guildId: ticket.guild_id, actorId: requester.id, action: "ticket.request_close", details: { ticketId: ticket.id, hours } });

    const refreshed = await getTicketByChannel(channel.id);
    if (refreshed) {
        scheduleCloseRequestForTicket(refreshed, channel.client);
    }
}

export async function restoreCloseRequestSchedulers(client: Client): Promise<void> {
    for (const guild of client.guilds.cache.values()) {
        const tickets = await getTicketsWithPendingCloseRequest(guild.id);
        for (const ticket of tickets) {
            scheduleCloseRequestForTicket(ticket, client);
        }
    }
}
