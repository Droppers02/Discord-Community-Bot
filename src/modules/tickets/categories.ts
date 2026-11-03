import { t, tk } from "../../lib/i18n.js";
import type { GuildConfig, TicketCategory, TicketCategoryConfig } from "../../types.js";
import { ValidationError } from "../../errors/index.js";

const MIN_TICKET_CATEGORIES = 1;
const MAX_TICKET_CATEGORIES = 8;

export const DEFAULT_TICKET_CATEGORIES: TicketCategoryConfig[] = [
    { id: "suporte", label: tk("Suporte"), channel_id: null, order: 0 },
    { id: "duvidas", label: tk("Dúvidas"), channel_id: null, order: 1 },
    { id: "denuncias", label: tk("Denúncias"), channel_id: null, order: 2 },
    { id: "sugestoes", label: tk("Sugestões"), channel_id: null, order: 3 },
    { id: "outros", label: tk("Outros"), channel_id: null, order: 4 },
];

type CategoryConfigInput = Pick<GuildConfig, "ticket_categories_json"> | { ticket_categories_json?: string | null };

function ensureUniqueCategoryId(baseId: string, usedIds: Set<string>): string {
    let nextId = baseId || "categoria";
    let suffix = 2;

    while (usedIds.has(nextId)) {
        nextId = `${baseId || "categoria"}-${suffix}`;
        suffix += 1;
    }

    usedIds.add(nextId);
    return nextId;
}

