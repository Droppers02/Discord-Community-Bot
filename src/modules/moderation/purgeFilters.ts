import type { Message } from "discord.js";
import { t, tk } from "../../lib/i18n.js";

// /limpar — a parte "pura" (sem Discord): que mensagens contam, até onde se procura e como se lê
// um link/ID de mensagem. O serviço (purgeService.ts) só vai buscar as mensagens e apaga.

/** O Discord só apaga em massa mensagens com menos de 14 dias (com 1 min de margem). */
export const BULK_MAX_AGE_MS = 14 * 86_400_000 - 60_000;

export const PURGE_KINDS = ["links", "convites", "anexos", "media", "embeds", "stickers", "mencoes", "texto", "sistema"] as const;
export type PurgeKind = (typeof PURGE_KINDS)[number];

export const PURGE_KIND_LABELS: Record<PurgeKind, string> = {
    links: tk("com links"),
    convites: tk("com convites de servidores"),
    anexos: tk("com ficheiros anexados"),
    media: tk("com imagens, GIFs ou vídeos"),
    embeds: tk("com embeds (cartões de links e bots)"),
    stickers: tk("com stickers"),
    mencoes: tk("com menções"),
    texto: tk("só texto (sem links nem anexos)"),
    sistema: tk("do sistema (entradas, fixações, boosts)"),
};

export type PurgeAuthors = "todos" | "bots" | "humanos";

export interface PurgeFilter {
    userId: string | null;
    authors: PurgeAuthors;
    kind: PurgeKind | null;
    contains: string | null;
    /** As fixadas ficam, a não ser que se peça. */
    includePinned: boolean;
}

export const NO_FILTER: PurgeFilter = { userId: null, authors: "todos", kind: null, contains: null, includePinned: false };

export type PurgeScope =
    /** As últimas N (que passem nos filtros). */
    | { type: "recentes"; amount: number }
    /** Esta mensagem (inclusive) e todas as seguintes. */
    | { type: "desde"; fromId: string }
    /** Entre duas mensagens, as duas inclusive (a ordem não importa). */
    | { type: "intervalo"; fromId: string; toId: string }
    /** Tudo desde este instante (ms). */
    | { type: "periodo"; since: number };

/** A procura vai da mais recente para trás: começa antes de `before` e pára em `low`/`since`. */
export interface ScanBounds {
    before: string | null;
    low: bigint | null;
    since: number | null;
    limit: number;
}

export function scanBounds(scope: PurgeScope, max: number): ScanBounds {
    switch (scope.type) {
        case "recentes":
            return { before: null, low: null, since: null, limit: Math.min(scope.amount, max) };
        case "desde":
            return { before: null, low: BigInt(scope.fromId), since: null, limit: max };
        case "intervalo": {
            const a = BigInt(scope.fromId);
            const b = BigInt(scope.toId);
            const [low, high] = a < b ? [a, b] : [b, a];
            return { before: (high + 1n).toString(), low, since: null, limit: max };
        }
        case "periodo":
            return { before: null, low: null, since: scope.since, limit: max };
    }
}

/** A mensagem já está para lá do limite? (a procura acaba aí) */
export function pastBounds(message: { id: string; createdTimestamp: number }, bounds: ScanBounds): boolean {
    if (bounds.low !== null && BigInt(message.id) < bounds.low) return true;
    if (bounds.since !== null && message.createdTimestamp < bounds.since) return true;
    return false;
}

export interface MessageRef {
    guildId: string | null;
    channelId: string | null;
    messageId: string;
}

/**
 * Link de mensagem, ID simples, ou o "canal-mensagem" que o Discord copia com Shift + Copiar ID.
 */
export function parseMessageRef(input: string): MessageRef | null {
    const text = input.trim();
    const link = text.match(/channels\/(\d{15,25}|@me)\/(\d{15,25})\/(\d{15,25})/);
    if (link) return { guildId: link[1] === "@me" ? null : link[1]!, channelId: link[2]!, messageId: link[3]! };
    const ids = text.match(/^(?:(\d{15,25})\s*[-/ ]\s*)?(\d{15,25})$/);
    if (ids) return { guildId: null, channelId: ids[1] ?? null, messageId: ids[2]! };
    return null;
}

const LINK_RE = /https?:\/\/\S+/i;
const INVITE_RE = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const MEDIA_EMBEDS = new Set(["image", "gifv", "video"]);

