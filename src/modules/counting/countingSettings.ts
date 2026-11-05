import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Canal de contagem: definições.

export interface CountingSettings {
    enabled: boolean;
    channel: string | null;
    /** Aceitar contas (6*7, (40+2)…). */
    math: boolean;
    /** A mesma pessoa não pode contar duas vezes seguidas. */
    no_double: boolean;
    /** Errar recomeça do 1 (desligado: o erro só não conta). */
    reset_on_fail: boolean;
    /** Apagar mensagens que não são contagens (conversa no canal). */
    delete_chat: boolean;
    /** Cargo da vergonha para quem estraga a contagem (opcional). */
    shame_role: string | null;
    shame_hours: number;
    /** De N em N números, quem acerta ganha moedas (0 = desligado). */
    reward_every: number;
    reward_coins: number;
    /** Festa a cada N números (0 = desligado). */
    milestone_every: number;
    /** Preço de uma vida (comprada por qualquer membro, salva a contagem de um erro). */
    save_price: number;
    max_saves: number;
}

export function buildCountingDefaults(): CountingSettings {
    return {
        enabled: false,
        channel: null,
        math: true,
        no_double: true,
        reset_on_fail: true,
        delete_chat: false,
        shame_role: null,
        shame_hours: 24,
        reward_every: 50,
        reward_coins: 25,
        milestone_every: 100,
        save_price: 500,
        max_saves: 3,
    };
}

const ID = /^\d{5,25}$/;
const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function normalizeCounting(value: CountingSettings): CountingSettings {
    const d = buildCountingDefaults();
    return {
        enabled: value.enabled === true,
        channel: typeof value.channel === "string" && ID.test(value.channel) ? value.channel : null,
        math: value.math !== false,
        no_double: value.no_double !== false,
        reset_on_fail: value.reset_on_fail !== false,
        delete_chat: value.delete_chat === true,
        shame_role: typeof value.shame_role === "string" && ID.test(value.shame_role) ? value.shame_role : null,
        shame_hours: clamp(value.shame_hours, d.shame_hours, 1, 168),
        reward_every: clamp(value.reward_every, d.reward_every, 0, 10_000),
        reward_coins: clamp(value.reward_coins, d.reward_coins, 0, 100_000),
        milestone_every: clamp(value.milestone_every, d.milestone_every, 0, 100_000),
        save_price: clamp(value.save_price, d.save_price, 0, 10_000_000),
        max_saves: clamp(value.max_saves, d.max_saves, 0, 10),
    };
}

export const getCountingSettings = (guildId: string) => getSettings("counting_settings", guildId, buildCountingDefaults(), normalizeCounting);
export const saveCountingSettings = (guildId: string, patch: Partial<CountingSettings>) => saveSettings("counting_settings", guildId, patch, buildCountingDefaults(), normalizeCounting);
