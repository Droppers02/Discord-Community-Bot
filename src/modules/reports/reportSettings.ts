import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { tk } from "../../lib/i18n.js";

// Denúncias de mensagens (botão direito → Apps → Reportar mensagem).

export const REPORT_REASONS = ["spam", "insultos", "adulto", "odio", "burla", "spoiler", "outro"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, { label: string; emoji: string }> = {
    spam: { label: tk("Spam ou publicidade"), emoji: "📢" },
    insultos: { label: tk("Insultos ou assédio"), emoji: "🤬" },
    adulto: { label: tk("Conteúdo adulto ou chocante"), emoji: "🔞" },
    odio: { label: tk("Ódio ou discriminação"), emoji: "🚫" },
    burla: { label: tk("Burla, links perigosos ou roubo de contas"), emoji: "🎣" },
    spoiler: { label: tk("Spoiler sem aviso"), emoji: "🙈" },
    outro: { label: tk("Outro motivo"), emoji: "❔" },
};

export interface ReportSettings {
    enabled: boolean;
    channel: string | null;
    ping_role: string | null;
    /** DM a quem denunciou quando a equipa tratar. */
    notify_reporter: boolean;
    /** A equipa vê só "N pessoas" em vez de quem denunciou. */
    anonymous: boolean;
    /** Minutos entre denúncias da mesma pessoa. */
    cooldown_minutes: number;
    /** Pessoas diferentes que, ao denunciar a mesma mensagem, a escondem logo (0 = desligado). */
    auto_hide: number;
}

export function buildReportDefaults(): ReportSettings {
    return { enabled: false, channel: null, ping_role: null, notify_reporter: true, anonymous: false, cooldown_minutes: 1, auto_hide: 0 };
}

const ID = /^\d{5,25}$/;

export function normalizeReports(value: ReportSettings): ReportSettings {
    return {
        enabled: value.enabled === true,
        channel: typeof value.channel === "string" && ID.test(value.channel) ? value.channel : null,
        ping_role: typeof value.ping_role === "string" && ID.test(value.ping_role) ? value.ping_role : null,
        notify_reporter: value.notify_reporter !== false,
        anonymous: value.anonymous === true,
        cooldown_minutes: Math.max(0, Math.min(1440, Math.round(Number(value.cooldown_minutes) || 0))),
        auto_hide: Math.max(0, Math.min(20, Math.round(Number(value.auto_hide) || 0))),
    };
}

export const getReportSettings = (guildId: string) => getSettings("report_settings", guildId, buildReportDefaults(), normalizeReports);
export const saveReportSettings = (guildId: string, patch: Partial<ReportSettings>) => saveSettings("report_settings", guildId, patch, buildReportDefaults(), normalizeReports);

export function isReportReason(value: string): value is ReportReason {
    return (REPORT_REASONS as readonly string[]).includes(value);
}
