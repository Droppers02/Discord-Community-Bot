import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { TICKET_PRIORITIES, type TicketPriority } from "../../types.js";

// Avisos de SLA: quando um ticket passa a meta de primeira resposta sem ninguém da equipa o
// assumir, o bot avisa — num canal da equipa e/ou dentro do próprio ticket. Se continuar sem
// resposta, pode escalar para outro cargo; e pode avisar também quando passa a meta de
// resolução. As metas base são as do servidor (guild_config); aqui define-se uma por prioridade.

export interface SlaSettings {
    enabled: boolean;
    /** Canal da equipa para os avisos; null = só dentro do ticket. */
    alert_channel: string | null;
    /** Avisar também dentro do próprio ticket. */
    alert_in_ticket: boolean;
    /** Cargo mencionado; null = o cargo da equipa do servidor. */
    mention_role: string | null;
    /** Meta de primeira resposta por prioridade, em minutos; null = a meta base do servidor. */
    priority_minutes: Record<TicketPriority, number | null>;
    /** Minutos depois do primeiro aviso para escalar; 0 = não escala. */
    escalate_after_minutes: number;
    /** Cargo avisado no escalamento; null = o cargo de administração. */
    escalate_role: string | null;
    /** Avisar quando um ticket passa a meta de resolução. */
    resolution_alert: boolean;
    /** Não avisar fora do horário de atendimento (o aviso sai quando a equipa volta). */
    office_hours_only: boolean;
}

export function buildSlaDefaults(): SlaSettings {
    return {
        enabled: false,
        alert_channel: null,
        alert_in_ticket: true,
        mention_role: null,
        priority_minutes: { low: null, normal: null, high: null, urgent: null },
        escalate_after_minutes: 0,
        escalate_role: null,
        resolution_alert: false,
        office_hours_only: true,
    };
}

function minutesOrNull(value: unknown): number | null {
    const n = Number(value);
    return value === null || value === undefined || value === "" || !Number.isFinite(n) || n <= 0 ? null : Math.min(10_080, Math.round(n));
}

export function normalizeSla(value: SlaSettings): SlaSettings {
    const raw = (value.priority_minutes ?? {}) as Partial<Record<TicketPriority, unknown>>;
    const priority_minutes = Object.fromEntries(TICKET_PRIORITIES.map((p) => [p, minutesOrNull(raw[p])])) as Record<TicketPriority, number | null>;
    const escalate = Number(value.escalate_after_minutes);
    return {
        ...value,
        enabled: value.enabled === true,
        alert_channel: typeof value.alert_channel === "string" && value.alert_channel ? value.alert_channel : null,
        alert_in_ticket: value.alert_in_ticket !== false,
        mention_role: typeof value.mention_role === "string" && value.mention_role ? value.mention_role : null,
        priority_minutes,
        escalate_after_minutes: Number.isFinite(escalate) && escalate > 0 ? Math.min(10_080, Math.round(escalate)) : 0,
        escalate_role: typeof value.escalate_role === "string" && value.escalate_role ? value.escalate_role : null,
        resolution_alert: value.resolution_alert === true,
        office_hours_only: value.office_hours_only !== false,
    };
}

export function getSlaSettings(guildId: string): Promise<SlaSettings> {
    return getSettings("sla_settings", guildId, buildSlaDefaults(), normalizeSla);
}

export function saveSlaSettings(guildId: string, patch: Partial<SlaSettings>): Promise<SlaSettings> {
    return saveSettings("sla_settings", guildId, patch, buildSlaDefaults(), normalizeSla);
}
