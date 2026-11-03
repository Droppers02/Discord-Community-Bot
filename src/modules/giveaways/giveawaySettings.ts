import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import type { GiveawaySettings } from "../../types.js";

function buildDefaults(): GiveawaySettings {
    return { default_channel: null, host_role: null };
}

export function getGiveawaySettings(guildId: string): Promise<GiveawaySettings> {
    return getSettings("giveaway_settings", guildId, buildDefaults());
}

export function saveGiveawaySettings(guildId: string, patch: Partial<GiveawaySettings>): Promise<GiveawaySettings> {
    return saveSettings("giveaway_settings", guildId, patch, buildDefaults());
}