/** "Denúncias Graves" → "denuncias-graves". Pode dar vazio (texto só com emojis ou sem letras latinas). */
export function slugify(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

export function sanitizeCategoryId(value: string): string {
    return slugify(value).slice(0, 32) || "categoria";
}

function normalizeStoredCategories(input: unknown): TicketCategoryConfig[] {
    if (!Array.isArray(input)) return [];

    const usedIds = new Set<string>();
    return input
        .slice(0, MAX_TICKET_CATEGORIES)
        .map((entry, index) => {
            if (!entry || typeof entry !== "object") return null;

            const rawLabel = typeof (entry as { label?: unknown }).label === "string" ? (entry as { label: string }).label.trim() : "";
            if (!rawLabel) return null;

            const rawId = typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id : rawLabel;
            const channelId = typeof (entry as { channel_id?: unknown }).channel_id === "string" && (entry as { channel_id: string }).channel_id.trim()
                ? (entry as { channel_id: string }).channel_id
                : null;
            const record = entry as Record<string, unknown>;
            const welcome = typeof record.welcome_message === "string" && record.welcome_message.trim() ? record.welcome_message : null;
            const pingRoles = Array.isArray(record.ping_roles) ? record.ping_roles.filter((value): value is string => typeof value === "string") : [];
            const catEmoji = typeof record.emoji === "string" && record.emoji.trim() ? record.emoji : null;
            const description = typeof record.description === "string" && record.description.trim() ? record.description : null;

            return {
                id: ensureUniqueCategoryId(sanitizeCategoryId(rawId), usedIds),
                label: rawLabel,
                channel_id: channelId,
                order: index,
                welcome_message: welcome,
                ping_roles: pingRoles,
                emoji: catEmoji,
                description,
            } satisfies TicketCategoryConfig;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export function getTicketCategories(config?: CategoryConfigInput | null): TicketCategoryConfig[] {
    if (config?.ticket_categories_json) {
        try {
            const parsed = JSON.parse(config.ticket_categories_json);
            const normalized = normalizeStoredCategories(parsed);
            if (normalized.length >= MIN_TICKET_CATEGORIES) {
                return normalized;
            }
        } catch {
            // Ignore invalid stored JSON and fall back to defaults.
        }
    }

    // As categorias por omissão não estão gravadas: saem na língua do servidor.
    return DEFAULT_TICKET_CATEGORIES.slice(0, MAX_TICKET_CATEGORIES).map((category) => ({ ...category, label: t(category.label) }));
}

export function normalizeTicketCategoriesFromLabels(labels: string[], previous: TicketCategoryConfig[] = []): TicketCategoryConfig[] {
    const cleaned = labels.map((label) => label.trim()).filter(Boolean);
    if (cleaned.length < MIN_TICKET_CATEGORIES || cleaned.length > MAX_TICKET_CATEGORIES) {
        throw new ValidationError(`Define entre ${MIN_TICKET_CATEGORIES} e ${MAX_TICKET_CATEGORIES} categorias.`);
    }

    const usedIds = new Set<string>();
    const remaining = [...previous];

    return cleaned.map((label, index) => {
        const exactIndex = remaining.findIndex((entry) => entry.label.trim().toLowerCase() === label.toLowerCase());
        const exact = exactIndex >= 0 ? remaining.splice(exactIndex, 1)[0] : null;
        const fallback = !exact && remaining[index] ? remaining[index] : null;

        if (exact) {
            return { ...exact, id: ensureUniqueCategoryId(sanitizeCategoryId(exact.id), usedIds), label, order: index };
        }

        if (fallback) {
            remaining.splice(index, 1);
            return { ...fallback, id: ensureUniqueCategoryId(sanitizeCategoryId(fallback.id), usedIds), label, order: index };
        }

        return { id: ensureUniqueCategoryId(sanitizeCategoryId(label), usedIds), label, channel_id: null, order: index };
    });
}

export function serializeTicketCategories(categories: TicketCategoryConfig[]): string {
    return JSON.stringify(
        categories
            .slice(0, MAX_TICKET_CATEGORIES)
            .map((category, index) => ({
                id: sanitizeCategoryId(category.id),
                label: category.label.trim(),
                channel_id: category.channel_id ?? null,
                order: index,
                welcome_message: category.welcome_message?.trim() || null,
                ping_roles: category.ping_roles ?? [],
                emoji: category.emoji?.trim() || null,
                description: category.description?.trim() || null,
            })),
    );
}

export function setCategoryWelcome(categories: TicketCategoryConfig[], categoryId: TicketCategory, message: string | null): TicketCategoryConfig[] {
    return categories.map((category) => (category.id === categoryId ? { ...category, welcome_message: message } : category));
}

export function setCategoryPingRoles(categories: TicketCategoryConfig[], categoryId: TicketCategory, roleIds: string[]): TicketCategoryConfig[] {
    return categories.map((category) => (category.id === categoryId ? { ...category, ping_roles: roleIds } : category));
}

export function setCategoryEmoji(categories: TicketCategoryConfig[], categoryId: TicketCategory, emoji: string | null): TicketCategoryConfig[] {
    return categories.map((category) => (category.id === categoryId ? { ...category, emoji } : category));
}

export function getFirstTicketCategoryId(config?: CategoryConfigInput | null): TicketCategory | null {
    return getTicketCategories(config)[0]?.id ?? null;
}

export function getCategoryLabel(config: CategoryConfigInput | null | undefined, category: TicketCategory): string {
    return getTicketCategories(config).find((entry) => entry.id === category)?.label ?? category;
}

export function getCategoryLabels(config: CategoryConfigInput | null | undefined): Record<TicketCategory, string> {
    return Object.fromEntries(getTicketCategories(config).map((category) => [category.id, category.label]));
}

export function getCategoryLines(config: CategoryConfigInput | null | undefined): string {
    return getTicketCategories(config).map((category) => `• ${category.label}`).join("\n");
}

export function getCategoryChannelId(config: CategoryConfigInput | null | undefined, category: TicketCategory): string | null {
    return getTicketCategories(config).find((entry) => entry.id === category)?.channel_id ?? null;
}

export function setCategoryChannel(categories: TicketCategoryConfig[], categoryId: TicketCategory, channelId: string | null): TicketCategoryConfig[] {
    return categories.map((category) => (category.id === categoryId ? { ...category, channel_id: channelId } : category));
}

export function sanitizeChannelName(value: string): string {
    return slugify(value).slice(0, 100) || "ticket";
}
