import { query, queryOne, withTransaction } from "#database";

export const MOD_ACTIONS = ["warn", "timeout", "untimeout", "kick", "ban", "unban", "purge"] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];

export interface ModCase {
    case_number: number;
    user_id: string;
    user_tag: string;
    moderator_id: string;
    action: ModAction;
    reason: string | null;
    duration_seconds: number | null;
    active: boolean;
    created_at: number;
}

function toCase(row: Record<string, unknown>): ModCase {
    return {
        case_number: Number(row.case_number),
        user_id: String(row.user_id),
        user_tag: String(row.user_tag ?? ""),
        moderator_id: String(row.moderator_id),
        action: row.action as ModAction,
        reason: (row.reason as string | null) ?? null,
        duration_seconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
        active: Boolean(row.active),
        created_at: Number(row.created_at),
    };
}

/** Cria um caso com o número seguinte deste servidor (#1, #2, …). */
export async function createCase(guildId: string, input: Omit<ModCase, "case_number" | "active" | "created_at">): Promise<ModCase> {
    return withTransaction(async (client) => {
        const counter = await client.query<{ last_number: number }>(
            `INSERT INTO mod_case_counters (guild_id, last_number) VALUES ($1, 1)
             ON CONFLICT (guild_id) DO UPDATE SET last_number = mod_case_counters.last_number + 1
             RETURNING last_number`,
            [guildId],
        );
        const caseNumber = Number(counter.rows[0]?.last_number ?? 1);
        const result = await client.query<Record<string, unknown>>(
            `INSERT INTO mod_cases (guild_id, case_number, user_id, user_tag, moderator_id, action, reason, duration_seconds, active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9) RETURNING *`,
            [guildId, caseNumber, input.user_id, input.user_tag, input.moderator_id, input.action, input.reason, input.duration_seconds, Date.now()],
        );
        return toCase(result.rows[0]!);
    });
}

export async function getCase(guildId: string, caseNumber: number): Promise<ModCase | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT * FROM mod_cases WHERE guild_id = $1 AND case_number = $2", [guildId, caseNumber]);
    return row ? toCase(row) : null;
}

export async function casesOf(guildId: string, userId: string, limit = 25): Promise<ModCase[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT * FROM mod_cases WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3",
        [guildId, userId, limit],
    );
    return result.rows.map(toCase);
}

/** Avisos que ainda contam (ativos e, se houver prazo, mais recentes do que ele). */
export async function countActiveWarns(guildId: string, userId: string, sinceMs: number): Promise<number> {
    const row = await queryOne<{ n: string }>(
        "SELECT COUNT(*) AS n FROM mod_cases WHERE guild_id = $1 AND user_id = $2 AND action = 'warn' AND active = TRUE AND created_at >= $3",
        [guildId, userId, sinceMs],
    );
    return Number(row?.n ?? 0);
}

export async function setCaseActive(guildId: string, caseNumber: number, active: boolean): Promise<boolean> {
    const result = await query("UPDATE mod_cases SET active = $3 WHERE guild_id = $1 AND case_number = $2", [guildId, caseNumber, active]);
    return (result.rowCount ?? 0) > 0;
}

export async function clearWarns(guildId: string, userId: string): Promise<number> {
    const result = await query("UPDATE mod_cases SET active = FALSE WHERE guild_id = $1 AND user_id = $2 AND action = 'warn' AND active = TRUE", [guildId, userId]);
    return result.rowCount ?? 0;
}
