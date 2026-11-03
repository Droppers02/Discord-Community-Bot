import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "#database";

// Contas de EPA Coins. Cada mexida no saldo é UMA instrução SQL (UPDATE + linha no histórico
// num só CTE), com a condição `balance + delta >= 0` — duas apostas ao mesmo tempo nunca
// deixam o saldo negativo, e o histórico nunca fica desencontrado do saldo.

export interface EconomyAccount {
    user_id: string;
    balance: number;
    total_earned: number;
    total_spent: number;
    daily_streak: number;
    best_daily_streak: number;
    last_daily_at: number;
    last_work_at: number;
}

export interface LedgerEntry {
    amount: number;
    balance_after: number;
    kind: string;
    note: string | null;
    created_at: number;
}

function toAccount(row: Record<string, unknown>): EconomyAccount {
    return {
        user_id: String(row.user_id),
        balance: Number(row.balance ?? 0),
        total_earned: Number(row.total_earned ?? 0),
        total_spent: Number(row.total_spent ?? 0),
        daily_streak: Number(row.daily_streak ?? 0),
        best_daily_streak: Number(row.best_daily_streak ?? 0),
        last_daily_at: Number(row.last_daily_at ?? 0),
        last_work_at: Number(row.last_work_at ?? 0),
    };
}

const ACCOUNT_COLUMNS = "user_id, balance, total_earned, total_spent, daily_streak, best_daily_streak, last_daily_at, last_work_at";

type Runner = { query: PoolClient["query"] } | null;

async function run<T extends Record<string, unknown>>(client: Runner, text: string, values: unknown[]): Promise<T[]> {
    if (client) return (await client.query<T>(text, values)).rows;
    return (await query<T>(text, values)).rows;
}

