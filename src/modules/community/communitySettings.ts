import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import type { BroadcastSettings, ReactionRoleSettings, SocialSettings, StatsChannelsSettings } from "../../types.js";

// Settings dos sistemas do "community pack 2" — mesmo padrão JSONB por guild dos restantes.

export function buildReactionRoleDefaults(): ReactionRoleSettings { return { panels: [] }; }
export function getReactionRoleSettings(guildId: string): Promise<ReactionRoleSettings> {
    return getSettings("reactionrole_settings", guildId, buildReactionRoleDefaults(), (s) => ({ panels: Array.isArray(s.panels) ? s.panels : [] }));
}
export function saveReactionRoleSettings(guildId: string, patch: Partial<ReactionRoleSettings>): Promise<ReactionRoleSettings> {
    return saveSettings("reactionrole_settings", guildId, patch, buildReactionRoleDefaults());
}

export function buildSocialDefaults(): SocialSettings { return { subscriptions: [] }; }
export function getSocialSettings(guildId: string): Promise<SocialSettings> {
    return getSettings("social_settings", guildId, buildSocialDefaults(), (s) => ({ subscriptions: Array.isArray(s.subscriptions) ? s.subscriptions : [] }));
}
export function saveSocialSettings(guildId: string, patch: Partial<SocialSettings>): Promise<SocialSettings> {
    return saveSettings("social_settings", guildId, patch, buildSocialDefaults());
}

export function buildStatsDefaults(): StatsChannelsSettings { return { category_id: null, stats: [] }; }
export function getStatsSettings(guildId: string): Promise<StatsChannelsSettings> {
    return getSettings("statschannels_settings", guildId, buildStatsDefaults(), (s) => ({
        category_id: typeof s.category_id === "string" ? s.category_id : null,
        stats: Array.isArray(s.stats) ? s.stats : [],
    }));
}
export function saveStatsSettings(guildId: string, patch: Partial<StatsChannelsSettings>): Promise<StatsChannelsSettings> {
    return saveSettings("statschannels_settings", guildId, patch, buildStatsDefaults());
}

export function buildBroadcastDefaults(): BroadcastSettings { return { autopublish_channels: [] }; }
export function getBroadcastSettings(guildId: string): Promise<BroadcastSettings> {
    return getSettings("broadcast_settings", guildId, buildBroadcastDefaults(), (s) => ({ autopublish_channels: Array.isArray(s.autopublish_channels) ? s.autopublish_channels : [] }));
}
export function saveBroadcastSettings(guildId: string, patch: Partial<BroadcastSettings>): Promise<BroadcastSettings> {
    return saveSettings("broadcast_settings", guildId, patch, buildBroadcastDefaults());
}
