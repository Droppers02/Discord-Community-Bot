import { query, queryOne, withTransaction } from "#database";
import type { SuggestionRecord, SuggestionStatus } from "../types.js";

function rowToSuggestion(row: Record<string, unknown>): SuggestionRecord {
    return {
        id: row.id as string,
        seq: Number(row.seq ?? 0),
        guild_id: row.guild_id as string,
        channel_id: row.channel_id as string,
        message_id: (row.message_id as string) ?? null,
        thread_id: (row.thread_id as string) ?? null,
        author_id: row.author_id as string,
        author_tag: (row.author_tag as string) ?? "",
        anonymous: row.anonymous === true,
        content: row.content as string,
        status: row.status as SuggestionStatus,
        upvotes: Number(row.upvotes ?? 0),
        downvotes: Number(row.downvotes ?? 0),
        staff_id: (row.staff_id as string) ?? null,
        staff_reason: (row.staff_reason as string) ?? null,
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

/** Inserts the suggestion, assigning the next per-guild sequence number atomically. Returns it. */
export async function insertSuggestion(suggestion: SuggestionRecord): Promise<number> {
    return withTransaction(async (client) => {
        const seqRow = await client.query<{ next: string }>(
            "SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM suggestions WHERE guild_id = $1",
            [suggestion.guild_id],
        );
        const seq = Number(seqRow.rows[0]?.next ?? 1);
        await client.query(
            `INSERT INTO suggestions (
                id, seq, guild_id, channel_id, message_id, thread_id, author_id, author_tag, anonymous, content,
                status, upvotes, downvotes, staff_id, staff_reason, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
                suggestion.id, seq, suggestion.guild_id, suggestion.channel_id, suggestion.message_id, suggestion.thread_id,
                suggestion.author_id, suggestion.author_tag, suggestion.anonymous, suggestion.content, suggestion.status, suggestion.upvotes,
                suggestion.downvotes, suggestion.staff_id, suggestion.staff_reason, suggestion.created_at, suggestion.updated_at,
            ],
        );
        return seq;
    });
}

export async function getSuggestionById(id: string): Promise<SuggestionRecord | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT * FROM suggestions WHERE id = $1", [id]);
    return row ? rowToSuggestion(row) : null;
}

export async function updateSuggestionMessage(id: string, messageId: string, threadId: string | null): Promise<void> {
    await query("UPDATE suggestions SET message_id = $2, thread_id = $3 WHERE id = $1", [id, messageId, threadId]);
}

export async function setSuggestionStatus(id: string, status: SuggestionStatus, staffId: string, reason: string | null): Promise<void> {
    await query(
        "UPDATE suggestions SET status = $2, staff_id = $3, staff_reason = $4, updated_at = $5 WHERE id = $1",
        [id, status, staffId, reason, Date.now()],
    );
}

/**
 * Register/replace a member's vote (value: 1 = up, -1 = down; same value toggles it off)
 * and return the freshly recomputed tallies. Done in one transaction so concurrent votes
 * stay consistent.
 */
export async function applyVote(suggestionId: string, userId: string, value: 1 | -1): Promise<{ upvotes: number; downvotes: number } | null> {
    return withTransaction(async (client) => {
        const existing = await client.query<{ value: number }>(
            "SELECT value FROM suggestion_votes WHERE suggestion_id = $1 AND user_id = $2",
            [suggestionId, userId],
        );
        const current = existing.rows[0]?.value;
        if (current === value) {
            await client.query("DELETE FROM suggestion_votes WHERE suggestion_id = $1 AND user_id = $2", [suggestionId, userId]);
        } else {
            await client.query(
                `INSERT INTO suggestion_votes (suggestion_id, user_id, value) VALUES ($1, $2, $3)
                 ON CONFLICT (suggestion_id, user_id) DO UPDATE SET value = $3`,
                [suggestionId, userId, value],
            );
        }

        const tally = await client.query<{ up: string; down: string }>(
            `SELECT
                COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS up,
                COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS down
             FROM suggestion_votes WHERE suggestion_id = $1`,
            [suggestionId],
        );
        const upvotes = Number(tally.rows[0]?.up ?? 0);
        const downvotes = Number(tally.rows[0]?.down ?? 0);

        const updated = await client.query(
            "UPDATE suggestions SET upvotes = $2, downvotes = $3, updated_at = $4 WHERE id = $1",
            [suggestionId, upvotes, downvotes, Date.now()],
        );
        if (updated.rowCount === 0) return null;
        return { upvotes, downvotes };
    });
}
