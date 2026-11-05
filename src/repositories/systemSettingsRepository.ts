import { query, queryOne } from "#database";

// Tabelas JSONB de definições por servidor (uma linha por servidor). Os nomes vêm desta lista
// fechada — nunca de input — e o SQL de cada uma é montado uma vez, ao carregar o módulo.
export const SETTINGS_TABLES = [
    "log_settings",
    "suggestion_settings",
    "antispam_settings",
    "giveaway_settings",
    "role_settings",
    "voice_settings",
    "reactionrole_settings",
    "social_settings",
    "statschannels_settings",
    "broadcast_settings",
    "sla_settings",
    "modmail_settings",
    "verify_settings",
    "levels_settings",
    "economy_settings",
    "games_settings",
    "moderation_settings",
    "appeal_settings",
    "protection_settings",
    "welcome_settings",
    "starboard_settings",
    "lockdown_settings",
    "report_settings",
    "counting_settings",
    "confession_settings",
    "lfg_settings",
    "freegames_settings",
    "prediction_settings",
    "team_settings",
    "wrapped_settings",
] as const;
export type SettingsTable = (typeof SETTINGS_TABLES)[number];

const SETTINGS_SQL = Object.fromEntries(SETTINGS_TABLES.map((table) => [table, {
    select: `SELECT config FROM ${table} WHERE guild_id = $1`,
    upsert: `INSERT INTO ${table} (guild_id, config, updated_at) VALUES ($1, $2, $3) ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = $3`,
}])) as Record<SettingsTable, { select: string; upsert: string }>;

const caches = new Map<SettingsTable, Map<string, unknown>>();

function cacheFor(table: SettingsTable): Map<string, unknown> {
    let cache = caches.get(table);
    if (!cache) {
        cache = new Map();
        caches.set(table, cache);
    }
    return cache;
}

/**
 * Read a guild's settings merged over `defaults`. `normalize` runs after the shallow
 * merge so each system can repair nested shapes (e.g. add categories introduced later).
 */
export async function getSettings<T>(
    table: SettingsTable,
    guildId: string,
    defaults: T,
    normalize?: (value: T) => T,
): Promise<T> {
    const cache = cacheFor(table);
    const cached = cache.get(guildId);
    if (cached) return cached as T;

    const row = await queryOne<{ config: unknown }>(SETTINGS_SQL[table].select, [guildId]);
    const stored = (row?.config as Partial<T>) ?? {};
    let merged = { ...defaults, ...stored } as T;
    if (normalize) merged = normalize(merged);
    cache.set(guildId, merged);
    return merged;
}

export async function saveSettings<T>(
    table: SettingsTable,
    guildId: string,
    patch: Partial<T>,
    defaults: T,
    normalize?: (value: T) => T,
): Promise<T> {
    const current = await getSettings(table, guildId, defaults, normalize);
    let merged = { ...current, ...patch } as T;
    if (normalize) merged = normalize(merged);

    await query(SETTINGS_SQL[table].upsert, [guildId, JSON.stringify(merged), Date.now()]);
    cacheFor(table).set(guildId, merged);
    return merged;
}

export function evictSettings(guildId: string): void {
    for (const cache of caches.values()) cache.delete(guildId);
}
