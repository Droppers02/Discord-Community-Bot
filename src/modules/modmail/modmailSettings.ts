import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";

// Modmail: um membro manda mensagem privada ao bot e a conversa abre como ticket (que ele não
// vê) — a equipa responde no canal e o bot encaminha as respostas por DM. Fecho, transcrição,
// avaliação e avisos de SLA são os dos tickets normais.

export interface ModmailSettings {
    enabled: boolean;
    /** Categoria de ticket usada (id de `ticket_categories`); null = a primeira. */
    category: string | null;
    /** As respostas chegam como "Equipa de <servidor>", sem o nome de quem respondeu. */
    anonymous_replies: boolean;
    /** Mensagens da equipa começadas por isto ficam só no canal (notas internas). */
    note_prefix: string;
    /** Resposta automática quando a conversa abre; null = texto por omissão. */
    greeting: string | null;
    /** Mensagem quando a conversa é fechada; null = texto por omissão. */
    closing: string | null;
}

export function buildModmailDefaults(): ModmailSettings {
    return { enabled: false, category: null, anonymous_replies: false, note_prefix: "!", greeting: null, closing: null };
}

function textOrNull(value: unknown, max: number): string | null {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export function normalizeModmail(value: ModmailSettings): ModmailSettings {
    const prefix = typeof value.note_prefix === "string" ? value.note_prefix.trim().slice(0, 5) : "!";
    return {
        ...value,
        enabled: value.enabled === true,
        category: typeof value.category === "string" && value.category ? value.category.slice(0, 64) : null,
        anonymous_replies: value.anonymous_replies === true,
        note_prefix: prefix || "!",
        greeting: textOrNull(value.greeting, 1000),
        closing: textOrNull(value.closing, 1000),
    };
}

export function getModmailSettings(guildId: string): Promise<ModmailSettings> {
    return getSettings("modmail_settings", guildId, buildModmailDefaults(), normalizeModmail);
}

export function saveModmailSettings(guildId: string, patch: Partial<ModmailSettings>): Promise<ModmailSettings> {
    return saveSettings("modmail_settings", guildId, patch, buildModmailDefaults(), normalizeModmail);
}
