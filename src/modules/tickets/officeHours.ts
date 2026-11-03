import type { ContainerPlusBuilder } from "@magicyan/discord";
import { LabelBuilder, StringSelectMenuBuilder } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import type { GuildConfig } from "../../types.js";
import { t, tk } from "../../lib/i18n.js";

// Office hours let the bot post an informative "team is offline" notice on tickets opened
// outside support hours — a reliable signal that doesn't need the privileged Presence
// intent. Stored as JSON on guild_config.support_hours_json.

export interface SupportHours {
    enabled: boolean;
    tz: string;
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
}

export const DEFAULT_SUPPORT_TZ = "Europe/Lisbon";

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseSupportHours(config: Pick<GuildConfig, "support_hours_json">): SupportHours | null {
    if (!config.support_hours_json) return null;
    try {
        const parsed = JSON.parse(config.support_hours_json) as Partial<SupportHours>;
        if (typeof parsed.start !== "string" || typeof parsed.end !== "string") return null;
        if (!TIME_RE.test(parsed.start) || !TIME_RE.test(parsed.end)) return null;
        return {
            enabled: parsed.enabled !== false,
            tz: typeof parsed.tz === "string" && parsed.tz.trim() ? parsed.tz : DEFAULT_SUPPORT_TZ,
            start: parsed.start,
            end: parsed.end,
        };
    } catch {
        return null;
    }
}

export function serializeSupportHours(hours: SupportHours): string {
    return JSON.stringify(hours);
}

// A clean, human label for a timezone instead of the raw IANA id (e.g. "Europe/Lisbon").
const TZ_CITY_LABELS: Record<string, string> = {
    "Europe/Lisbon": tk("Lisboa"),
    "Atlantic/Azores": tk("Açores"),
    "Atlantic/Madeira": tk("Madeira"),
    "Europe/London": tk("Londres"),
    "Europe/Madrid": tk("Madrid"),
    "Europe/Paris": tk("Paris"),
    "Europe/Berlin": tk("Berlim"),
    "Europe/Rome": tk("Roma"),
    "Europe/Amsterdam": tk("Amesterdão"),
    "Europe/Zurich": tk("Zurique"),
    "Europe/Warsaw": tk("Varsóvia"),
    "Europe/Athens": tk("Atenas"),
    "Europe/Moscow": tk("Moscovo"),
    "America/Sao_Paulo": tk("São Paulo"),
    "America/New_York": tk("Nova Iorque"),
    "America/Chicago": tk("Chicago"),
    "America/Denver": tk("Denver"),
    "America/Los_Angeles": tk("Los Angeles"),
    "America/Bogota": tk("Bogotá"),
    "America/Argentina/Buenos_Aires": tk("Buenos Aires"),
    "Africa/Luanda": tk("Luanda"),
    "Africa/Maputo": tk("Maputo"),
    "Africa/Praia": tk("Cabo Verde"),
    "Asia/Dubai": tk("Dubai"),
    "Asia/Tokyo": tk("Tóquio"),
    "Australia/Sydney": tk("Sydney"),
    "UTC": tk("UTC"),
};

/** Fusos oferecidos no seletor do painel — cobrem a lusofonia e os mercados vizinhos. */
export const SUPPORT_TIMEZONES: readonly string[] = [
    "Europe/Lisbon", "Atlantic/Madeira", "Atlantic/Azores", "Africa/Praia",
    "Europe/Madrid", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome",
    "Europe/Amsterdam", "Europe/Warsaw", "Europe/Athens", "Europe/Moscow",
    "America/Sao_Paulo", "America/Argentina/Buenos_Aires", "America/Bogota",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "Africa/Luanda", "Africa/Maputo", "Asia/Dubai", "Asia/Tokyo", "UTC",
];

export function friendlyTimezone(tz: string): string {
    // Fora da lista (qualquer fuso válido pode ser gravado): o nome da cidade do próprio id.
    const label = TZ_CITY_LABELS[tz];
    return label ? t(label) : tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}

