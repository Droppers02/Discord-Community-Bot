import type { Client, TextChannel } from "discord.js";
import { COLORS, getEmbedColor } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG, safeFireAndForget } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { logger } from "../../lib/logger.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getOpenTicketsByGuild, getTicketByChannel, updateTicketByChannel } from "../../repositories/ticketRepository.js";
import { generateTranscript } from "../transcripts/transcriptManager.js";
import { sendLog } from "../logs/logManager.js";
import { openTickets } from "./ticketManager.js";
import { maybeSendRatingPrompt } from "./rating.js";
import { syncTicketOverviewMessage } from "./ticketOverview.js";
import { clearCloseRequestTimer } from "./closeRequestManager.js";
import { t } from "../../lib/i18n.js";

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const DB_WRITE_THROTTLE_MS = 30_000;
const lastActivityWrite = new Map<string, number>();

/** Record activity on an open ticket channel; throttles DB writes but always warms the cache. */
export function touchTicketActivity(channelId: string): void {
    const cached = openTickets.get(channelId);
    if (!cached) return;
    const nowIso = new Date().toISOString();
    openTickets.set(channelId, { ...cached, last_activity_at: nowIso });

    const now = Date.now();
    if ((now - (lastActivityWrite.get(channelId) ?? 0)) < DB_WRITE_THROTTLE_MS) return;
    lastActivityWrite.set(channelId, now);
    safeFireAndForget(updateTicketByChannel(channelId, { last_activity_at: nowIso }));
}

function lastActivityMs(ticket: { last_activity_at: string | null; created_at: string }): number {
    const stamp = ticket.last_activity_at ?? ticket.created_at;
    const parsed = Date.parse(stamp);
    return Number.isFinite(parsed) ? parsed : Date.now();
}

async function autoCloseInactiveTicket(client: Client, channelId: string): Promise<void> {
    const ticket = await getTicketByChannel(channelId);
    if (!ticket || ticket.status === "closed") return;
    const config = await ensureGuildConfig(ticket.guild_id);

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) {
        openTickets.delete(channelId);
        return;
    }
    const textChannel = channel as TextChannel;

    const transcriptId = await generateTranscript(textChannel, ticket);
    await updateTicketByChannel(channelId, { status: "closed", transcript_id: transcriptId, closed_at: new Date().toISOString() });
    clearCloseRequestTimer(channelId);
    openTickets.delete(channelId);
    await syncTicketOverviewMessage(textChannel, config);

    safeFireAndForget(textChannel.send({
        components: [buildContainer({
            color: COLORS.danger,
            title: `${emoji.close} ${t("Ticket encerrado por inatividade")}`,
            description: t("Este ticket foi encerrado automaticamente por falta de atividade."),
            fields: [{ name: t("Transcript"), value: transcriptId ? t("Registo guardado com o ID `{id}`.", { id: transcriptId }) : t("O transcript não ficou disponível.") }],
            footerText: t("Ticket {id}", { id: ticket.id }),
        })],
        flags: CV2_FLAG,
    }));

    safeFireAndForget(client.users.fetch(ticket.owner_id).then((user) => user.send({
        components: [buildContainer({
            color: getEmbedColor(config),
            title: `${emoji.close} ${t("Ticket encerrado por inatividade")}`,
            description: t("O teu ticket foi encerrado automaticamente por falta de atividade."),
            footerText: t("Ticket {id}", { id: ticket.id }),
        })],
        flags: CV2_FLAG,
    })));

    await maybeSendRatingPrompt(client, { ...ticket, status: "closed", transcript_id: transcriptId, closed_at: new Date().toISOString() }, config);

    await sendLog(client, ticket.guild_id, "TICKET_CLOSED", {
        description: t("O ticket {id} foi fechado automaticamente por inatividade.", { id: ticket.id }),
        fields: [
            { name: t("Informação do ticket"), value: t("Nome do ticket: {name}\nID do transcript: `{transcript}`\nMotivo: Inatividade", { name: textChannel.name, transcript: transcriptId }) },
            { name: t("Informação do criador"), value: t("Criador: {user}\nUsername: {tag}\nID: {id}", { user: `<@${ticket.owner_id}>`, tag: ticket.owner_tag, id: ticket.owner_id }) },
            { name: t("Informação do executor"), value: t("Executor: Sistema automático\nID: sistema") },
        ],
        transcriptId,
    });

    setTimeout(() => safeFireAndForget(textChannel.delete(t("Ticket encerrado automaticamente por inatividade."))), 5000);
}

async function sweep(client: Client): Promise<void> {
    for (const guild of client.guilds.cache.values()) {
        const config = await ensureGuildConfig(guild.id).catch(() => null);
        if (!config || config.ticket_auto_close_hours <= 0) continue;

        const thresholdMs = config.ticket_auto_close_hours * 60 * 60 * 1000;
        const tickets = await getOpenTicketsByGuild(guild.id).catch(() => []);
        for (const ticket of tickets) {
            // Skip tickets with an active close-request flow (handled elsewhere).
            if (ticket.close_request_deadline_at) continue;
            if (Date.now() - lastActivityMs(ticket) < thresholdMs) continue;
            await autoCloseInactiveTicket(client, ticket.channel_id).catch((err) => logger.error("Falha ao auto-fechar ticket inativo:", err));
        }
    }
}

export function startInactivitySweep(client: Client): void {
    const timer = setInterval(() => { void sweep(client); }, SWEEP_INTERVAL_MS);
    timer.unref?.();
}
