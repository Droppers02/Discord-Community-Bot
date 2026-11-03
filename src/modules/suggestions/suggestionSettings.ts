import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import type { SuggestionSettings } from "../../types.js";

function buildDefaults(): SuggestionSettings {
    return {
        channel: null,
        create_threads: true,
        required_role: null,
        manager_role: null,
    };
}

export function getSuggestionSettings(guildId: string): Promise<SuggestionSettings> {
    return getSettings("suggestion_settings", guildId, buildDefaults());
}

export function saveSuggestionSettings(guildId: string, patch: Partial<SuggestionSettings>): Promise<SuggestionSettings> {
    return saveSettings("suggestion_settings", guildId, patch, buildDefaults());
}
