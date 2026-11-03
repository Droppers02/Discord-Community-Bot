import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Verificação à entrada: um painel com o botão "Verificar" abre um captcha visual (tocar nas
// formas pela ordem da imagem). Quem acerta recebe o cargo de verificado. Opcional: cargo de
// "não verificado" ao entrar, expulsar quem não se verifica a tempo e travar contas novas.

export const DIFFICULTIES = ["easy", "normal"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const YOUNG_ACTIONS = ["log", "kick"] as const;
export type YoungAccountAction = (typeof YOUNG_ACTIONS)[number];

export interface VerifySettings {
    enabled: boolean;
    /** Canal onde fica o painel de verificação. */
    channel: string | null;
    panel_message_id: string | null;
    verified_role: string | null;
    /** Dado ao entrar e tirado ao verificar (opcional). */
    unverified_role: string | null;
    /** easy = 3 formas, normal = 4. */
    difficulty: Difficulty;
    /** Erros seguidos antes de esperar 5 minutos. */
    max_attempts: number;
    /** Expulsa quem não se verificar em X minutos; 0 = nunca. */
    kick_after_minutes: number;
    /** Contas criadas há menos de X dias; 0 = sem regra. */
    min_account_age_days: number;
    young_account_action: YoungAccountAction;
    log_channel: string | null;
    panel_title: string | null;
    panel_description: string | null;
    /** Manda por DM, a quem entra, o caminho para se verificar. */
    dm_on_join: boolean;
}

export function buildVerifyDefaults(): VerifySettings {
    return {
        enabled: false,
        channel: null,
        panel_message_id: null,
        verified_role: null,
        unverified_role: null,
        difficulty: "easy",
        max_attempts: 3,
        kick_after_minutes: 0,
        min_account_age_days: 0,
        young_account_action: "log",
        log_channel: null,
        panel_title: null,
        panel_description: null,
        dm_on_join: false,
    };
}

function idOrNull(value: unknown): string | null {
    return typeof value === "string" && /^\d{5,25}$/.test(value) ? value : null;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function textOrNull(value: unknown, max: number): string | null {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export function normalizeVerify(value: VerifySettings): VerifySettings {
    return {
        ...value,
        enabled: value.enabled === true,
        channel: idOrNull(value.channel),
        panel_message_id: idOrNull(value.panel_message_id),
        verified_role: idOrNull(value.verified_role),
        unverified_role: idOrNull(value.unverified_role),
        difficulty: (DIFFICULTIES as readonly string[]).includes(value.difficulty) ? value.difficulty : "easy",
        max_attempts: clamp(value.max_attempts, 3, 1, 10),
        kick_after_minutes: clamp(value.kick_after_minutes, 0, 0, 10_080),
        min_account_age_days: clamp(value.min_account_age_days, 0, 0, 365),
        young_account_action: (YOUNG_ACTIONS as readonly string[]).includes(value.young_account_action) ? value.young_account_action : "log",
        log_channel: idOrNull(value.log_channel),
        panel_title: textOrNull(value.panel_title, 100),
        panel_description: textOrNull(value.panel_description, 1500),
        dm_on_join: value.dm_on_join === true,
    };
}

export function getVerifySettings(guildId: string): Promise<VerifySettings> {
    return getSettings("verify_settings", guildId, buildVerifyDefaults(), normalizeVerify);
}

export function saveVerifySettings(guildId: string, patch: Partial<VerifySettings>): Promise<VerifySettings> {
    return saveSettings("verify_settings", guildId, patch, buildVerifyDefaults(), normalizeVerify);
}
