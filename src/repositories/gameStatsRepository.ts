import { query, queryOne } from "#database";

export type GameOutcome = "win" | "loss" | "draw" | "played";

export interface GameStatRow {
    game: string;
    played: number;
    wins: number;
    losses: number;
    draws: number;
    streak: number;
    best_streak: number;
    best_score: number;
    coins_won: number;
    coins_lost: number;
}

function toRow(row: Record<string, unknown>): GameStatRow {
    return {
        game: String(row.game),
        played: Number(row.played ?? 0),
        wins: Number(row.wins ?? 0),
        losses: Number(row.losses ?? 0),
        draws: Number(row.draws ?? 0),
        streak: Number(row.streak ?? 0),
        best_streak: Number(row.best_streak ?? 0),
        best_score: Number(row.best_score ?? 0),
        coins_won: Number(row.coins_won ?? 0),
        coins_lost: Number(row.coins_lost ?? 0),
    };
}

/**
 * Regista um jogo: soma ao total, à vitória/derrota/empate, mexe na sequência de vitórias
 * (uma derrota corta-a; um empate deixa-a) e guarda o melhor resultado.
 */
export async function recordGame(
    guildId: string,
    userId: string,
    game: string,
    outcome: GameOutcome,
    extra: { score?: number; coinsWon?: number; coinsLost?: number } = {},
): Promise<void> {
    const win = outcome === "win" ? 1 : 0;
    const loss = outcome === "loss" ? 1 : 0;
    const draw = outcome === "draw" ? 1 : 0;
    await query(
        `INSERT INTO game_stats (guild_id, user_id, game, played, wins, losses, draws, streak, best_streak, best_score, coins_won, coins_lost, last_played_at)
         VALUES ($1, $2, $3, 1, $4, $5, $6, $4, $4, $7, $8, $9, $10)
         ON CONFLICT (guild_id, user_id, game) DO UPDATE SET
            played = game_stats.played + 1,
            wins = game_stats.wins + $4,
            losses = game_stats.losses + $5,
            draws = game_stats.draws + $6,
            streak = CASE WHEN $4 = 1 THEN game_stats.streak + 1 WHEN $5 = 1 THEN 0 ELSE game_stats.streak END,
            best_streak = GREATEST(game_stats.best_streak, CASE WHEN $4 = 1 THEN game_stats.streak + 1 ELSE 0 END),
            best_score = GREATEST(game_stats.best_score, $7),
            coins_won = game_stats.coins_won + $8,
            coins_lost = game_stats.coins_lost + $9,
            last_played_at = $10`,
        [guildId, userId, game, win, loss, draw, Math.max(0, Math.round(extra.score ?? 0)), Math.max(0, Math.round(extra.coinsWon ?? 0)), Math.max(0, Math.round(extra.coinsLost ?? 0)), Date.now()],
    );
}

export async function statsOf(guildId: string, userId: string): Promise<GameStatRow[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT game, played, wins, losses, draws, streak, best_streak, best_score, coins_won, coins_lost FROM game_stats WHERE guild_id = $1 AND user_id = $2 ORDER BY played DESC",
        [guildId, userId],
    );
    return result.rows.map(toRow);
}

export async function topForGame(guildId: string, game: string, limit = 10): Promise<Array<GameStatRow & { user_id: string }>> {
    const result = await query<Record<string, unknown>>(
        `SELECT user_id, game, played, wins, losses, draws, streak, best_streak, best_score, coins_won, coins_lost FROM game_stats
         WHERE guild_id = $1 AND game = $2 AND played > 0
         ORDER BY wins DESC, best_score DESC, played ASC LIMIT $3`,
        [guildId, game, limit],
    );
    return result.rows.map((row) => ({ ...toRow(row), user_id: String(row.user_id) }));
}

// ─── Jogos diários (termo do dia) ───────────────────────────────────────────

export async function getDaily(guildId: string, userId: string, game: string, day: string): Promise<{ result: string; attempts: number } | null> {
    const row = await queryOne<{ result: string; attempts: number }>(
        "SELECT result, attempts FROM game_daily WHERE guild_id = $1 AND user_id = $2 AND game = $3 AND day = $4",
        [guildId, userId, game, day],
    );
    return row ? { result: row.result, attempts: Number(row.attempts) } : null;
}

/** Marca o jogo do dia como começado/acabado. Devolve false se já existia (não volta a jogar). */
export async function startDaily(guildId: string, userId: string, game: string, day: string): Promise<boolean> {
    const result = await query(
        `INSERT INTO game_daily (guild_id, user_id, game, day, result, attempts, created_at) VALUES ($1, $2, $3, $4, 'playing', 0, $5)
         ON CONFLICT (guild_id, user_id, game, day) DO NOTHING`,
        [guildId, userId, game, day, Date.now()],
    );
    return (result.rowCount ?? 0) > 0;
}

export async function finishDaily(guildId: string, userId: string, game: string, day: string, result: "win" | "loss", attempts: number): Promise<void> {
    await query(
        "UPDATE game_daily SET result = $5, attempts = $6 WHERE guild_id = $1 AND user_id = $2 AND game = $3 AND day = $4",
        [guildId, userId, game, day, result, attempts],
    );
}

export async function dailyBoard(guildId: string, game: string, day: string): Promise<Array<{ user_id: string; result: string; attempts: number }>> {
    const result = await query<{ user_id: string; result: string; attempts: number }>(
        `SELECT user_id, result, attempts FROM game_daily WHERE guild_id = $1 AND game = $2 AND day = $3 AND result <> 'playing'
         ORDER BY (result = 'win') DESC, attempts ASC, created_at ASC LIMIT 15`,
        [guildId, game, day],
    );
    return result.rows.map((row) => ({ user_id: row.user_id, result: row.result, attempts: Number(row.attempts) }));
}

export async function pruneDaily(beforeDay: string): Promise<void> {
    await query("DELETE FROM game_daily WHERE day < $1", [beforeDay]);
}
