import { query, queryOne } from "#database";

export interface OffenseRecord {
    offenses: number;
    last_offense_at: number;
}

// Reincidence counters decay after this window: an offense older than this no longer
// escalates the punishment ladder (mirrors the reference bot's progressive timeouts).
const OFFENSE_DECAY_MS = 24 * 60 * 60 * 1000;

export async function registerOffense(guildId: string, userId: string): Promise<number> {
    const existing = await queryOne<OffenseRecord>(
        "SELECT offenses, last_offense_at FROM antispam_offenses WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId],
    );
    const now = Date.now();
    const fresh = existing && now - Number(existing.last_offense_at) <= OFFENSE_DECAY_MS;
    const offenses = (fresh ? Number(existing.offenses) : 0) + 1;

    await query(
        `INSERT INTO antispam_offenses (guild_id, user_id, offenses, last_offense_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET offenses = $3, last_offense_at = $4`,
        [guildId, userId, offenses, now],
    );
    return offenses;
}

export async function getOffenseCount(guildId: string, userId: string): Promise<number> {
    const row = await queryOne<OffenseRecord>(
        "SELECT offenses, last_offense_at FROM antispam_offenses WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId],
    );
    if (!row) return 0;
    if (Date.now() - Number(row.last_offense_at) > OFFENSE_DECAY_MS) return 0;
    return Number(row.offenses);
}
