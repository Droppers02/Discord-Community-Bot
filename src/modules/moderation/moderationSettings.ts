import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Moderação: casos numerados (avisos, castigos, expulsões, banimentos), um canal de registo e
// castigos automáticos quando um membro junta avisos.

export const ESCALATION_ACTIONS = ["timeout", "kick", "ban"] as const;
export type EscalationAction = (typeof ESCALATION_ACTIONS)[number];

export interface WarnThreshold {
    /** Número de avisos ativos que dispara a ação. */
    count: number;
    action: EscalationAction;
    /** Só para timeout. */
    minutes: number;
}

export interface ModerationSettings {
    /** Canal onde cada caso fica registado. */
    log_channel: string | null;
    /** Cargo que pode usar /mod mesmo sem as permissões do Discord. */
    mod_role: string | null;
    /** Avisar o membro por mensagem privada. */
    dm_on_action: boolean;
    thresholds: WarnThreshold[];
    /** Avisos deixam de contar para os castigos automáticos ao fim de X dias (0 = nunca). */
    warn_expiry_days: number;
}

export const MAX_THRESHOLDS = 5;

export function buildModerationDefaults(): ModerationSettings {
    return {
        log_channel: null,
        mod_role: null,
        dm_on_action: true,
        thresholds: [
            { count: 3, action: "timeout", minutes: 60 },
            { count: 5, action: "timeout", minutes: 1440 },
        ],
        warn_expiry_days: 30,
    };
}

function idOrNull(value: unknown): string | null {
    return typeof value === "string" && /^\d{5,25}$/.test(value) ? value : null;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export function normalizeModeration(value: ModerationSettings): ModerationSettings {
    const thresholds = (Array.isArray(value.thresholds) ? value.thresholds : [])
        .filter((entry): entry is WarnThreshold => Boolean(entry) && (ESCALATION_ACTIONS as readonly string[]).includes(entry.action))
        .map((entry) => ({ count: clamp(entry.count, 3, 1, 50), action: entry.action, minutes: clamp(entry.minutes, 60, 1, 40_320) }))
        .filter((entry, i, all) => all.findIndex((other) => other.count === entry.count) === i)
        .sort((a, b) => a.count - b.count)
        .slice(0, MAX_THRESHOLDS);
    return {
        log_channel: idOrNull(value.log_channel),
        mod_role: idOrNull(value.mod_role),
        dm_on_action: value.dm_on_action !== false,
        thresholds,
        warn_expiry_days: clamp(value.warn_expiry_days, 30, 0, 365),
    };
}

export function getModerationSettings(guildId: string): Promise<ModerationSettings> {
    return getSettings("moderation_settings", guildId, buildModerationDefaults(), normalizeModeration);
}

export function saveModerationSettings(guildId: string, patch: Partial<ModerationSettings>): Promise<ModerationSettings> {
    return saveSettings("moderation_settings", guildId, patch, buildModerationDefaults(), normalizeModeration);
}
