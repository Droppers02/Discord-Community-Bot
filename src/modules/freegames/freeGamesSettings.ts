import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { PLATFORMS, type PlatformKey } from "./freeGamesSources.js";

// Jogos grátis: definições.

export interface FreeGamesSettings {
    enabled: boolean;
    channel: string | null;
    ping_role: string | null;
    platforms: PlatformKey[];
    include_dlc: boolean;
    include_beta: boolean;
    /** À quinta-feira, resumo da Epic: grátis esta semana e na próxima. */
    weekly_epic: boolean;
}

export function buildFreeGamesDefaults(): FreeGamesSettings {
    return { enabled: false, channel: null, ping_role: null, platforms: ["epic", "steam", "gog", "prime", "ubisoft"], include_dlc: false, include_beta: false, weekly_epic: true };
}

const ID = /^\d{5,25}$/;

export function normalizeFreeGames(value: FreeGamesSettings): FreeGamesSettings {
    const platforms = Array.isArray(value.platforms) ? value.platforms.filter((key): key is PlatformKey => (PLATFORMS as readonly string[]).includes(key)) : [];
    return {
        enabled: value.enabled === true,
        channel: typeof value.channel === "string" && ID.test(value.channel) ? value.channel : null,
        ping_role: typeof value.ping_role === "string" && ID.test(value.ping_role) ? value.ping_role : null,
        platforms: [...new Set(platforms)],
        include_dlc: value.include_dlc === true,
        include_beta: value.include_beta === true,
        weekly_epic: value.weekly_epic !== false,
    };
}

export const getFreeGamesSettings = (guildId: string) => getSettings("freegames_settings", guildId, buildFreeGamesDefaults(), normalizeFreeGames);
export const saveFreeGamesSettings = (guildId: string, patch: Partial<FreeGamesSettings>) => saveSettings("freegames_settings", guildId, patch, buildFreeGamesDefaults(), normalizeFreeGames);
