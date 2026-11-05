import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Equipas: definições.

export interface TeamSettings {
    enabled: boolean;
    create_cost: number;
    max_members: number;
    max_teams: number;
    /** Cargo com a cor da equipa para os membros. */
    create_roles: boolean;
    /** Os cargos das equipas ficam logo acima deste (vazio = em baixo). */
    role_anchor: string | null;
    /** Canal de texto e de voz privados para cada equipa, nesta categoria (vazio = sem canais). */
    channel_category: string | null;
    /** Guerra semanal: anúncio à segunda e prémio para a equipa vencedora. */
    weekly_war: boolean;
    weekly_reward: number;
    announce_channel: string | null;
}

export function buildTeamDefaults(): TeamSettings {
    return { enabled: true, create_cost: 1000, max_members: 8, max_teams: 20, create_roles: true, role_anchor: null, channel_category: null, weekly_war: true, weekly_reward: 500, announce_channel: null };
}

const ID = /^\d{5,25}$/;
const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export function normalizeTeams(value: TeamSettings): TeamSettings {
    const d = buildTeamDefaults();
    return {
        enabled: value.enabled !== false,
        create_cost: clamp(value.create_cost, d.create_cost, 0, 100_000_000),
        max_members: clamp(value.max_members, d.max_members, 2, 50),
        max_teams: clamp(value.max_teams, d.max_teams, 1, 100),
        create_roles: value.create_roles !== false,
        role_anchor: typeof value.role_anchor === "string" && ID.test(value.role_anchor) ? value.role_anchor : null,
        channel_category: typeof value.channel_category === "string" && ID.test(value.channel_category) ? value.channel_category : null,
        weekly_war: value.weekly_war !== false,
        weekly_reward: clamp(value.weekly_reward, d.weekly_reward, 0, 10_000_000),
        announce_channel: typeof value.announce_channel === "string" && ID.test(value.announce_channel) ? value.announce_channel : null,
    };
}

export const getTeamSettings = (guildId: string) => getSettings("team_settings", guildId, buildTeamDefaults(), normalizeTeams);
export const saveTeamSettings = (guildId: string, patch: Partial<TeamSettings>) => saveSettings("team_settings", guildId, patch, buildTeamDefaults(), normalizeTeams);
