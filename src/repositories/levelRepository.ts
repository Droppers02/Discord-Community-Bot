import { query, queryOne } from "#database";

export interface MemberLevel {
    user_id: string;
    xp: number;
    level: number;
    messages: number;
}

function toMember(row: Record<string, unknown>): MemberLevel {
    return { user_id: String(row.user_id), xp: Number(row.xp), level: Number(row.level), messages: Number(row.messages) };
}

export async function getMemberLevel(guildId: string, userId: string): Promise<MemberLevel | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT user_id, xp, level, messages FROM member_levels WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    return row ? toMember(row) : null;
}

/** Soma XP (e uma mensagem) e devolve o total novo com o nível que estava guardado. */
export async function addMemberXp(guildId: string, userId: string, amount: number, countMessage: boolean, now = Date.now()): Promise<{ xp: number; storedLevel: number }> {
    const row = await queryOne<{ xp: string; level: number }>(
        `INSERT INTO member_levels (guild_id, user_id, xp, level, messages, last_xp_at, updated_at)
         VALUES ($1, $2, GREATEST(0, $3::bigint), 0, $4, $5, $5)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET
             xp = GREATEST(0, member_levels.xp + $3::bigint),
             messages = member_levels.messages + $4,
             last_xp_at = $5, updated_at = $5
         RETURNING xp, level`,
        [guildId, userId, Math.round(amount), countMessage ? 1 : 0, now],
    );
    return { xp: Number(row?.xp ?? 0), storedLevel: Number(row?.level ?? 0) };
}

/** Minutos em voz: soma o tempo (e o XP, se houver) e devolve o total novo com o nível guardado. */
export async function addVoiceTime(guildId: string, userId: string, seconds: number, xp: number, now = Date.now()): Promise<{ xp: number; storedLevel: number }> {
    const row = await queryOne<{ xp: string; level: number }>(
        `INSERT INTO member_levels (guild_id, user_id, xp, level, messages, voice_seconds, last_xp_at, updated_at)
         VALUES ($1, $2, GREATEST(0, $3::bigint), 0, 0, $4, 0, $5)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET
             xp = GREATEST(0, member_levels.xp + $3::bigint),
             voice_seconds = member_levels.voice_seconds + $4,
             updated_at = $5
         RETURNING xp, level`,
        [guildId, userId, Math.round(xp), Math.round(seconds), now],
    );
    return { xp: Number(row?.xp ?? 0), storedLevel: Number(row?.level ?? 0) };
}

export async function setMemberLevelValue(guildId: string, userId: string, level: number): Promise<void> {
    await query("UPDATE member_levels SET level = $3, updated_at = $4 WHERE guild_id = $1 AND user_id = $2", [guildId, userId, level, Date.now()]);
}

export async function setMemberXp(guildId: string, userId: string, xp: number, level: number): Promise<void> {
    await query(
        `INSERT INTO member_levels (guild_id, user_id, xp, level, messages, last_xp_at, updated_at) VALUES ($1, $2, $3, $4, 0, 0, $5)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = $3, level = $4, updated_at = $5`,
        [guildId, userId, Math.max(0, Math.round(xp)), level, Date.now()],
    );
}

export async function topMembers(guildId: string, limit: number, offset: number): Promise<MemberLevel[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT user_id, xp, level, messages FROM member_levels WHERE guild_id = $1 AND xp > 0 ORDER BY xp DESC, user_id ASC LIMIT $2 OFFSET $3",
        [guildId, limit, offset],
    );
    return result.rows.map(toMember);
}

export async function countRankedMembers(guildId: string): Promise<number> {
    const row = await queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM member_levels WHERE guild_id = $1 AND xp > 0", [guildId]);
    return Number(row?.n ?? 0);
}

/** Posição no ranking (1 = primeiro). */
export async function memberRank(guildId: string, xp: number): Promise<number> {
    const row = await queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM member_levels WHERE guild_id = $1 AND xp > $2", [guildId, xp]);
    return Number(row?.n ?? 0) + 1;
}

export async function resetMemberLevel(guildId: string, userId: string): Promise<void> {
    await query("DELETE FROM member_levels WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
}

export async function resetGuildLevels(guildId: string): Promise<number> {
    const result = await query("DELETE FROM member_levels WHERE guild_id = $1", [guildId]);
    return result.rowCount ?? 0;
}
