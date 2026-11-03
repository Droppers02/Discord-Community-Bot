// Centralized Discord timestamp helpers. Discord renders `<t:unix:style>` in the
// viewer's own locale and timezone — always prefer these over server-side formatted
// strings so every member sees dates localized to themselves.
//
// Accepts either an ISO string (how tickets store timestamps) or epoch milliseconds
// (how giveaways/suggestions/audit store them), so call sites don't have to convert.

import { t } from "./i18n.js";

export type TimeInput = string | number | Date | null | undefined;

type TimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";

/** Resolve any supported input to epoch milliseconds, or null when unparseable. */
export function toEpochMs(input: TimeInput): number | null {
    if (input === null || input === undefined) return null;
    if (input instanceof Date) {
        const ms = input.getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    if (typeof input === "number") return Number.isFinite(input) ? input : null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    // Pure numeric strings are epoch milliseconds (stored as TEXT in some tables).
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const ms = new Date(trimmed).getTime();
    return Number.isFinite(ms) ? ms : null;
}

function toUnixSeconds(input: TimeInput): number | null {
    const ms = toEpochMs(input);
    return ms === null ? null : Math.floor(ms / 1000);
}

/** `<t:unix:style>` for a given input, or a fallback dash when the input is empty/invalid. */
export function timestamp(input: TimeInput, style: TimestampStyle = "f", fallback = "—"): string {
    const seconds = toUnixSeconds(input);
    return seconds === null ? fallback : `<t:${seconds}:${style}>`;
}

/** Relative ("3 hours ago" / "in 2 days"). */
export function relative(input: TimeInput, fallback = "—"): string {
    return timestamp(input, "R", fallback);
}

/** Compact humanized duration ("2d 3h", "45min", "12s") from a millisecond span. */
export function humanizeDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return t("{n}s", { n: 0 });
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    // Unidades curtas na língua do servidor ("2d 3h" / "2日 3時間" / "2 д 3 ч").
    const parts: string[] = [];
    if (days) parts.push(t("{n}d", { n: days }));
    if (hours) parts.push(t("{n}h", { n: hours }));
    if (minutes && !days) parts.push(t("{n}min", { n: minutes }));
    if (seconds && !days && !hours) parts.push(t("{n}s", { n: seconds }));
    return parts.slice(0, 2).join(" ") || t("{n}s", { n: 0 });
}