/** Deslocamento (ms) do fuso num dado instante — o que o `Intl` sabe e o `Date` não expõe. */
function timezoneOffsetMs(tz: string, date: Date): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date);
    const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
    const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
    return asUtc - date.getTime();
}

/** Converte uma hora de parede num fuso para epoch ms (duas passagens: cobre mudanças de hora). */
function zonedWallClockToEpoch(tz: string, year: number, month: number, day: number, hour: number, minute: number): number {
    const naive = Date.UTC(year, month - 1, day, hour, minute);
    const firstPass = naive - timezoneOffsetMs(tz, new Date(naive));
    return naive - timezoneOffsetMs(tz, new Date(firstPass));
}

/** Data de parede (Y/M/D) no fuso, para o dia em que `now` cai. */
function zonedDateParts(tz: string, now: Date): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
    return { year: read("year"), month: read("month"), day: read("day") };
}

const ONE_DAY_MS = 86_400_000;

/**
 * Instantes (epoch em segundos) do início e fim da janela de atendimento em curso — ou da
 * próxima, se a de hoje já passou. É o que permite mostrar o horário como timestamp do
 * Discord, ou seja, na hora do relógio de quem está a ler e não na de Lisboa.
 */
export function supportWindowInstants(hours: SupportHours, now: Date = new Date()): { start: number; end: number } {
    const { year, month, day } = zonedDateParts(hours.tz, now);
    const [startHour, startMinute] = hours.start.split(":").map(Number);
    const [endHour, endMinute] = hours.end.split(":").map(Number);

    let start = zonedWallClockToEpoch(hours.tz, year, month, day, startHour, startMinute);
    let end = zonedWallClockToEpoch(hours.tz, year, month, day, endHour, endMinute);
    if (end <= start) end += ONE_DAY_MS; // janela que atravessa a meia-noite (ex.: 22:00 → 08:00)
    // Janela de hoje já fechada → mostrar a de amanhã, que é a que interessa a quem lê.
    if (now.getTime() >= end) { start += ONE_DAY_MS; end += ONE_DAY_MS; }

    return { start: Math.floor(start / 1000), end: Math.floor(end / 1000) };
}

/**
 * Janela de atendimento como timestamps do Discord: cada pessoa vê a hora no SEU fuso,
 * em vez de um "das 9:00 às 21:00" que só fazia sentido para quem vivesse em Lisboa.
 */
export function formatSupportWindow(hours: SupportHours, now: Date = new Date()): string {
    const { start, end } = supportWindowInstants(hours, now);
    return t("das {start} às {end}", { start: `<t:${start}:t>`, end: `<t:${end}:t>` });
}

/** Linha de rodapé que mantém visível o horário oficial (o do servidor), sem confundir. */
export function formatSupportWindowNote(hours: SupportHours): string {
    return `-# ${t("Na tua hora local · horário oficial {hours}", { hours: formatSupportWindowPlain(hours) })}`;
}

/** Same info without Discord markdown — for compact, inline summaries. */
export function formatSupportWindowPlain(hours: SupportHours): string {
    return `${hours.start}–${hours.end} · ${friendlyTimezone(hours.tz)}`;
}

