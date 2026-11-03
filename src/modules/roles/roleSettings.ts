import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import type { RoleSettings } from "../../types.js";

export function buildRoleDefaults(): RoleSettings {
    return {
        sticky_enabled: false,
        sticky_roles: [],
    };
}

function normalize(settings: RoleSettings): RoleSettings {
    return {
        ...settings,
        sticky_roles: Array.isArray(settings.sticky_roles) ? settings.sticky_roles : [],
    };
}

export function getRoleSettings(guildId: string): Promise<RoleSettings> {
    return getSettings("role_settings", guildId, buildRoleDefaults(), normalize);
}

export function saveRoleSettings(guildId: string, patch: Partial<RoleSettings>): Promise<RoleSettings> {
    return saveSettings("role_settings", guildId, patch, buildRoleDefaults(), normalize);
}
