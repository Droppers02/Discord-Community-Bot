import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Previsões com moedas: definições.

export interface PredictionSettings {
    enabled: boolean;
    /** Qualquer membro pode criar (senão: a equipa e o cargo abaixo). */
    anyone_can_create: boolean;
    creator_role: string | null;
    min_bet: number;
    max_bet: number;
    /** % do bolo que desaparece (0 = tudo para quem acerta). */
    house_cut_pct: number;
    max_open: number;
}

export function buildPredictionDefaults(): PredictionSettings {
    return { enabled: true, anyone_can_create: false, creator_role: null, min_bet: 10, max_bet: 10_000, house_cut_pct: 0, max_open: 5 };
}

const ID = /^\d{5,25}$/;
const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function normalizePredictions(value: PredictionSettings): PredictionSettings {
    const d = buildPredictionDefaults();
    const min = clamp(value.min_bet, d.min_bet, 1, 1_000_000);
    return {
        enabled: value.enabled !== false,
        anyone_can_create: value.anyone_can_create === true,
        creator_role: typeof value.creator_role === "string" && ID.test(value.creator_role) ? value.creator_role : null,
        min_bet: min,
        max_bet: Math.max(min, clamp(value.max_bet, d.max_bet, 1, 100_000_000)),
        house_cut_pct: clamp(value.house_cut_pct, d.house_cut_pct, 0, 50),
        max_open: clamp(value.max_open, d.max_open, 1, 25),
    };
}

export const getPredictionSettings = (guildId: string) => getSettings("prediction_settings", guildId, buildPredictionDefaults(), normalizePredictions);
export const savePredictionSettings = (guildId: string, patch: Partial<PredictionSettings>) => saveSettings("prediction_settings", guildId, patch, buildPredictionDefaults(), normalizePredictions);
