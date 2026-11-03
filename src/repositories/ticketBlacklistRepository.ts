import { query, queryOne } from "#database";

export interface BlacklistEntry {
    guild_id: string;
    user_id: string;
    reason: string | null;
    added_by: string | null;
    created_at: string;
}

// Small hot cache of blacklisted user ids per guild so the open path avoids a DB hit.
const cache = new Map<string, Set<string>>();

function cacheKey(guildId: string): string {
    return guildId;
}

async function ensureGuildCache(guildId: string): Promise<Set<string>> {
    const existing = cache.get(cacheKey(guildId));
    if (existing) return existing;
    const result = await query<{ user_id: string }>("SELECT user_id FROM ticket_blacklist WHERE guild_id = $1", [guildId]);
    const set = new Set(result.rows.map((row) => row.user_id));
    cache.set(cacheKey(guildId), set);
    return set;
}

export async function isBlacklisted(guildId: string, userId: string): Promise<boolean> {
    const set = await ensureGuildCache(guildId);
    return set.has(userId);
}

export async function addToBlacklist(guildId: string, userId: string, reason: string | null, addedBy: string | null): Promise<void> {
    await query(
        `INSERT INTO ticket_blacklist (guild_id, user_id, reason, added_by, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, added_by = EXCLUDED.added_by`,
        [guildId, userId, reason, addedBy, new Date().toISOString()],
    );
    (await ensureGuildCache(guildId)).add(userId);
}

export async function removeFromBlacklist(guildId: string, userId: string): Promise<boolean> {
    const row = await queryOne<{ user_id: string }>("DELETE FROM ticket_blacklist WHERE guild_id = $1 AND user_id = $2 RETURNING user_id", [guildId, userId]);
    (await ensureGuildCache(guildId)).delete(userId);
    return Boolean(row);
}

export async function listBlacklist(guildId: string): Promise<BlacklistEntry[]> {
    const result = await query<BlacklistEntry>(
        "SELECT guild_id, user_id, reason, added_by, created_at FROM ticket_blacklist WHERE guild_id = $1 ORDER BY created_at DESC",
        [guildId],
    );
    return result.rows;
}

/** Drop the cached blacklist for a guild (e.g. after a data wipe). */
export function evictBlacklistCache(guildId: string): void {
    cache.delete(cacheKey(guildId));
}

/** Clear every guild's cached blacklist (e.g. after a global data wipe). */
export function clearAllBlacklistCache(): void {
    cache.clear();
}
