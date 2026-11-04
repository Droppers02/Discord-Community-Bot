import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Pedidos de revisão de banimento (ban appeal). Quem é banido com /mod banir recebe por DM o link
// para adicionar o bot à conta e o /apelo para pedir (ver appealAccess.ts — sem isso o Discord não
// entrega ao bot os cliques de quem já não partilha o servidor). A equipa vê o pedido num canal
// próprio, discute numa thread, vota, faz perguntas e aprova (desbane + convite) ou recusa. O membro
// vê tudo no /apelo (estado, perguntas, resposta e convite), mesmo que as DMs do bot não cheguem.

export interface AppealSettings {
    enabled: boolean;
    /** Canal onde a equipa recebe e decide os pedidos. */
    channel: string | null;
    /** Cargo mencionado a cada pedido novo. */
    ping_role: string | null;
    /** Horas depois do ban antes de poder pedir revisão (0 = logo). */
    min_hours_after_ban: number;
    /** Dias de espera depois de um pedido recusado. */
    cooldown_days: number;
    /** Máximo de pedidos por pessoa (0 = sem limite). */
    max_appeals: number;
    /** Ao aprovar, enviar um convite de uso único (24 h) na DM. */
    invite_on_accept: boolean;
    /** Canal do convite (vazio = canal de sistema ou o primeiro canal de texto). */
    invite_channel: string | null;
    /** Abrir uma thread de discussão em cada pedido. */
    discussion_threads: boolean;
    questions: [string, string, string];
}

export const DEFAULT_QUESTIONS: [string, string, string] = [
    "Porque é que achas que foste banido?",
    "Porque é que devemos levantar o ban?",
    "Há mais alguma coisa que devamos saber?",
];

export function buildAppealDefaults(): AppealSettings {
    return {
        enabled: false,
        channel: null,
        ping_role: null,
        min_hours_after_ban: 0,
        cooldown_days: 7,
        max_appeals: 3,
        invite_on_accept: true,
        invite_channel: null,
        discussion_threads: true,
        questions: [...DEFAULT_QUESTIONS],
    };
}

function idOrNull(value: unknown): string | null {
    return typeof value === "string" && /^\d{5,25}$/.test(value) ? value : null;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export function normalizeAppeal(value: AppealSettings): AppealSettings {
    const questions = (Array.isArray(value.questions) ? value.questions : []).slice(0, 3);
    return {
        enabled: value.enabled === true,
        channel: idOrNull(value.channel),
        ping_role: idOrNull(value.ping_role),
        min_hours_after_ban: clamp(value.min_hours_after_ban, 0, 0, 720),
        cooldown_days: clamp(value.cooldown_days, 7, 0, 365),
        max_appeals: clamp(value.max_appeals, 3, 0, 20),
        invite_on_accept: value.invite_on_accept !== false,
        invite_channel: idOrNull(value.invite_channel),
        discussion_threads: value.discussion_threads !== false,
        questions: DEFAULT_QUESTIONS.map((fallback, i) => {
            const text = questions[i];
            return typeof text === "string" && text.trim() ? text.trim().slice(0, 45) : fallback;
        }) as [string, string, string],
    };
}

export function getAppealSettings(guildId: string): Promise<AppealSettings> {
    return getSettings("appeal_settings", guildId, buildAppealDefaults(), normalizeAppeal);
}

export function saveAppealSettings(guildId: string, patch: Partial<AppealSettings>): Promise<AppealSettings> {
    return saveSettings("appeal_settings", guildId, patch, buildAppealDefaults(), normalizeAppeal);
}