/** Validate a timezone id by attempting to format with it. */
export function isValidTimezone(tz: string): boolean {
    try {
        new Intl.DateTimeFormat("en-GB", { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

function toMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

/** Current minutes-of-day in the given timezone (0..1439). */
function nowMinutesInTz(tz: string, now: Date): number {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
}

/** True when `now` falls inside the support window (handles overnight windows). */
export function isWithinSupportHours(hours: SupportHours, now: Date = new Date()): boolean {
    const current = nowMinutesInTz(hours.tz, now);
    const start = toMinutes(hours.start);
    const end = toMinutes(hours.end);
    if (start === end) return true; // 24h coverage
    if (start < end) return current >= start && current < end;
    return current >= start || current < end; // overnight (e.g. 22:00 → 08:00)
}

/** True when support is configured, enabled, and we're currently outside the window. */
export function isSupportOffline(config: Pick<GuildConfig, "support_hours_json">, now: Date = new Date()): boolean {
    const hours = parseSupportHours(config);
    if (!hours || !hours.enabled) return false;
    return !isWithinSupportHours(hours, now);
}

// ─── Campos do formulário (partilhados pelo /config e pelo assistente) ───────
// Escolher em listas, e não escrever "09:00" e "Europe/Lisbon" à mão: era o único sítio
// do bot onde se pedia um identificador IANA a quem está a configurar.

/**
 * Horas do dia como opções de menu. Os menus do Discord param nas 25 opções, por isso a
 * lista é de hora a hora; se o horário guardado tiver minutos (configuração antiga), esse
 * valor entra na lista para não se perder ao reabrir o formulário.
 */
function hourOptions(selected: string): Array<{ label: string; value: string; default: boolean }> {
    const hours = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);
    if (!hours.includes(selected)) hours.push(selected);
    return hours.map((value) => ({ label: value, value, default: value === selected }));
}

function hourSelectLabel(id: string, label: string, description: string, selected: string): LabelBuilder {
    return new LabelBuilder()
        .setLabel(label)
        .setDescription(description)
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(t("Escolhe a hora…")).addOptions(hourOptions(selected)));
}

/** Os três campos do formulário de horário: início, fim e fuso — todos em lista. */
export function supportHoursModalFields(hours: SupportHours | null): [LabelBuilder, LabelBuilder, LabelBuilder] {
    const selectedTz = hours?.tz ?? DEFAULT_SUPPORT_TZ;
    // Fuso guardado fora da lista curta (configuração antiga): entra na lista para não se perder.
    const timezones = SUPPORT_TIMEZONES.includes(selectedTz) ? SUPPORT_TIMEZONES : [selectedTz, ...SUPPORT_TIMEZONES];

    return [
        hourSelectLabel("start", t("Início do atendimento"), t("A partir desta hora os tickets são tratados como em horário."), hours?.start ?? "09:00"),
        hourSelectLabel("end", t("Fim do atendimento"), t("Depois desta hora os tickets recebem o aviso de fora de horas."), hours?.end ?? "22:00"),
        new LabelBuilder()
            .setLabel(t("Fuso horário"))
            .setDescription(t("O fuso da tua equipa — a cada membro o horário aparece na hora dele."))
            .setStringSelectMenuComponent(new StringSelectMenuBuilder()
                .setCustomId("tz")
                .setPlaceholder(t("Escolhe o fuso horário…"))
                .addOptions(timezones.slice(0, 25).map((tz) => ({
                    label: friendlyTimezone(tz).slice(0, 100),
                    value: tz,
                    description: tz.slice(0, 100),
                    default: tz === selectedTz,
                })))),
    ];
}

/** The informative notice posted in a ticket opened outside support hours. */
export function buildOfflineNotice(config: GuildConfig): ContainerPlusBuilder | null {
    const hours = parseSupportHours(config);
    if (!hours) return null;
    return buildContainer({
        color: COLORS.warning,
        title: `${emoji.clock} ${t("Fora do horário de atendimento")}`,
        description: t("Recebemos o teu pedido! De momento estamos **fora do horário de atendimento**, por isso a resposta pode demorar um pouco mais."),
        fields: [
            { name: t("Horário de atendimento"), value: `${formatSupportWindow(hours)}\n${formatSupportWindowNote(hours)}` },
            { name: t("O que acontece agora"), value: t("A equipa responde assim que estiver disponível. Deixa já toda a informação relevante para acelerarmos o atendimento.") },
        ],
        footerText: config.server_name ?? t("Central de Suporte"),
    });
}
