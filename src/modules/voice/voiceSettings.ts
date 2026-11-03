import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import type { VoiceSettings } from "../../types.js";
import { t, textOrDefault, tk } from "../../lib/i18n.js";

/** Nome por defeito das salas — {user} é trocado pelo nome do membro em formatName. */
const DEFAULT_NAME_TEMPLATE = tk("🔊 Sala de {user}");

export function buildVoiceDefaults(): VoiceSettings {
    return {
        hub_channel: null,
        category_id: null,
        name_template: t(DEFAULT_NAME_TEMPLATE),
        user_limit: 0,
        owner_can_manage: true,
        ticket_voice_enabled: true,
    };
}

function normalize(settings: VoiceSettings): VoiceSettings {
    return {
        ...settings,
        name_template: textOrDefault(settings.name_template, DEFAULT_NAME_TEMPLATE),
        user_limit: Number.isFinite(settings.user_limit) ? Math.min(99, Math.max(0, settings.user_limit)) : 0,
    };
}

export function getVoiceSettings(guildId: string): Promise<VoiceSettings> {
    return getSettings("voice_settings", guildId, buildVoiceDefaults(), normalize);
}

export function saveVoiceSettings(guildId: string, patch: Partial<VoiceSettings>): Promise<VoiceSettings> {
    return saveSettings("voice_settings", guildId, patch, buildVoiceDefaults(), normalize);
}
