import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Níveis e XP (opcional — desligado por omissão): cada mensagem dá XP, com intervalo mínimo
// entre mensagens que contam. Ao subir de nível o bot anuncia e entrega os cargos de
// recompensa. Canais e cargos podem ficar de fora, e alguns cargos podem ganhar XP a dobrar.

export const ANNOUNCE_MODES = ["same", "channel", "dm", "off"] as const;
export type AnnounceMode = (typeof ANNOUNCE_MODES)[number];

export interface LevelReward {
    level: number;
    role_id: string;
}

export interface LevelMultiplier {
    role_id: string;
    /** 1.1–5 (×1,5 = mais 50% de XP). */
    multiplier: number;
}

export interface LevelsSettings {
    enabled: boolean;
    xp_min: number;
    xp_max: number;
    /** Segundos entre mensagens que contam (anti-spam de XP). */
    cooldown_seconds: number;
    /** Onde se anuncia a subida: no canal da mensagem, num canal fixo, por DM ou não se anuncia. */
    announce_mode: AnnounceMode;
    announce_channel: string | null;
    /** {user} {name} {level}; null = mensagem por omissão. */
    announce_message: string | null;
    rewards: LevelReward[];
    /** true = mantém os cargos dos níveis anteriores; false = só o do nível mais alto. */
    stack_rewards: boolean;
    ignored_channels: string[];
    ignored_roles: string[];
    multipliers: LevelMultiplier[];
    /** XP por minuto em voz com pelo menos mais uma pessoa (0 = desligado). */
    voice_xp_per_minute: number;
}

export const MAX_REWARDS = 25;
export const MAX_MULTIPLIERS = 10;

export function buildLevelsDefaults(): LevelsSettings {
    return {
        enabled: false,
        xp_min: 15,
        xp_max: 25,
        cooldown_seconds: 60,
        announce_mode: "same",
        announce_channel: null,
        announce_message: null,
        rewards: [],
        stack_rewards: true,
        ignored_channels: [],
        ignored_roles: [],
        multipliers: [],
        voice_xp_per_minute: 3,
    };
}

function ids(value: unknown): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && /^\d{5,25}$/.test(v)))].slice(0, 50) : [];
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export function normalizeLevels(value: LevelsSettings): LevelsSettings {
    const xpMin = clamp(value.xp_min, 15, 1, 500);
    const xpMax = Math.max(xpMin, clamp(value.xp_max, 25, 1, 500));
    const rewards = (Array.isArray(value.rewards) ? value.rewards : [])
        .filter((r): r is LevelReward => Boolean(r) && typeof r.role_id === "string" && /^\d{5,25}$/.test(r.role_id))
        .map((r) => ({ level: clamp(r.level, 1, 1, 500), role_id: r.role_id }))
        // Um cargo só pode ser recompensa de um nível; o último definido ganha.
        .filter((r, i, all) => all.findLastIndex((other) => other.role_id === r.role_id) === i)
        .sort((a, b) => a.level - b.level)
        .slice(0, MAX_REWARDS);
    const multipliers = (Array.isArray(value.multipliers) ? value.multipliers : [])
        .filter((m): m is LevelMultiplier => Boolean(m) && typeof m.role_id === "string" && /^\d{5,25}$/.test(m.role_id))
        .map((m) => ({ role_id: m.role_id, multiplier: Math.max(1.1, Math.min(5, Math.round(Number(m.multiplier) * 10) / 10 || 1.5)) }))
        .slice(0, MAX_MULTIPLIERS);
    return {
        ...value,
        enabled: value.enabled === true,
        xp_min: xpMin,
        xp_max: xpMax,
        cooldown_seconds: clamp(value.cooldown_seconds, 60, 0, 3600),
        announce_mode: (ANNOUNCE_MODES as readonly string[]).includes(value.announce_mode) ? value.announce_mode : "same",
        announce_channel: typeof value.announce_channel === "string" && value.announce_channel ? value.announce_channel : null,
        announce_message: typeof value.announce_message === "string" && value.announce_message.trim() ? value.announce_message.trim().slice(0, 500) : null,
        rewards,
        stack_rewards: value.stack_rewards !== false,
        ignored_channels: ids(value.ignored_channels),
        ignored_roles: ids(value.ignored_roles),
        multipliers,
        voice_xp_per_minute: clamp(value.voice_xp_per_minute, 3, 0, 100),
    };
}

export function getLevelsSettings(guildId: string): Promise<LevelsSettings> {
    return getSettings("levels_settings", guildId, buildLevelsDefaults(), normalizeLevels);
}

export function saveLevelsSettings(guildId: string, patch: Partial<LevelsSettings>): Promise<LevelsSettings> {
    return saveSettings("levels_settings", guildId, patch, buildLevelsDefaults(), normalizeLevels);
}
