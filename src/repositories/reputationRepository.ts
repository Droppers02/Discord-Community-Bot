import { queryOne, withTransaction } from "#database";

export async function getReputation(guildId: string, userId: string): Promise<{ points: number; last_given_at: number }> {
    const row = await queryOne<{ points: number; last_given_at: string }>(
        "SELECT points, last_given_at FROM member_reputation WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId],
    );
    return { points: Number(row?.points ?? 0), last_given_at: Number(row?.last_given_at ?? 0) };
}

/**
 * Dá um ponto de reputação de `fromId` a `toId`, se `fromId` já puder (intervalo `cooldownMs`).
 * Devolve os pontos novos de quem recebe, ou o momento em que volta a poder dar.
 */
export async function giveReputation(guildId: string, fromId: string, toId: string, cooldownMs: number): Promise<{ ok: true; points: number } | { ok: false; nextAt: number }> {
    return withTransaction(async (client) => {
        const now = Date.now();
        await client.query(
            "INSERT INTO member_reputation (guild_id, user_id, points, last_given_at, updated_at) VALUES ($1, $2, 0, 0, $3) ON CONFLICT (guild_id, user_id) DO NOTHING",
            [guildId, fromId, now],
        );
        const giver = await client.query<{ last_given_at: string }>("SELECT last_given_at FROM member_reputation WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, fromId]);
        const last = Number(giver.rows[0]?.last_given_at ?? 0);
        if (last && now - last < cooldownMs) return { ok: false as const, nextAt: last + cooldownMs };
        await client.query("UPDATE member_reputation SET last_given_at = $3, updated_at = $3 WHERE guild_id = $1 AND user_id = $2", [guildId, fromId, now]);
        const result = await client.query<{ points: number }>(
            `INSERT INTO member_reputation (guild_id, user_id, points, last_given_at, updated_at) VALUES ($1, $2, 1, 0, $3)
             ON CONFLICT (guild_id, user_id) DO UPDATE SET points = member_reputation.points + 1, updated_at = $3
             RETURNING points`,
            [guildId, toId, now],
        );
        return { ok: true as const, points: Number(result.rows[0]?.points ?? 1) };
    });
}
