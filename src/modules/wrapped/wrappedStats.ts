import { tk } from "../../lib/i18n.js";

// EPA Wrapped — contas puras: períodos, sequências de dias, favoritos e a "persona".

const partsFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function lisbonParts(ms: number): { year: number; month: number; day: number; hour: number; weekday: number } {
    const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), weekday: WEEKDAYS.indexOf(parts.weekday ?? "Sun") };
}

/** "2026-11" (mês de Lisboa). */
export function monthOf(ms: number): string {
    const { year, month } = lisbonParts(ms);
    return `${year}-${String(month).padStart(2, "0")}`;
}

export type WrappedPeriod = "mes" | "mes-passado" | "ano" | "ano-passado";

export const MONTH_NAMES = [tk("janeiro"), tk("fevereiro"), tk("março"), tk("abril"), tk("maio"), tk("junho"), tk("julho"), tk("agosto"), tk("setembro"), tk("outubro"), tk("novembro"), tk("dezembro")];
export const WEEKDAY_NAMES = [tk("domingo"), tk("segunda"), tk("terça"), tk("quarta"), tk("quinta"), tk("sexta"), tk("sábado")];

export interface PeriodRange {
    /** Dias (YYYY-MM-DD) inclusive. */
    fromDay: string;
    toDay: string;
    /** Meses (YYYY-MM) que o período apanha. */
    months: string[];
    /** Limites em ms (para o histórico de moedas). */
    fromMs: number;
    toMs: number;
    /** Ex.: "novembro de 2026", "2026". */
    label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function periodRange(period: WrappedPeriod, now = Date.now()): PeriodRange {
    const today = lisbonParts(now);
    let year = today.year;
    let month = today.month;
    if (period === "mes-passado") {
        month -= 1;
        if (month === 0) { month = 12; year -= 1; }
    }
    if (period === "ano" || period === "ano-passado") {
        const y = period === "ano" ? today.year : today.year - 1;
        const last = period === "ano" ? `${y}-${pad(today.month)}-${pad(today.day)}` : `${y}-12-31`;
        const months = Array.from({ length: period === "ano" ? today.month : 12 }, (_, index) => `${y}-${pad(index + 1)}`);
        return { fromDay: `${y}-01-01`, toDay: last, months, fromMs: Date.UTC(y, 0, 1) - 3_600_000, toMs: period === "ano" ? now : Date.UTC(y + 1, 0, 1), label: String(y) };
    }
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lastDay = period === "mes" ? today.day : daysInMonth;
    return {
        fromDay: `${year}-${pad(month)}-01`,
        toDay: `${year}-${pad(month)}-${pad(lastDay)}`,
        months: [`${year}-${pad(month)}`],
        fromMs: Date.UTC(year, month - 1, 1) - 3_600_000,
        toMs: period === "mes" ? now : Date.UTC(year, month, 1),
        label: `${MONTH_NAMES[month - 1]} ${year}`,
    };
}

/** Maior número de dias seguidos (dias "YYYY-MM-DD" ordenados ou não). */
export function longestStreak(days: string[]): number {
    const sorted = [...new Set(days)].sort();
    let best = 0;
    let current = 0;
    let previous: number | null = null;
    for (const day of sorted) {
        const ms = Date.parse(`${day}T00:00:00Z`);
        current = previous !== null && ms - previous === 86_400_000 ? current + 1 : 1;
        best = Math.max(best, current);
        previous = ms;
    }
    return best;
}

/** O que mais aparece (chave e total), ou null. */
export function topEntry(entries: Array<{ key: string; count: number }>): { key: string; count: number } | null {
    return entries.reduce<{ key: string; count: number } | null>((best, entry) => (!best || entry.count > best.count ? entry : best), null);
}

export interface PersonaInput {
    messages: number;
    voiceHours: number;
    activeDays: number;
    periodDays: number;
    favoriteHour: number | null;
    channelsUsed: number;
    emojis: number;
    percentile: number | null;
}

export interface Persona { emoji: string; title: string; line: string }

/** A "persona" da retrospetiva — a característica que mais salta à vista. */
export function personaFor(input: PersonaInput): Persona {
    const { messages, voiceHours, activeDays, periodDays, favoriteHour, channelsUsed, emojis, percentile } = input;
    if (messages + voiceHours * 20 < 15) return { emoji: "👻", title: tk("O Fantasma"), line: tk("Passa por cá em modo invisível… aparece mais!") };
    if (voiceHours >= 10 && voiceHours * 30 > messages) return { emoji: "🎙️", title: tk("Monarca da Voz"), line: tk("A voz é a tua casa — o teclado é só decoração.") };
    if (percentile !== null && percentile <= 5 && messages >= 300) return { emoji: "⌨️", title: tk("Teclado em Chamas"), line: tk("Estás no top 5% de quem mais escreve. O teclado pede férias.") };
    if (favoriteHour !== null && (favoriteHour >= 23 || favoriteHour <= 4)) return { emoji: "🦉", title: tk("Coruja da Noite"), line: tk("O servidor ganha vida quando o resto do mundo dorme.") };
    if (favoriteHour !== null && favoriteHour >= 6 && favoriteHour <= 9) return { emoji: "🌅", title: tk("Madrugador"), line: tk("Bom dia antes de toda a gente acordar.") };
    if (periodDays >= 7 && activeDays / periodDays >= 0.85) return { emoji: "📅", title: tk("Sempre Presente"), line: tk("Quase todos os dias por cá — és mobília do servidor.") };
    if (emojis >= Math.max(30, messages * 0.4)) return { emoji: "😂", title: tk("Mestre dos Emojis"), line: tk("Para quê palavras quando há emojis?") };
    if (channelsUsed >= 10) return { emoji: "🧭", title: tk("Explorador"), line: tk("Não há canal onde não tenhas deixado marca.") };
    return { emoji: "💬", title: tk("Membro de Ouro"), line: tk("Parte da alma do servidor. Continua assim!") };
}