/** Garante a conta (com o saldo inicial do servidor) e devolve-a. */
export async function ensureAccount(guildId: string, userId: string, startBalance: number, client: Runner = null): Promise<EconomyAccount> {
    const now = Date.now();
    await run(client,
        `INSERT INTO economy_accounts (guild_id, user_id, balance, total_earned, created_at, updated_at)
         VALUES ($1, $2, $3, $3, $4, $4) ON CONFLICT (guild_id, user_id) DO NOTHING`,
        [guildId, userId, Math.max(0, Math.round(startBalance)), now]);
    const rows = await run(client, `SELECT ${ACCOUNT_COLUMNS} FROM economy_accounts WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
    return toAccount(rows[0] ?? { user_id: userId });
}

export async function getAccount(guildId: string, userId: string): Promise<EconomyAccount | null> {
    const row = await queryOne<Record<string, unknown>>(`SELECT ${ACCOUNT_COLUMNS} FROM economy_accounts WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
    return row ? toAccount(row) : null;
}

/**
 * Soma `delta` ao saldo (negativo = gastar) e regista no histórico. Devolve o saldo novo, ou
 * null se não houver saldo suficiente (nada muda).
 */
export async function applyDelta(
    guildId: string,
    userId: string,
    delta: number,
    kind: string,
    note: string | null,
    startBalance: number,
    client: Runner = null,
): Promise<number | null> {
    const amount = Math.round(delta);
    await ensureAccount(guildId, userId, startBalance, client);
    const rows = await run<{ balance_after: string }>(client,
        `WITH upd AS (
            UPDATE economy_accounts SET
                balance = balance + $3::bigint,
                total_earned = total_earned + GREATEST($3::bigint, 0),
                total_spent = total_spent + GREATEST(-$3::bigint, 0),
                updated_at = $6
            WHERE guild_id = $1 AND user_id = $2 AND balance + $3::bigint >= 0
            RETURNING balance
         )
         INSERT INTO economy_ledger (guild_id, user_id, amount, balance_after, kind, note, created_at)
         SELECT $1, $2, $3::bigint, balance, $4, $5, $6 FROM upd
         RETURNING balance_after`,
        [guildId, userId, amount, kind, note, Date.now()]);
    return rows[0] ? Number(rows[0].balance_after) : null;
}

/** Transferência entre dois membros (taxa opcional). Devolve os saldos novos, ou null sem saldo. */
export async function transferCoins(
    guildId: string,
    fromId: string,
    toId: string,
    amount: number,
    fee: number,
    startBalance: number,
): Promise<{ from: number; to: number } | null> {
    return withTransaction(async (client) => {
        // Sem saldo, o débito não mexe em nada (só a conta pode ter sido criada) — sai já.
        const from = await applyDelta(guildId, fromId, -amount, "transfer_out", `→ ${toId}`, startBalance, client);
        if (from === null) return null;
        const to = await applyDelta(guildId, toId, amount - fee, "transfer_in", `← ${fromId}`, startBalance, client);
        return { from, to: to ?? 0 };
    });
}

/** Valor absoluto (administração). */
export async function setBalance(guildId: string, userId: string, balance: number, note: string | null, startBalance: number): Promise<number> {
    return withTransaction(async (client) => {
        const account = await ensureAccount(guildId, userId, startBalance, client);
        const target = Math.max(0, Math.round(balance));
        const result = await applyDelta(guildId, userId, target - account.balance, "admin_set", note, startBalance, client);
        return result ?? account.balance;
    });
}

/**
 * Reclamações com bloqueio de linha (diário e trabalho): `decide` recebe a conta trancada e
 * diz quanto dar e que campos mexer — dois cliques seguidos nunca pagam duas vezes.
 */
export async function claimWithLock<T>(
    guildId: string,
    userId: string,
    startBalance: number,
    decide: (account: EconomyAccount) => { amount: number; kind: string; note: string | null; patch: Partial<Pick<EconomyAccount, "daily_streak" | "best_daily_streak" | "last_daily_at" | "last_work_at">>; result: T } | { refuse: T },
): Promise<{ ok: true; balance: number; result: T } | { ok: false; result: T }> {
    return withTransaction(async (client) => {
        await ensureAccount(guildId, userId, startBalance, client);
        const locked = await client.query<Record<string, unknown>>(`SELECT ${ACCOUNT_COLUMNS} FROM economy_accounts WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`, [guildId, userId]);
        const account = toAccount(locked.rows[0] ?? { user_id: userId });
        const decision = decide(account);
        if ("refuse" in decision) return { ok: false as const, result: decision.refuse };
        const { patch } = decision;
        await client.query(
            `UPDATE economy_accounts SET
                daily_streak = COALESCE($3, daily_streak),
                best_daily_streak = COALESCE($4, best_daily_streak),
                last_daily_at = COALESCE($5, last_daily_at),
                last_work_at = COALESCE($6, last_work_at)
             WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId, patch.daily_streak ?? null, patch.best_daily_streak ?? null, patch.last_daily_at ?? null, patch.last_work_at ?? null],
        );
        const balance = await applyDelta(guildId, userId, decision.amount, decision.kind, decision.note, startBalance, client);
        return { ok: true as const, balance: balance ?? account.balance, result: decision.result };
    });
}

export async function topBalances(guildId: string, limit: number, offset: number): Promise<Array<{ user_id: string; balance: number }>> {
    const result = await query<{ user_id: string; balance: string }>(
        "SELECT user_id, balance FROM economy_accounts WHERE guild_id = $1 AND balance > 0 ORDER BY balance DESC, user_id ASC LIMIT $2 OFFSET $3",
        [guildId, limit, offset],
    );
    return result.rows.map((row) => ({ user_id: row.user_id, balance: Number(row.balance) }));
}

export async function countAccounts(guildId: string): Promise<number> {
    const row = await queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM economy_accounts WHERE guild_id = $1 AND balance > 0", [guildId]);
    return Number(row?.n ?? 0);
}

export async function balanceRank(guildId: string, balance: number): Promise<number> {
    const row = await queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM economy_accounts WHERE guild_id = $1 AND balance > $2", [guildId, balance]);
    return Number(row?.n ?? 0) + 1;
}

export async function recentLedger(guildId: string, userId: string, limit = 10): Promise<LedgerEntry[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT amount, balance_after, kind, note, created_at FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3",
        [guildId, userId, limit],
    );
    return result.rows.map((row) => ({
        amount: Number(row.amount),
        balance_after: Number(row.balance_after),
        kind: String(row.kind),
        note: (row.note as string | null) ?? null,
        created_at: Number(row.created_at),
    }));
}

/** Histórico com mais de `days` dias sai (a conta e o saldo ficam). */
export async function pruneLedger(days: number): Promise<number> {
    const result = await query("DELETE FROM economy_ledger WHERE created_at < $1", [Date.now() - days * 86_400_000]);
    return result.rowCount ?? 0;
}

export async function resetAccount(guildId: string, userId: string): Promise<void> {
    await query("DELETE FROM economy_accounts WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    await query("DELETE FROM economy_ledger WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
}
