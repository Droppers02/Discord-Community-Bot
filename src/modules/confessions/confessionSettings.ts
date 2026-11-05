import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Confissões anónimas: definições.

export interface ConfessionSettings {
    enabled: boolean;
    /** Onde as confissões aparecem. */
    channel: string | null;
    /** Onde a equipa aprova (vazio = publica logo, sem revisão). */
    review_channel: string | null;
    cooldown_minutes: number;
    allow_images: boolean;
    allow_replies: boolean;
    /** Autores bloqueados (a equipa bloqueia pela confissão, sem saber quem é). */
    blocked: string[];
    /** Aplicar o filtro de palavras da Proteção. */
    use_word_filter: boolean;
}

export function buildConfessionDefaults(): ConfessionSettings {
    return { enabled: false, channel: null, review_channel: null, cooldown_minutes: 10, allow_images: true, allow_replies: true, blocked: [], use_word_filter: true };
}

const ID = /^\d{5,25}$/;

export function normalizeConfessions(value: ConfessionSettings): ConfessionSettings {
    return {
        enabled: value.enabled === true,
        channel: typeof value.channel === "string" && ID.test(value.channel) ? value.channel : null,
        review_channel: typeof value.review_channel === "string" && ID.test(value.review_channel) ? value.review_channel : null,
        cooldown_minutes: Math.max(0, Math.min(1440, Math.round(Number(value.cooldown_minutes) || 0))),
        allow_images: value.allow_images !== false,
        allow_replies: value.allow_replies !== false,
        blocked: Array.isArray(value.blocked) ? [...new Set(value.blocked.filter((id) => typeof id === "string" && ID.test(id)))].slice(0, 500) : [],
        use_word_filter: value.use_word_filter !== false,
    };
}

export const getConfessionSettings = (guildId: string) => getSettings("confession_settings", guildId, buildConfessionDefaults(), normalizeConfessions);
export const saveConfessionSettings = (guildId: string, patch: Partial<ConfessionSettings>) => saveSettings("confession_settings", guildId, patch, buildConfessionDefaults(), normalizeConfessions);
