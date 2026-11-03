import { query, queryOne } from "#database";
import type { TicketPriority, TicketRecord, TicketStatus } from "../types.js";

const UPDATABLE_COLUMNS = [
    "ticket_message_id",
    "owner_tag",
    "staff_id",
    "staff_tag",
    "category",
    "reason",
    "clip_url",
    "form_responses_json",
    "status",
    "priority",
    "player_identifier",
    "internal_note",
    "transcript_id",
    "first_response_at",
    "last_activity_at",
    "rating",
    "rating_comment",
    "rated_at",
    "feedback_message_id",
    "close_request_message",
    "close_requested_by_id",
    "close_requested_by_tag",
    "close_requested_at",
    "close_request_deadline_at",
    "close_request_last_reminder_at",
    "closed_at",
    "sla_alerted_at",
    "sla_escalated_at",
    "sla_resolution_alerted_at",
] as const;

function rowToTicket(row: Record<string, unknown>): TicketRecord {
    return {
        id: row.id as string,
        ticket_number: row.ticket_number != null ? Number(row.ticket_number) : null,
        guild_id: row.guild_id as string,
        channel_id: row.channel_id as string,
        ticket_message_id: (row.ticket_message_id as string) ?? null,
        owner_id: row.owner_id as string,
        owner_tag: row.owner_tag as string,
        staff_id: (row.staff_id as string) ?? null,
        staff_tag: (row.staff_tag as string) ?? null,
        category: row.category as string,
        reason: row.reason as string,
        clip_url: (row.clip_url as string) ?? null,
        form_responses_json: (row.form_responses_json as string) ?? null,
        status: row.status as TicketStatus,
        priority: (row.priority as TicketPriority) ?? "normal",
        player_identifier: (row.player_identifier as string) ?? null,
        internal_note: (row.internal_note as string) ?? null,
        transcript_id: (row.transcript_id as string) ?? null,
        first_response_at: (row.first_response_at as string) ?? null,
        last_activity_at: (row.last_activity_at as string) ?? null,
        rating: row.rating != null ? Number(row.rating) : null,
        rating_comment: (row.rating_comment as string) ?? null,
        rated_at: (row.rated_at as string) ?? null,
        feedback_message_id: (row.feedback_message_id as string) ?? null,
        close_request_message: (row.close_request_message as string) ?? null,
        close_requested_by_id: (row.close_requested_by_id as string) ?? null,
        close_requested_by_tag: (row.close_requested_by_tag as string) ?? null,
        close_requested_at: (row.close_requested_at as string) ?? null,
        close_request_deadline_at: (row.close_request_deadline_at as string) ?? null,
        close_request_last_reminder_at: (row.close_request_last_reminder_at as string) ?? null,
        created_at: row.created_at as string,
        closed_at: (row.closed_at as string) ?? null,
        sla_alerted_at: (row.sla_alerted_at as string) ?? null,
        sla_escalated_at: (row.sla_escalated_at as string) ?? null,
        sla_resolution_alerted_at: (row.sla_resolution_alerted_at as string) ?? null,
        source: (row.source as string) ?? null,
    };
}

export async function insertTicket(ticket: TicketRecord): Promise<void> {
    await query(
        `INSERT INTO tickets (
            id, guild_id, channel_id, ticket_message_id, owner_id, owner_tag, staff_id, staff_tag,
            category, reason, clip_url, form_responses_json, status, priority, player_identifier, internal_note,
            transcript_id, first_response_at, last_activity_at, rating, rating_comment, rated_at,
            feedback_message_id, close_request_message, close_requested_by_id,
            close_requested_by_tag, close_requested_at, close_request_deadline_at,
            close_request_last_reminder_at, created_at, closed_at, ticket_number, source
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33
        )`,
        [
            ticket.id, ticket.guild_id, ticket.channel_id, ticket.ticket_message_id, ticket.owner_id,
            ticket.owner_tag, ticket.staff_id, ticket.staff_tag, ticket.category, ticket.reason,
            ticket.clip_url, ticket.form_responses_json, ticket.status, ticket.priority, ticket.player_identifier,
            ticket.internal_note, ticket.transcript_id, ticket.first_response_at, ticket.last_activity_at,
            ticket.rating, ticket.rating_comment, ticket.rated_at, ticket.feedback_message_id,
            ticket.close_request_message, ticket.close_requested_by_id, ticket.close_requested_by_tag,
            ticket.close_requested_at, ticket.close_request_deadline_at, ticket.close_request_last_reminder_at,
            ticket.created_at, ticket.closed_at, ticket.ticket_number, ticket.source ?? null,
        ],
    );
}

/**
 * Próximo número de ticket do servidor, numa só instrução (dois tickets abertos ao mesmo
 * tempo nunca recebem o mesmo número). Um servidor que já tinha tickets antes da numeração
 * começa a seguir a eles, não do 1.
 */
export async function nextTicketNumber(guildId: string): Promise<number> {
    const row = await queryOne<{ last_number: number }>(
        `INSERT INTO ticket_counters (guild_id, last_number)
         VALUES ($1, (SELECT COUNT(*) FROM tickets WHERE guild_id = $1) + 1)
         ON CONFLICT (guild_id) DO UPDATE SET last_number = ticket_counters.last_number + 1
         RETURNING last_number`,
        [guildId],
    );
    return Number(row?.last_number ?? 1);
}

export async function getTicketById(id: string): Promise<TicketRecord | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT * FROM tickets WHERE id = $1 LIMIT 1", [id]);
    return row ? rowToTicket(row) : null;
}

