import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { slugify } from "./lfgLogic.js";

// Procurar grupo: definições e lista de jogos (com o cargo a mencionar e o tamanho do grupo).

export interface LfgGame {
    key: string;
    name: string;
    emoji: string | null;
    role_id: string | null;
    size: number;
}

export interface LfgSettings {
    enabled: boolean;
    /** Onde os grupos são publicados (vazio = no canal onde se usa o comando). */
    channel: string | null;
    /** Categoria onde nascem as salas de voz dos grupos (vazio = sem sala). */
    voice_category: string | null;
    /** Mencionar o cargo do jogo ao criar o grupo. */
    ping_role: boolean;
    max_open_per_user: number;
    /** Horas até um grupo sem hora marcada expirar. */
    expire_hours: number;
    games: LfgGame[];
}

export const MAX_LFG_GAMES = 25;
const ID = /^\d{5,25}$/;

export function buildLfgDefaults(): LfgSettings {
    return { enabled: true, channel: null, voice_category: null, ping_role: true, max_open_per_user: 2, expire_hours: 3, games: [] };
}

export function normalizeGame(value: Partial<LfgGame>): LfgGame | null {
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 40) : "";
    if (!name) return null;
    return {
        key: typeof value.key === "string" && value.key ? value.key.slice(0, 40) : slugify(name),
        name,
        emoji: typeof value.emoji === "string" && value.emoji.trim() ? value.emoji.trim().slice(0, 64) : null,
        role_id: typeof value.role_id === "string" && ID.test(value.role_id) ? value.role_id : null,
        size: Math.max(2, Math.min(20, Math.round(Number(value.size) || 5))),
    };
}

export function normalizeLfg(value: LfgSettings): LfgSettings {
    const games: LfgGame[] = [];
    for (const raw of Array.isArray(value.games) ? value.games : []) {
        const game = normalizeGame(raw);
        if (game && !games.some((entry) => entry.key === game.key)) games.push(game);
    }
    return {
        enabled: value.enabled !== false,
        channel: typeof value.channel === "string" && ID.test(value.channel) ? value.channel : null,
        voice_category: typeof value.voice_category === "string" && ID.test(value.voice_category) ? value.voice_category : null,
        ping_role: value.ping_role !== false,
        max_open_per_user: Math.max(1, Math.min(10, Math.round(Number(value.max_open_per_user) || 2))),
        expire_hours: Math.max(1, Math.min(48, Math.round(Number(value.expire_hours) || 3))),
        games: games.slice(0, MAX_LFG_GAMES),
    };
}

export const getLfgSettings = (guildId: string) => getSettings("lfg_settings", guildId, buildLfgDefaults(), normalizeLfg);
export const saveLfgSettings = (guildId: string, patch: Partial<LfgSettings>) => saveSettings("lfg_settings", guildId, patch, buildLfgDefaults(), normalizeLfg);

/** O jogo configurado que melhor corresponde ao que foi escrito (chave, nome ou parte do nome). */
export function findGame(games: LfgGame[], input: string): LfgGame | null {
    const slug = slugify(input);
    return games.find((game) => game.key === input || game.key === slug)
        ?? games.find((game) => slugify(game.name) === slug)
        ?? games.find((game) => slugify(game.name).includes(slug) || slug.includes(slugify(game.name)))
        ?? null;
}
