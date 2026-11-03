import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { loadRuntimeConfig } from "../config.js";
import { logger } from "../lib/logger.js";
import { runMigrations } from "./migrations.js";
import { resolvePgTls } from "./pgTls.js";

const runtimeConfig = loadRuntimeConfig();
const DB_CONNECT_TIMEOUT_MS = 10_000;
const DB_QUERY_TIMEOUT_MS = 15_000;
const SLOW_QUERY_WARNING_MS = 1_000;

// TLS verificado por omissão (na Supabase, contra a CA dela) — ver `resolvePgTls`.
// Antes a verificação estava desligada: a ligação ia cifrada, mas qualquer intermediário
// se podia fazer passar pela base de dados.
const pgTls = resolvePgTls(runtimeConfig.databaseUrl, process.env.PGSSLMODE);

export const db = new Pool({
    connectionString: pgTls.connectionString,
    ssl: pgTls.ssl,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    query_timeout: DB_QUERY_TIMEOUT_MS,
    statement_timeout: DB_QUERY_TIMEOUT_MS,
});

db.on("error", (err) => logger.error("Erro inesperado no pool Postgres:", err));

let initPromise: Promise<void> | null = null;
let closed = false;

// ─── Single-instance advisory lock ───────────────────────────────────────────
// The bot relies on in-memory caches (guild config, tickets, games, cooldowns,
// schedulers). Two instances on the same database would diverge those caches and
// corrupt state. A session-scoped Postgres advisory lock guarantees a single
// active instance; it is held on a dedicated client and released on shutdown.
const LOCK_RETRY_ATTEMPTS = 12;
const LOCK_RETRY_DELAY_MS = 2_500;

let lockClient: PoolClient | null = null;

function hashLockKey(value: string): number {
    let hash = 0;
    for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return hash;
}

export function releaseLock(): void {
    if (!lockClient) return;
    lockClient.release();
    lockClient = null;
}

process.once("exit", () => releaseLock());

async function tryAcquireLock(): Promise<boolean> {
    const client = await db.connect();
    try {
        const result = await client.query<{ locked: boolean }>(
            "SELECT pg_try_advisory_lock($1, $2) AS locked",
            [hashLockKey(runtimeConfig.clientId ?? "epa-botchi"), hashLockKey("epa-botchi-runtime")],
        );
        if (!result.rows[0]?.locked) {
            client.release();
            return false;
        }
        lockClient = client;
        // Sem isto, um reinício da base de dados (p.ex. ao ligar o "Enforce SSL" da Supabase)
        // derrubava esta ligação com um erro sem dono — e o processo inteiro com ela.
        client.on("error", onLockConnectionLost);
        return true;
    } catch (err) {
        client.release();
        throw err;
    }
}

const LOCK_RECOVERY_ATTEMPTS = 20;
const LOCK_RECOVERY_DELAY_MS = 3_000;
let recoveringLock = false;

/**
 * A ligação que segura o lock de instância caiu (a base de dados reiniciou). Em vez de
 * deixar o processo morrer, espera que a base de dados volte e recupera o lock. Só sai se
 * outra instância o tiver apanhado entretanto (aí sair é o certo: nunca duas a correr) ou se
 * a base de dados não voltar — nesse caso a Discloud reinicia o bot.
 */
function onLockConnectionLost(err: Error): void {
    if (closed || recoveringLock) return;
    recoveringLock = true;
    logger.warn("Ligação do lock de instância perdida (a base de dados reiniciou?) — a recuperar.", err);
    const lost = lockClient;
    lockClient = null;
    lost?.release(err);
    void (async () => {
        for (let attempt = 1; attempt <= LOCK_RECOVERY_ATTEMPTS && !closed; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, LOCK_RECOVERY_DELAY_MS));
            try {
                if (await tryAcquireLock()) {
                    logger.info(`Lock de instância recuperado (tentativa ${attempt}).`);
                    recoveringLock = false;
                    return;
                }
                logger.error("Outra instância ficou com o lock enquanto a base de dados reiniciava — a sair para não haver duas.");
                process.exit(1);
            } catch {
                // A base de dados ainda não voltou — tenta outra vez.
            }
        }
        if (closed) return;
        logger.error("A base de dados não voltou a tempo — a sair para a Discloud reiniciar o bot.");
        process.exit(1);
    })();
}

async function acquireSingletonLock(): Promise<void> {
    for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt++) {
        if (await tryAcquireLock()) return;
        if (attempt < LOCK_RETRY_ATTEMPTS) {
            logger.warn(`Lock de instância retido por outra sessão — nova tentativa em ${LOCK_RETRY_DELAY_MS / 1000}s (${attempt}/${LOCK_RETRY_ATTEMPTS})…`);
            await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
        }
    }
    throw new Error("Já existe outra instância do EPA BOTCHI ligada a esta base de dados. Fecha o processo antigo primeiro.");
}

export async function initDatabase(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        await db.query("SELECT 1");
        await acquireSingletonLock();
        await runMigrations({ query: (text, values) => db.query(text, values as unknown[]) });
        const host = (() => {
            try {
                return new URL(runtimeConfig.databaseUrl).host;
            } catch {
                return "database";
            }
        })();
        logger.info(`Base de dados PostgreSQL pronta em ${host}`);
    })();
    return initPromise;
}

export async function closeDatabase(): Promise<void> {
    if (closed) return;
    closed = true;
    initPromise = null;
    releaseLock();
    await db.end().catch(() => null);
}

async function runTimedQuery<T extends QueryResultRow>(text: string, values?: unknown[]) {
    const start = Date.now();
    try {
        return await db.query<T>(text, values);
    } finally {
        const elapsed = Date.now() - start;
        if (elapsed >= SLOW_QUERY_WARNING_MS) {
            logger.warn(`Query lenta (${elapsed}ms): ${text.replace(/\s+/g, " ").trim().slice(0, 120)}`);
        }
    }
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    return runTimedQuery<T>(text, values);
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<T | null> {
    const result = await runTimedQuery<T>(text, values);
    return result.rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => null);
        throw err;
    } finally {
        client.release();
    }
}