export async function searchTickets(guildId: string, focused: string): Promise<TicketRecord[]> {
    const term = `%${focused.trim()}%`;
    const result = await query<Record<string, unknown>>(
        "SELECT * FROM tickets WHERE guild_id = $1 AND (id ILIKE $2 OR owner_tag ILIKE $2 OR category ILIKE $2) ORDER BY created_at DESC LIMIT 25",
        [guildId, term],
    );
    return result.rows.map(rowToTicket);
}

export async function getTicketByChannel(channelId: string): Promise<TicketRecord | null> {
    const row = await queryOne<Record<string, unknown>>(
        "SELECT * FROM tickets WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1",
        [channelId],
    );
    return row ? rowToTicket(row) : null;
}

export async function updateTicketByChannel(channelId: string, patch: Partial<TicketRecord>): Promise<void> {
    const updates = UPDATABLE_COLUMNS.filter((column) => column in patch);
    if (updates.length === 0) return;

    const setClauses = updates.map((column, index) => `${column} = $${index + 2}`);
    const values = updates.map((column) => (patch as Record<string, unknown>)[column] ?? null);

    await query(
        `UPDATE tickets SET ${setClauses.join(", ")} WHERE channel_id = $1`,
        [channelId, ...values],
    );
}

/** Persist a satisfaction rating (and optional comment) against a ticket by its id. */
export async function setTicketRating(id: string, patch: { rating?: number; rating_comment?: string | null; rated_at?: string | null }): Promise<void> {
    const columns = ["rating", "rating_comment", "rated_at"] as const;
    const updates = columns.filter((column) => column in patch);
    if (updates.length === 0) return;
    const setClauses = updates.map((column, index) => `${column} = $${index + 2}`);
    const values = updates.map((column) => (patch as Record<string, unknown>)[column] ?? null);
    await query(`UPDATE tickets SET ${setClauses.join(", ")} WHERE id = $1`, [id, ...values]);
}

/** Remember the feedback card message id so later edits update it instead of re-posting. */
export async function setTicketFeedbackMessage(id: string, messageId: string): Promise<void> {
    await query("UPDATE tickets SET feedback_message_id = $2 WHERE id = $1", [id, messageId]);
}

/** Global satisfaction across every rated ticket in the guild. */
export async function getRatingStats(guildId: string): Promise<{ count: number; average: number }> {
    const row = await queryOne<{ cnt: string; avg: string | null }>(
        "SELECT COUNT(rating) AS cnt, AVG(rating) AS avg FROM tickets WHERE guild_id = $1 AND rating IS NOT NULL",
        [guildId],
    );
    return { count: Number(row?.cnt ?? 0), average: row?.avg ? Number(row.avg) : 0 };
}

export interface StaffRatingSummary {
    staff_id: string;
    count: number;
    average: number;
}

/** Per-staff satisfaction leaderboard (tickets that received a rating), best average first. */
export async function getStaffRatingSummary(guildId: string): Promise<StaffRatingSummary[]> {
    const result = await query<{ staff_id: string; cnt: string; avg: string }>(
        `SELECT staff_id, COUNT(rating) AS cnt, AVG(rating) AS avg
         FROM tickets
         WHERE guild_id = $1 AND rating IS NOT NULL AND staff_id IS NOT NULL
         GROUP BY staff_id
         ORDER BY avg DESC, cnt DESC`,
        [guildId],
    );
    return result.rows.map((row) => ({ staff_id: row.staff_id, count: Number(row.cnt), average: Number(row.avg) }));
}

export async function countOpenTicketsByOwner(guildId: string, ownerId: string): Promise<number> {
    const row = await queryOne<{ cnt: string }>(
        "SELECT COUNT(*) AS cnt FROM tickets WHERE guild_id = $1 AND owner_id = $2 AND status = 'open'",
        [guildId, ownerId],
    );
    return Number(row?.cnt ?? 0);
}

export async function getOpenTicketsByGuild(guildId: string): Promise<TicketRecord[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT * FROM tickets WHERE guild_id = $1 AND status = 'open' ORDER BY created_at ASC",
        [guildId],
    );
    return result.rows.map(rowToTicket);
}

export async function getClosedTicketsByGuild(guildId: string, limit = 500): Promise<TicketRecord[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT * FROM tickets WHERE guild_id = $1 AND status = 'closed' ORDER BY closed_at DESC NULLS LAST LIMIT $2",
        [guildId, limit],
    );
    return result.rows.map(rowToTicket);
}

export async function getTicketsWithPendingCloseRequest(guildId: string): Promise<TicketRecord[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT * FROM tickets WHERE guild_id = $1 AND status = 'open' AND close_request_deadline_at IS NOT NULL",
        [guildId],
    );
    return result.rows.map(rowToTicket);
}

export async function getOpenTicketCategoryBreakdown(guildId: string): Promise<Array<{ category: string; count: number }>> {
    const result = await query<{ category: string; cnt: string }>(
        "SELECT category, COUNT(*) AS cnt FROM tickets WHERE guild_id = $1 AND status = 'open' GROUP BY category ORDER BY cnt DESC",
        [guildId],
    );
    return result.rows.map((row) => ({ category: row.category, count: Number(row.cnt) }));
}

export async function getOpenStaffLoad(guildId: string): Promise<Array<{ staff_id: string; count: number }>> {
    const result = await query<{ staff_id: string; cnt: string }>(
        "SELECT staff_id, COUNT(*) AS cnt FROM tickets WHERE guild_id = $1 AND status = 'open' AND staff_id IS NOT NULL GROUP BY staff_id ORDER BY cnt DESC",
        [guildId],
    );
    return result.rows.map((row) => ({ staff_id: row.staff_id, count: Number(row.cnt) }));
}