type FilterableMessage = Pick<Message, "content" | "author" | "webhookId" | "attachments" | "embeds" | "stickers" | "mentions" | "system">;

/** Texto da mensagem e dos embeds (é onde o "contém" procura). */
export function messageText(message: Pick<Message, "content" | "embeds">): string {
    return [message.content, ...message.embeds.flatMap((embed) => [embed.title, embed.description])].filter(Boolean).join("\n");
}

export function matchesKind(message: FilterableMessage, kind: PurgeKind): boolean {
    const text = messageText(message);
    switch (kind) {
        case "links": return LINK_RE.test(text);
        case "convites": return INVITE_RE.test(text);
        case "anexos": return message.attachments.size > 0;
        case "media":
            return [...message.attachments.values()].some((file) => /^(image|video)\//.test(file.contentType ?? ""))
                || message.embeds.some((embed) => MEDIA_EMBEDS.has(String(embed.data?.type)) || Boolean(embed.image || embed.video));
        case "embeds": return message.embeds.length > 0;
        case "stickers": return message.stickers.size > 0;
        case "mencoes": return message.mentions.everyone || message.mentions.users.size > 0 || message.mentions.roles.size > 0;
        case "texto": return Boolean(message.content.trim()) && !LINK_RE.test(message.content) && message.attachments.size === 0 && message.stickers.size === 0 && message.embeds.length === 0;
        case "sistema": return message.system;
    }
}

/** Passa nos filtros? (as fixadas e as que não se podem apagar são vistas à parte) */
export function matchesFilter(message: FilterableMessage, filter: PurgeFilter): boolean {
    if (filter.userId && message.author.id !== filter.userId) return false;
    const bot = message.author.bot || Boolean(message.webhookId);
    if (filter.authors === "bots" && !bot) return false;
    if (filter.authors === "humanos" && bot) return false;
    if (filter.kind && !matchesKind(message, filter.kind)) return false;
    if (filter.contains && !messageText(message).toLocaleLowerCase("pt-PT").includes(filter.contains.toLocaleLowerCase("pt-PT"))) return false;
    return true;
}

/** Os filtros em texto, para a pré-visualização e o registo. */
export function describeFilter(filter: PurgeFilter): string[] {
    const parts: string[] = [];
    if (filter.userId) parts.push(t("só de {user}", { user: `<@${filter.userId}>` }));
    if (filter.authors === "bots") parts.push(t("só bots e webhooks"));
    if (filter.authors === "humanos") parts.push(t("só pessoas (sem bots)"));
    if (filter.kind) parts.push(t(PURGE_KIND_LABELS[filter.kind]));
    if (filter.contains) parts.push(t("com o texto «{text}»", { text: filter.contains }));
    if (filter.includePinned) parts.push(t("incluindo as fixadas"));
    return parts;
}

/** Separa as que vão em massa (menos de 14 dias) das antigas (só uma a uma). */
export function splitByAge<T extends { createdTimestamp: number }>(messages: T[], now = Date.now()): { bulk: T[]; old: T[] } {
    const bulk: T[] = [];
    const old: T[] = [];
    for (const message of messages) (now - message.createdTimestamp < BULK_MAX_AGE_MS ? bulk : old).push(message);
    return { bulk, old };
}

/** Contagem por chave (autor, canal…), da maior para a menor. */
export function tally(keys: string[]): Array<[string, number]> {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// As mensagens antigas são apagadas uma a uma e cada uma geraria uma entrada "Mensagem apagada" no
// registo do servidor. A limpeza já fica registada (caso + cópia), por isso essas entradas saltam-se.
const suppressed = new Map<string, number>();
const SUPPRESS_TTL_MS = 2 * 60_000;

export function markPurgeDeletion(ids: Iterable<string>): void {
    const until = Date.now() + SUPPRESS_TTL_MS;
    for (const id of ids) suppressed.set(id, until);
    if (suppressed.size > 5_000) {
        const now = Date.now();
        for (const [id, expires] of suppressed) if (expires < now) suppressed.delete(id);
    }
}

export function wasDeletedByPurge(messageId: string): boolean {
    const until = suppressed.get(messageId);
    if (until === undefined) return false;
    suppressed.delete(messageId);
    return until >= Date.now();
}
