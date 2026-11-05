import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { t, tk } from "../../lib/i18n.js";

// Trancar canais / o servidor e o horário de silêncio (canais que fecham ou ficam em slowmode a
// certas horas, todos os dias ou só em alguns). As horas são sempre de Lisboa.

export const QUIET_MODES = ["lock", "slowmode"] as const;
export type QuietMode = (typeof QUIET_MODES)[number];
export const QUIET_MODE_LABELS: Record<QuietMode, string> = { lock: tk("Trancar"), slowmode: tk("Slowmode") };

export interface QuietRule {
    id: string;
    name: string;
    channels: string[];
    /** "HH:MM" (Lisboa). Se o fim for antes do início, a janela atravessa a meia-noite. */
    start: string;
    end: string;
    /** 0 = domingo … 6 = sábado (o dia em que a janela COMEÇA). */
    days: number[];
    mode: QuietMode;
    /** Segundos de slowmode (modo "slowmode"). */
    slowmode: number;
    announce: boolean;
    enabled: boolean;
}

export interface LockdownSettings {
    /** Cargos a trancar (vazio = @everyone). */
    roles: string[];
    /** Canais que o "trancar servidor" nunca mexe (regras, anúncios da equipa…). */
    excluded_channels: string[];
    /** Deixar um aviso no canal ao trancar e ao destrancar. */
    announce: boolean;
    /** Ao trancar o servidor, pausar também os convites (até 24 h). */
    pause_invites: boolean;
    /** O anti-raid tranca o servidor sozinho quando deteta um raid. */
    raid_lockdown: boolean;
    raid_lockdown_minutes: number;
    quiet_enabled: boolean;
    quiet_rules: QuietRule[];
}

export const MAX_QUIET_RULES = 8;
const ID = /^\d{5,25}$/;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function buildLockdownDefaults(): LockdownSettings {
    return {
        roles: [],
        excluded_channels: [],
        announce: true,
        pause_invites: true,
        raid_lockdown: false,
        raid_lockdown_minutes: 30,
        quiet_enabled: false,
        quiet_rules: [],
    };
}

function ids(value: unknown, max = 25): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && ID.test(id)))].slice(0, max) : [];
}

export function normalizeTime(value: unknown, fallback: string): string {
    const match = typeof value === "string" ? value.trim().replace(/h/i, ":").replace(/:$/, ":00").match(HHMM) : null;
    return match ? `${match[1]!.padStart(2, "0")}:${match[2]}` : fallback;
}

export function normalizeQuietRule(value: Partial<QuietRule>): QuietRule {
    const days = Array.isArray(value.days) ? [...new Set(value.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort() : [];
    return {
        id: typeof value.id === "string" && value.id ? value.id.slice(0, 12) : Math.random().toString(36).slice(2, 10),
        name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 40) : t("Horário"),
        channels: ids(value.channels),
        start: normalizeTime(value.start, "00:00"),
        end: normalizeTime(value.end, "08:00"),
        days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
        mode: (QUIET_MODES as readonly string[]).includes(String(value.mode)) ? value.mode as QuietMode : "lock",
        slowmode: Math.max(5, Math.min(21_600, Math.round(Number(value.slowmode) || 30))),
        announce: value.announce !== false,
        enabled: value.enabled !== false,
    };
}

export function normalizeLockdown(value: LockdownSettings): LockdownSettings {
    return {
        roles: ids(value.roles, 10),
        excluded_channels: ids(value.excluded_channels),
        announce: value.announce !== false,
        pause_invites: value.pause_invites !== false,
        raid_lockdown: value.raid_lockdown === true,
        raid_lockdown_minutes: Math.max(5, Math.min(1_440, Math.round(Number(value.raid_lockdown_minutes) || 30))),
        quiet_enabled: value.quiet_enabled === true,
        quiet_rules: Array.isArray(value.quiet_rules) ? value.quiet_rules.slice(0, MAX_QUIET_RULES).map(normalizeQuietRule) : [],
    };
}

export const getLockdownSettings = (guildId: string) => getSettings("lockdown_settings", guildId, buildLockdownDefaults(), normalizeLockdown);
export const saveLockdownSettings = (guildId: string, patch: Partial<LockdownSettings>) => saveSettings("lockdown_settings", guildId, patch, buildLockdownDefaults(), normalizeLockdown);

// ─── Janelas de horário ──────────────────────────────────────────────────────

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * A regra está ativa neste momento? `weekday` (0 = domingo) e `minute` (0–1439) são de Lisboa.
 * Janela noturna (ex.: 23:00–07:00): conta a partir do dia em que começa, até à manhã seguinte.
 */
export function insideQuietWindow(rule: Pick<QuietRule, "start" | "end" | "days">, weekday: number, minute: number): boolean {
    const start = minutesOf(rule.start);
    const end = minutesOf(rule.end);
    if (start === end) return false;
    if (start < end) return rule.days.includes(weekday) && minute >= start && minute < end;
    // Atravessa a meia-noite: antes da meia-noite conta o dia de hoje; depois, o de ontem.
    if (minute >= start) return rule.days.includes(weekday);
    if (minute < end) return rule.days.includes((weekday + 6) % 7);
    return false;
}

export const WEEKDAY_SHORT = [tk("dom"), tk("seg"), tk("ter"), tk("qua"), tk("qui"), tk("sex"), tk("sáb")];

/** "todos os dias", "seg–sex", "sáb, dom"… */
export function describeDays(days: number[]): string {
    const set = new Set(days);
    if (set.size === 7) return t("todos os dias");
    if (set.size === 5 && [1, 2, 3, 4, 5].every((day) => set.has(day))) return t("dias úteis");
    if (set.size === 2 && set.has(0) && set.has(6)) return t("fins de semana");
    return [1, 2, 3, 4, 5, 6, 0].filter((day) => set.has(day)).map((day) => t(WEEKDAY_SHORT[day]!)).join(", ");
}

/** Lê "todos", "úteis", "fds", "seg,qua,sex", "seg-sex"… (vazio = todos). */
export function parseDays(input: string): number[] | null {
    const text = input.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!text || /^(todos|todos os dias|sempre|diario)$/.test(text)) return [0, 1, 2, 3, 4, 5, 6];
    if (/^(uteis|dias uteis|semana)$/.test(text)) return [1, 2, 3, 4, 5];
    if (/^(fds|fim de semana|fins de semana)$/.test(text)) return [0, 6];
    const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const indexOf = (word: string) => names.findIndex((name) => word.startsWith(name));
    const days = new Set<number>();
    for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
        const range = part.match(/^([a-z]+)-([a-z]+)$/);
        if (range) {
            const from = indexOf(range[1]!);
            const to = indexOf(range[2]!);
            if (from < 0 || to < 0) return null;
            for (let day = from; ; day = (day + 1) % 7) {
                days.add(day);
                if (day === to) break;
            }
            continue;
        }
        const day = indexOf(part);
        if (day < 0) return null;
        days.add(day);
    }
    return days.size ? [...days].sort() : null;
}
