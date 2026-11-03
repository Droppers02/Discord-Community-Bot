import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Mini-jogos: onde se pode jogar, limites das apostas e prémios (em EPA Coins) por vitória.

export interface GamesSettings {
    enabled: boolean;
    /** Canais onde os jogos funcionam (vazio = em todo o lado). */
    channels: string[];
    min_bet: number;
    max_bet: number;
    /** Prémio por ganhar um jogo sem aposta (galo, 4 em linha, PPT contra alguém). */
    win_reward: number;
    /** Prémio por resposta certa no quiz. */
    quiz_reward: number;
    /** Prémio por acertar na forca ou no termo livre. */
    word_reward: number;
    /** Prémio do termo do dia (mais se acertar em menos tentativas). */
    daily_word_reward: number;
}

export function buildGamesDefaults(): GamesSettings {
    return {
        enabled: true,
        channels: [],
        min_bet: 10,
        max_bet: 50_000,
        win_reward: 50,
        quiz_reward: 25,
        word_reward: 75,
        daily_word_reward: 300,
    };
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export function normalizeGames(value: GamesSettings): GamesSettings {
    const minBet = clamp(value.min_bet, 10, 1, 1_000_000);
    return {
        ...value,
        enabled: value.enabled !== false,
        channels: Array.isArray(value.channels) ? [...new Set(value.channels.filter((id) => typeof id === "string" && /^\d{5,25}$/.test(id)))].slice(0, 25) : [],
        min_bet: minBet,
        max_bet: Math.max(minBet, clamp(value.max_bet, 50_000, 1, 1_000_000_000)),
        win_reward: clamp(value.win_reward, 50, 0, 1_000_000),
        quiz_reward: clamp(value.quiz_reward, 25, 0, 1_000_000),
        word_reward: clamp(value.word_reward, 75, 0, 1_000_000),
        daily_word_reward: clamp(value.daily_word_reward, 300, 0, 1_000_000),
    };
}

export function getGamesSettings(guildId: string): Promise<GamesSettings> {
    return getSettings("games_settings", guildId, buildGamesDefaults(), normalizeGames);
}

export function saveGamesSettings(guildId: string, patch: Partial<GamesSettings>): Promise<GamesSettings> {
    return saveSettings("games_settings", guildId, patch, buildGamesDefaults(), normalizeGames);
}
