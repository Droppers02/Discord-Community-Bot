import { query, queryOne } from "#database";
import type { GiveawayBonusRole, GiveawayRecord, GiveawayStatus } from "../types.js";

function rowToGiveaway(row: Record<string, unknown>): GiveawayRecord {
    const bonus = row.bonus_roles;
    const winners = row.winner_ids;
    return {
        id: row.id as string,
        guild_id: row.guild_id as string,
        channel_id: row.channel_id as string,
        message_id: (row.message_id as string) ?? null,
        host_id: row.host_id as string,
        prize: row.prize as string,
        description: (row.description as string) ?? null,
        winners_count: Number(row.winners_count ?? 1),
        status: row.status as GiveawayStatus,
        required_role: (row.required_role as string) ?? null,
        bonus_roles: (Array.isArray(bonus) ? bonus : []) as GiveawayBonusRole[],
        min_account_age_days: Number(row.min_account_age_days ?? 0),
        min_server_age_days: Number(row.min_server_age_days ?? 0),
        require_client: row.require_client === true || row.require_client === "true",
        ends_at: Number(row.ends_at),
        created_at: Number(row.created_at),
        ended_at: row.ended_at !== null && row.ended_at !== undefined ? Number(row.ended_at) : null,
        winner_ids: (Array.isArray(winners) ? winners : []) as string[],
    };
}

export async function insertGiveaway(giveaway: GiveawayRecord): Promise<void> {
    await query(
        `INSERT INTO giveaways (
            id, guild_id, channel_id, message_id, host_id, prize, description, winners_count,
            status, required_role, bonus_roles, min_account_age_days, min_server_age_days, require_client,
            ends_at, created_at, ended_at, winner_ids
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
            giveaway.id, giveaway.guild_id, giveaway.channel_id, giveaway.message_id, giveaway.host_id,
            giveaway.prize, giveaway.description, giveaway.winners_count, giveaway.status, giveaway.required_role,
            JSON.stringify(giveaway.bonus_roles), giveaway.min_account_age_days, giveaway.min_server_age_days,
            giveaway.require_client, giveaway.ends_at,
            giveaway.created_at, giveaway.ended_at, JSON.stringify(giveaway.winner_ids),
        ],
    );
}

export async function getGiveawayById(id: string): Promise<GiveawayRecord | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT * FROM giveaways WHERE id = $1", [id]);
    return row ? rowToGiveaway(row) : null;
}

export async function getRunningGiveaways(): Promise<GiveawayRecord[]> {
    const result = await query<Record<string, unknown>>("SELECT * FROM giveaways WHERE status = 'running' ORDER BY ends_at ASC");
    return result.rows.map(rowToGiveaway);
}

export async function getGiveawaysByGuild(guildId: string, status?: GiveawayStatus): Promise<GiveawayRecord[]> {
    const result = status
        ? await query<Record<string, unknown>>("SELECT * FROM giveaways WHERE guild_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 25", [guildId, status])
        : await query<Record<string, unknown>>("SELECT * FROM giveaways WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 25", [guildId]);
    return result.rows.map(rowToGiveaway);
}

export async function setGiveawayMessage(id: string, messageId: string): Promise<void> {
    await query("UPDATE giveaways SET message_id = $2 WHERE id = $1", [id, messageId]);
}

export async function finishGiveaway(id: string, status: GiveawayStatus, winnerIds: string[]): Promise<void> {
    await query(
        "UPDATE giveaways SET status = $2, winner_ids = $3, ended_at = $4 WHERE id = $1",
        [id, status, JSON.stringify(winnerIds), Date.now()],
    );
}

// ─── Entries ─────────────────────────────────────────────────────────────────
export async function upsertEntry(giveawayId: string, userId: string, entries: number): Promise<void> {
    await query(
        `INSERT INTO giveaway_entries (giveaway_id, user_id, entries, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (giveaway_id, user_id) DO UPDATE SET entries = $3`,
        [giveawayId, userId, entries, Date.now()],
    );
}

export async function removeEntry(giveawayId: string, userId: string): Promise<void> {
    await query("DELETE FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2", [giveawayId, userId]);
}

export async function hasEntry(giveawayId: string, userId: string): Promise<boolean> {
    const row = await queryOne<{ user_id: string }>("SELECT user_id FROM giveaway_entries WHERE giveaway_id = $1 AND user_id = $2", [giveawayId, userId]);
    return row !== null;
}

export async function countEntrants(giveawayId: string): Promise<number> {
    const row = await queryOne<{ cnt: string }>("SELECT COUNT(*) AS cnt FROM giveaway_entries WHERE giveaway_id = $1", [giveawayId]);
    return Number(row?.cnt ?? 0);
}

export async function getEntries(giveawayId: string): Promise<Array<{ user_id: string; entries: number }>> {
    const result = await query<{ user_id: string; entries: number }>(
        "SELECT user_id, entries FROM giveaway_entries WHERE giveaway_id = $1",
        [giveawayId],
    );
    return result.rows.map((row) => ({ user_id: row.user_id, entries: Number(row.entries) }));
}

export interface GiveawayEntryDetail {
    user_id: string;
    entries: number;
    created_at: number;
}

/** Entries with join time, for the staff participants panel (sortable by date/entries). */
export async function getEntriesDetailed(giveawayId: string): Promise<GiveawayEntryDetail[]> {
    const result = await query<{ user_id: string; entries: number; created_at: string }>(
        "SELECT user_id, entries, created_at FROM giveaway_entries WHERE giveaway_id = $1",
        [giveawayId],
    );
    return result.rows.map((row) => ({ user_id: row.user_id, entries: Number(row.entries), created_at: Number(row.created_at) }));
}
