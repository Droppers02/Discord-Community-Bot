import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { LOG_CATEGORIES, type LogCategory, type LogCategoryConfig, type LogSettings } from "../../types.js";
import { tk } from "../../lib/i18n.js";

function defaultCategory(): LogCategoryConfig {
    return { enabled: false, channel_id: null };
}

export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
    messages: tk("Mensagens"),
    members: tk("Membros"),
    moderation: tk("Moderação"),
    channels: tk("Canais"),
    roles: tk("Cargos"),
    voice: tk("Voz"),
    server: tk("Servidor"),
};

export const LOG_CATEGORY_DESCRIPTIONS: Record<LogCategory, string> = {
    messages: tk("Mensagens apagadas, editadas e limpezas em massa."),
    members: tk("Entradas, saídas, alterações de nick e de cargos."),
    moderation: tk("Bans, unbans, expulsões e timeouts."),
    channels: tk("Canais criados, apagados e atualizados."),
    roles: tk("Cargos criados, apagados e atualizados."),
    voice: tk("Entradas, saídas e mudanças de canal de voz."),
    server: tk("Alterações ao servidor, emojis e convites."),
};

function buildDefaults(): LogSettings {
    const categories = {} as Record<LogCategory, LogCategoryConfig>;
    for (const category of LOG_CATEGORIES) categories[category] = defaultCategory();
    return { categories, ignored_channels: [], ignored_roles: [] };
}

function normalize(settings: LogSettings): LogSettings {
    const categories = {} as Record<LogCategory, LogCategoryConfig>;
    for (const category of LOG_CATEGORIES) {
        const stored = settings.categories?.[category];
        categories[category] = {
            enabled: stored?.enabled === true,
            channel_id: stored?.channel_id ?? null,
        };
    }
    return {
        categories,
        ignored_channels: Array.isArray(settings.ignored_channels) ? settings.ignored_channels : [],
        ignored_roles: Array.isArray(settings.ignored_roles) ? settings.ignored_roles : [],
    };
}

export function getLogSettings(guildId: string): Promise<LogSettings> {
    return getSettings("log_settings", guildId, buildDefaults(), normalize);
}

export function saveLogSettings(guildId: string, patch: Partial<LogSettings>): Promise<LogSettings> {
    return saveSettings("log_settings", guildId, patch, buildDefaults(), normalize);
}

/** Enable every log category, keeping each one's configured channel. */
export async function enableAllLogCategories(guildId: string): Promise<LogSettings> {
    const current = await getLogSettings(guildId);
    const categories = {} as Record<LogCategory, LogCategoryConfig>;
    for (const category of LOG_CATEGORIES) categories[category] = { ...current.categories[category], enabled: true };
    return saveLogSettings(guildId, { categories });
}

/** Point every category at one channel and enable them all (one-click setup). */
export async function setAllLogCategoriesChannel(guildId: string, channelId: string): Promise<LogSettings> {
    const categories = {} as Record<LogCategory, LogCategoryConfig>;
    for (const category of LOG_CATEGORIES) categories[category] = { enabled: true, channel_id: channelId };
    return saveLogSettings(guildId, { categories });
}
