import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { ANTISPAM_ACTIONS, type AntiSpamSettings } from "../../types.js";

// Defaults mirror the reference bot (Purple AntiSpam v2): flood 5 msgs / 8s, action
// threshold 60 pts, 14-day "suspicious account" window, +55 pts for non-whitelisted links.
const DEFAULT_WHITELIST = [
    "discord.com",
    "discord.gg",
    "discordapp.com",
    "cdn.discordapp.com",
    "media.discordapp.net",
    "tenor.com",
    "media.tenor.com",
    "youtube.com",
    "youtu.be",
    "github.com",
];

export function buildAntiSpamDefaults(): AntiSpamSettings {
    return {
        enabled: false,
        log_channel: null,
        exempt_roles: [],
        link_whitelist: [...DEFAULT_WHITELIST],
        allow_invites: false,
        flood_messages: 5,
        flood_window_seconds: 8,
        score_threshold: 60,
        min_account_age_days: 14,
        // "timeout" mantém o comportamento que o bot já tinha antes de a ação ser configurável.
        action: "timeout",
        purge_recent: true,
        purge_minutes: 10,
        quarantine_role: null,
    };
}

function normalize(settings: AntiSpamSettings): AntiSpamSettings {
    return {
        ...settings,
        exempt_roles: Array.isArray(settings.exempt_roles) ? settings.exempt_roles : [],
        link_whitelist: Array.isArray(settings.link_whitelist) ? settings.link_whitelist : [],
        action: (ANTISPAM_ACTIONS as readonly string[]).includes(settings.action) ? settings.action : "timeout",
        purge_recent: settings.purge_recent ?? true,
        purge_minutes: Math.min(Math.max(Number(settings.purge_minutes) || 10, 1), 60),
        quarantine_role: settings.quarantine_role ?? null,
    };
}

export function getAntiSpamSettings(guildId: string): Promise<AntiSpamSettings> {
    return getSettings("antispam_settings", guildId, buildAntiSpamDefaults(), normalize);
}

export function saveAntiSpamSettings(guildId: string, patch: Partial<AntiSpamSettings>): Promise<AntiSpamSettings> {
    return saveSettings("antispam_settings", guildId, patch, buildAntiSpamDefaults(), normalize);
}
