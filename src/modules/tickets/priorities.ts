import { COLORS } from "../../lib/branding.js";
import { TICKET_PRIORITIES, type TicketPriority } from "../../types.js";
import { t, tk } from "../../lib/i18n.js";

export interface PriorityMeta {
    value: TicketPriority;
    label: string;
    icon: string;
    /** Higher = more urgent; used for ordering (urgent first). */
    rank: number;
}

export const PRIORITY_META: Record<TicketPriority, PriorityMeta> = {
    low: { value: "low", label: tk("Baixa"), icon: "🟢", rank: 0 },
    normal: { value: "normal", label: tk("Normal"), icon: "⚪", rank: 1 },
    high: { value: "high", label: tk("Alta"), icon: "🟠", rank: 2 },
    urgent: { value: "urgent", label: tk("Urgente"), icon: "🔴", rank: 3 },
};

export function isTicketPriority(value: string): value is TicketPriority {
    return (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export function priorityMeta(priority: TicketPriority | null | undefined): PriorityMeta {
    return PRIORITY_META[priority ?? "normal"] ?? PRIORITY_META.normal;
}

export function priorityLabel(priority: TicketPriority | null | undefined): string {
    const meta = priorityMeta(priority);
    return `${meta.icon} ${t(meta.label)}`;
}

/** Sort comparator: most urgent first, then oldest first (stable triage order). */
export function comparePriority(a: { priority: TicketPriority; created_at: string }, b: { priority: TicketPriority; created_at: string }): number {
    const diff = priorityMeta(b.priority).rank - priorityMeta(a.priority).rank;
    if (diff !== 0) return diff;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
}

/** Accent color for a ticket container based on its priority (falls back to the branding color). */
export function priorityColor(priority: TicketPriority | null | undefined, fallback: number): number {
    switch (priority) {
        case "urgent": return COLORS.danger;
        case "high": return COLORS.warning;
        default: return fallback;
    }
}

export const PRIORITY_ORDER: TicketPriority[] = ["urgent", "high", "normal", "low"];
