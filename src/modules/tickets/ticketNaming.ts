import { tk } from "../../lib/i18n.js";
import { TICKET_NAME_FORMATS, type TicketNameFormat } from "../../types.js";
import { sanitizeChannelName, slugify } from "./categories.js";
import { padTicketNumber } from "./ticketOverview.js";

// Nome do canal de um ticket. A categoria vai sempre à frente; o resto escolhe-se em
// /config → Salas dos tickets (ou no painel do site). O número do ticket continua a existir
// (estado do ticket, logs) mesmo quando não entra no nome.

export const DEFAULT_TICKET_NAME_FORMAT: TicketNameFormat = "category-user";

export const TICKET_NAME_FORMAT_LABELS: Record<TicketNameFormat, string> = {
    "category-user": tk("Categoria + nome"),
    "category-number": tk("Categoria + número"),
    "category-number-user": tk("Categoria + número + nome"),
};

export function normalizeTicketNameFormat(value: unknown): TicketNameFormat {
    return TICKET_NAME_FORMATS.includes(value as TicketNameFormat) ? (value as TicketNameFormat) : DEFAULT_TICKET_NAME_FORMAT;
}

export interface TicketNameParts {
    format: TicketNameFormat;
    /** Nome da categoria como o servidor a vê (não o id interno, que fica para trás quando se renomeia). */
    category: string;
    /** Id interno — só se o nome não tiver letras latinas (árabe, japonês, russo…), que o nome do canal perde. */
    categoryId?: string;
    number: number | null;
    username: string;
}

/**
 * Nome base, sem o sufixo de repetido. Sem número (a contagem falhou), "categoria + número"
 * cai para "categoria + nome" — um canal só "suporte" seria impossível de distinguir.
 * Deixa folga para o sufixo `-NN` dentro dos 100 caracteres do Discord.
 */
export function buildTicketChannelName({ format, category, categoryId, number, username }: TicketNameParts): string {
    const parts = [slugify(category) || slugify(categoryId ?? "") || "ticket"];
    if (format !== "category-user" && number) parts.push(padTicketNumber(number));
    if (format !== "category-number" || !number) parts.push(username);
    return sanitizeChannelName(parts.join("-")).slice(0, 96).replace(/-+$/, "") || "ticket";
}

/** O primeiro de `base`, `base-2`, `base-3`… que a pessoa ainda não tenha aberto. */
export function uniqueTicketChannelName(base: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
}
