import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Proteção automática (vinda do bot antigo): filtro de palavras, conteúdo adulto, anti-raid e
// slowmode automático. O anti-spam (flood, links, menções) continua no módulo antispam.

export const FILTER_ACTIONS = ["delete", "warn", "timeout"] as const;
export type FilterAction = (typeof FILTER_ACTIONS)[number];
export const RAID_ACTIONS = ["alert", "pause", "kick"] as const;
export type RaidAction = (typeof RAID_ACTIONS)[number];

export interface ProtectionSettings {
    word_filter_enabled: boolean;
    /** Palavras proibidas; `palavra*` apanha também o que começa por ela. */
    words: string[];
    /** Bloquear links de sites adultos fora dos canais NSFW. */
    adult_filter_enabled: boolean;
    filter_action: FilterAction;
    filter_timeout_minutes: number;
    exempt_roles: string[];
    exempt_channels: string[];

    raid_enabled: boolean;
    raid_joins: number;
    raid_seconds: number;
    raid_action: RaidAction;
    /** Pausa dos convites (ação "pause"): até 24 h, limite do Discord. */
    raid_pause_minutes: number;

    slowmode_enabled: boolean;
    slowmode_messages: number;
    slowmode_window_seconds: number;
    slowmode_seconds: number;
    slowmode_duration_minutes: number;
    /** Vazio = todos os canais de texto. */
    slowmode_channels: string[];
}

export const MAX_WORDS = 200;

export function buildProtectionDefaults(): ProtectionSettings {
    return {
        word_filter_enabled: false,
        words: [],
        adult_filter_enabled: false,
        filter_action: "delete",
        filter_timeout_minutes: 10,
        exempt_roles: [],
        exempt_channels: [],
        raid_enabled: false,
        raid_joins: 10,
        raid_seconds: 60,
        raid_action: "pause",
        raid_pause_minutes: 60,
        slowmode_enabled: false,
        slowmode_messages: 20,
        slowmode_window_seconds: 10,
        slowmode_seconds: 10,
        slowmode_duration_minutes: 5,
        slowmode_channels: [],
    };
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function ids(value: unknown): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && /^\d{5,25}$/.test(v)))].slice(0, 50) : [];
}

export function normalizeProtection(value: ProtectionSettings): ProtectionSettings {
    return {
        word_filter_enabled: value.word_filter_enabled === true,
        words: (Array.isArray(value.words) ? value.words : [])
            .filter((word): word is string => typeof word === "string")
            .map((word) => word.trim().toLowerCase().slice(0, 50))
            .filter((word) => word.replace(/\*/g, "").length >= 2)
            .filter((word, i, all) => all.indexOf(word) === i)
            .slice(0, MAX_WORDS),
        adult_filter_enabled: value.adult_filter_enabled === true,
        filter_action: (FILTER_ACTIONS as readonly string[]).includes(value.filter_action) ? value.filter_action : "delete",
        filter_timeout_minutes: clamp(value.filter_timeout_minutes, 10, 1, 40_320),
        exempt_roles: ids(value.exempt_roles),
        exempt_channels: ids(value.exempt_channels),
        raid_enabled: value.raid_enabled === true,
        raid_joins: clamp(value.raid_joins, 10, 3, 100),
        raid_seconds: clamp(value.raid_seconds, 60, 5, 3600),
        raid_action: (RAID_ACTIONS as readonly string[]).includes(value.raid_action) ? value.raid_action : "pause",
        raid_pause_minutes: clamp(value.raid_pause_minutes, 60, 5, 1440),
        slowmode_enabled: value.slowmode_enabled === true,
        slowmode_messages: clamp(value.slowmode_messages, 20, 5, 200),
        slowmode_window_seconds: clamp(value.slowmode_window_seconds, 10, 3, 120),
        slowmode_seconds: clamp(value.slowmode_seconds, 10, 1, 21_600),
        slowmode_duration_minutes: clamp(value.slowmode_duration_minutes, 5, 1, 1440),
        slowmode_channels: ids(value.slowmode_channels),
    };
}

export function getProtectionSettings(guildId: string): Promise<ProtectionSettings> {
    return getSettings("protection_settings", guildId, buildProtectionDefaults(), normalizeProtection);
}

export function saveProtectionSettings(guildId: string, patch: Partial<ProtectionSettings>): Promise<ProtectionSettings> {
    return saveSettings("protection_settings", guildId, patch, buildProtectionDefaults(), normalizeProtection);
}
