import { query, queryOne } from "#database";

// Rankings do servidor. Cada tipo tem o SEU SQL fixo (sem concatenar nada vindo de fora).

export const RANKING_TYPES = ["xp", "coins", "games", "rep", "voice", "messages"] as const;
export type RankingType = (typeof RANKING_TYPES)[number];

export interface RankingRow {
    user_id: string;
    value: number;
}

const SQL: Record<RankingType, { page: string; count: string; position: string; own: string }> = {
    xp: {
        page: "SELECT user_id, xp AS value FROM member_levels WHERE guild_id = $1 AND xp > 0 ORDER BY xp DESC, user_id ASC LIMIT $2 OFFSET $3",
        count: "SELECT COUNT(*) AS n FROM member_levels WHERE guild_id = $1 AND xp > 0",
        position: "SELECT COUNT(*) AS n FROM member_levels WHERE guild_id = $1 AND xp > $2",
        own: "SELECT xp AS value FROM member_levels WHERE guild_id = $1 AND user_id = $2",
    },
    messages: {
        page: "SELECT user_id, messages AS value FROM member_levels WHERE guild_id = $1 AND messages > 0 ORDER BY messages DESC, user_id ASC LIMIT $2 OFFSET $3",
        count: "SELECT COUNT(*) AS n FROM member_levels WHERE guild_id = $1 AND messages > 0",
        position: "SELECT COUNT(*) AS n FROM member_levels WHERE guild_id = $1 AND messages > $2",
        own: "SELECT messages AS value FROM member_levels WHERE guild_id = $1 AND user_id = $2",
    },
    voice: {
        page: "SELECT user_id, voice_seconds AS value FROM member_levels WHERE guild_id = $1 AND voice_seconds > 0 ORDER BY voice_seconds DESC, user_id ASC LIMIT $2 OFFSET $3",
        count: "SELECT COUNT(*) AS n FROM member_levels WHERE guild_id = $1 AND voice_seconds > 0",
        position: "SELECT COUNT(*) AS n FROM member_levels WHERE guild_id = $1 AND voice_seconds > $2",
        own: "SELECT voice_seconds AS value FROM member_levels WHERE guild_id = $1 AND user_id = $2",
    },
    coins: {
        page: "SELECT user_id, balance AS value FROM economy_accounts WHERE guild_id = $1 AND balance > 0 ORDER BY balance DESC, user_id ASC LIMIT $2 OFFSET $3",
        count: "SELECT COUNT(*) AS n FROM economy_accounts WHERE guild_id = $1 AND balance > 0",
        position: "SELECT COUNT(*) AS n FROM economy_accounts WHERE guild_id = $1 AND balance > $2",
        own: "SELECT balance AS value FROM economy_accounts WHERE guild_id = $1 AND user_id = $2",
    },
    rep: {
        page: "SELECT user_id, points AS value FROM member_reputation WHERE guild_id = $1 AND points > 0 ORDER BY points DESC, user_id ASC LIMIT $2 OFFSET $3",
        count: "SELECT COUNT(*) AS n FROM member_reputation WHERE guild_id = $1 AND points > 0",
        position: "SELECT COUNT(*) AS n FROM member_reputation WHERE guild_id = $1 AND points > $2",
        own: "SELECT points AS value FROM member_reputation WHERE guild_id = $1 AND user_id = $2",
    },
    games: {
        page: `SELECT user_id, SUM(wins) AS value FROM game_stats WHERE guild_id = $1 GROUP BY user_id HAVING SUM(wins) > 0
               ORDER BY value DESC, user_id ASC LIMIT $2 OFFSET $3`,
        count: "SELECT COUNT(*) AS n FROM (SELECT user_id FROM game_stats WHERE guild_id = $1 GROUP BY user_id HAVING SUM(wins) > 0) t",
        position: "SELECT COUNT(*) AS n FROM (SELECT user_id FROM game_stats WHERE guild_id = $1 GROUP BY user_id HAVING SUM(wins) > $2) t",
        own: "SELECT COALESCE(SUM(wins), 0) AS value FROM game_stats WHERE guild_id = $1 AND user_id = $2",
    },
};

export async function rankingPage(guildId: string, type: RankingType, limit: number, offset: number): Promise<RankingRow[]> {
    const result = await query<{ user_id: string; value: string }>(SQL[type].page, [guildId, limit, offset]);
    return result.rows.map((row) => ({ user_id: row.user_id, value: Number(row.value) }));
}

export async function rankingCount(guildId: string, type: RankingType): Promise<number> {
    const row = await queryOne<{ n: string }>(SQL[type].count, [guildId]);
    return Number(row?.n ?? 0);
}

/** Valor e posição de um membro (null se ainda não entra neste ranking). */
export async function rankingOf(guildId: string, type: RankingType, userId: string): Promise<{ value: number; position: number } | null> {
    const own = await queryOne<{ value: string | null }>(SQL[type].own, [guildId, userId]);
    const value = Number(own?.value ?? 0);
    if (value <= 0) return null;
    const above = await queryOne<{ n: string }>(SQL[type].position, [guildId, value]);
    return { value, position: Number(above?.n ?? 0) + 1 };
}
