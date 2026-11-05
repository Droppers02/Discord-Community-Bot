import { Collection, SnowflakeUtil, type Guild, type Message } from "discord.js";
import { describe, expect, it } from "vitest";
import {
    BULK_MAX_AGE_MS,
    NO_FILTER,
    markPurgeDeletion,
    matchesFilter,
    matchesKind,
    parseMessageRef,
    pastBounds,
    scanBounds,
    splitByAge,
    tally,
    wasDeletedByPurge,
    type PurgeFilter,
} from "../../src/modules/moderation/purgeFilters.js";
import { collectPlan, type PurgeRequest } from "../../src/modules/moderation/purgeService.js";

const NOW = Date.now();

interface FakeOptions {
    author?: string;
    bot?: boolean;
    content?: string;
    pinned?: boolean;
    deletable?: boolean;
    attachments?: Array<{ contentType: string }>;
    ageMs?: number;
}

function fakeMessage(index: number, options: FakeOptions = {}): Message {
    // index 0 = a mais recente; cada uma 1 min mais antiga que a anterior.
    const createdTimestamp = NOW - (options.ageMs ?? index * 60_000);
    const id = SnowflakeUtil.generate({ timestamp: createdTimestamp }).toString();
    return {
        id,
        createdTimestamp,
        channelId: "c1",
        pinned: options.pinned ?? false,
        deletable: options.deletable ?? true,
        system: false,
        webhookId: null,
        content: options.content ?? `mensagem ${index}`,
        author: { id: options.author ?? "u1", bot: options.bot ?? false },
        attachments: new Collection((options.attachments ?? []).map((file, i) => [`a${i}`, file])),
        embeds: [],
        stickers: new Collection(),
        mentions: { everyone: false, users: new Collection(), roles: new Collection() },
    } as unknown as Message;
}

/** Canal falso que responde como o Discord: da mais recente para trás, 100 de cada vez. */
function fakeGuild(messages: Message[]) {
    const sorted = [...messages].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
    let fetches = 0;
    const channel = {
        id: "c1",
        isTextBased: () => true,
        messages: {
            fetch: async ({ limit, before }: { limit: number; before?: string }) => {
                fetches++;
                const page = sorted.filter((message) => !before || BigInt(message.id) < BigInt(before)).slice(0, limit);
                return new Collection(page.map((message) => [message.id, message]));
            },
        },
    };
    return { guild: { channels: { cache: new Collection([["c1", channel]]) } } as unknown as Guild, fetches: () => fetches, sorted };
}

function request(scope: PurgeRequest["scope"], filter: Partial<PurgeFilter> = {}): PurgeRequest {
    return { channelIds: ["c1"], wide: false, scope, filter: { ...NO_FILTER, ...filter }, confirm: false, authorHint: null, fromUrl: null, toUrl: null };
}

describe("limpar — links e IDs", () => {
    it("lê links, IDs simples e o canal-mensagem do Shift + Copiar ID", () => {
        expect(parseMessageRef("https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333"))
            .toEqual({ guildId: "111111111111111111", channelId: "222222222222222222", messageId: "333333333333333333" });
        expect(parseMessageRef("https://ptb.discord.com/channels/@me/222222222222222222/333333333333333333")?.guildId).toBeNull();
        expect(parseMessageRef(" 333333333333333333 ")).toEqual({ guildId: null, channelId: null, messageId: "333333333333333333" });
        expect(parseMessageRef("222222222222222222-333333333333333333")).toEqual({ guildId: null, channelId: "222222222222222222", messageId: "333333333333333333" });
        expect(parseMessageRef("olá")).toBeNull();
        expect(parseMessageRef("12345")).toBeNull();
    });
});

describe("limpar — limites da procura", () => {
    it("o intervalo começa logo depois do fim e pára antes do início (as duas inclusive, por qualquer ordem)", () => {
        const bounds = scanBounds({ type: "intervalo", fromId: "500", toId: "100" }, 1000);
        expect(bounds.before).toBe("501");
        expect(bounds.low).toBe(100n);
        expect(pastBounds({ id: "100", createdTimestamp: 0 }, bounds)).toBe(false);
        expect(pastBounds({ id: "99", createdTimestamp: 0 }, bounds)).toBe(true);
    });

    it("o período pára na primeira mensagem mais antiga que o limite", () => {
        const bounds = scanBounds({ type: "periodo", since: 1_000 }, 1000);
        expect(pastBounds({ id: "1", createdTimestamp: 999 }, bounds)).toBe(true);
        expect(pastBounds({ id: "1", createdTimestamp: 1_000 }, bounds)).toBe(false);
    });

    it("as últimas N nunca passam do máximo", () => {
        expect(scanBounds({ type: "recentes", amount: 5000 }, 1000).limit).toBe(1000);
    });
});

describe("limpar — filtros", () => {
    it("membro, bots/pessoas e texto (sem ligar a maiúsculas)", () => {
        const human = fakeMessage(0, { author: "u1", content: "Ganha NITRO grátis" });
        const bot = fakeMessage(1, { author: "b1", bot: true });
        expect(matchesFilter(human, { ...NO_FILTER, userId: "u1" })).toBe(true);
        expect(matchesFilter(human, { ...NO_FILTER, userId: "u2" })).toBe(false);
        expect(matchesFilter(bot, { ...NO_FILTER, authors: "bots" })).toBe(true);
        expect(matchesFilter(human, { ...NO_FILTER, authors: "bots" })).toBe(false);
        expect(matchesFilter(bot, { ...NO_FILTER, authors: "humanos" })).toBe(false);
        expect(matchesFilter(human, { ...NO_FILTER, contains: "nitro GRÁTIS" })).toBe(true);
        expect(matchesFilter(human, { ...NO_FILTER, contains: "steam" })).toBe(false);
    });

    it("tipos: links, convites, imagens, ficheiros e só texto", () => {
        expect(matchesKind(fakeMessage(0, { content: "vê https://exemplo.pt" }), "links")).toBe(true);
        expect(matchesKind(fakeMessage(0, { content: "entra em discord.gg/abc123" }), "convites")).toBe(true);
        expect(matchesKind(fakeMessage(0, { content: "https://exemplo.pt" }), "convites")).toBe(false);
        const image = fakeMessage(0, { content: "", attachments: [{ contentType: "image/png" }] });
        expect(matchesKind(image, "media")).toBe(true);
        expect(matchesKind(image, "anexos")).toBe(true);
        expect(matchesKind(fakeMessage(0, { attachments: [{ contentType: "application/zip" }] }), "media")).toBe(false);
        expect(matchesKind(fakeMessage(0, { content: "só conversa" }), "texto")).toBe(true);
        expect(matchesKind(fakeMessage(0, { content: "https://exemplo.pt" }), "texto")).toBe(false);
    });

    it("separa as de menos de 14 dias das antigas e conta por autor", () => {
        const { bulk, old } = splitByAge([{ createdTimestamp: NOW }, { createdTimestamp: NOW - BULK_MAX_AGE_MS - 1 }], NOW);
        expect([bulk.length, old.length]).toEqual([1, 1]);
        expect(tally(["a", "b", "a", "c", "a", "b"])).toEqual([["a", 3], ["b", 2], ["c", 1]]);
    });

    it("as apagadas pela limpeza não geram entradas soltas no registo (uma vez cada)", () => {
        markPurgeDeletion(["m1"]);
        expect(wasDeletedByPurge("m1")).toBe(true);
        expect(wasDeletedByPurge("m1")).toBe(false);
        expect(wasDeletedByPurge("m2")).toBe(false);
    });
});

describe("limpar — procura num canal (250 mensagens)", () => {
    const messages = Array.from({ length: 250 }, (_, index) => fakeMessage(index, {
        author: index % 2 ? "u2" : "u1",
        pinned: index === 10,
        deletable: index !== 11,
    }));
    const byIndex = (index: number) => messages[index]!;

    it("as últimas 30: salta a fixada e a que não se pode apagar, e não lê mais do que precisa", async () => {
        const { guild, fetches } = fakeGuild(messages);
        const plan = await collectPlan(guild, request({ type: "recentes", amount: 30 }));
        expect(plan.messages).toHaveLength(30);
        expect(plan.pinnedKept).toBe(1);
        expect(plan.undeletable).toBe(1);
        expect(plan.messages.some((message) => message.id === byIndex(10).id)).toBe(false);
        expect(plan.truncated).toBe(false);
        expect(fetches()).toBe(1);
    });

    it("desde uma mensagem: ela e todas as seguintes, a atravessar páginas", async () => {
        const { guild } = fakeGuild(messages);
        const plan = await collectPlan(guild, request({ type: "desde", fromId: byIndex(150).id }));
        // 151 mensagens (índices 0–150) menos a fixada e a que não dá para apagar.
        expect(plan.messages).toHaveLength(149);
        expect(plan.messages.at(-1)!.id).toBe(byIndex(150).id);
    });

    it("intervalo: só entre as duas (inclusive), com a ordem trocada", async () => {
        const { guild } = fakeGuild(messages);
        const plan = await collectPlan(guild, request({ type: "intervalo", fromId: byIndex(120).id, toId: byIndex(200).id }));
        expect(plan.messages).toHaveLength(81);
        expect(plan.messages[0]!.id).toBe(byIndex(120).id);
        expect(plan.messages.at(-1)!.id).toBe(byIndex(200).id);
    });

    it("período com filtro de membro: só as dele, só no tempo pedido", async () => {
        const { guild } = fakeGuild(messages);
        const plan = await collectPlan(guild, request({ type: "periodo", since: NOW - 59.5 * 60_000 }, { userId: "u2" }));
        // Índices 0–59 cabem na hora; os ímpares são do u2 → 30, menos a 11 (não se pode apagar).
        expect(plan.messages).toHaveLength(29);
        expect(plan.messages.every((message) => message.author.id === "u2")).toBe(true);
    });

    it("com fixadas: true a fixada também vai", async () => {
        const { guild } = fakeGuild(messages);
        const plan = await collectPlan(guild, request({ type: "recentes", amount: 20 }, { includePinned: true }));
        expect(plan.messages.some((message) => message.id === byIndex(10).id)).toBe(true);
        expect(plan.pinnedKept).toBe(0);
    });
});

describe("limpar — cópia em HTML", () => {
    it("embute as imagens descarregadas, escapa o texto e mostra o canal quando há vários", async () => {
        const { renderMessagesHtml } = await import("../../src/modules/transcripts/transcriptManager.js");
        const message = {
            content: "<script>alert(1)</script> olá",
            author: { id: "u1", username: "ze", bot: false, displayAvatarURL: () => "https://cdn.discordapp.com/avatar.png" },
            member: null,
            createdAt: new Date(NOW),
            channel: { name: "geral" },
            attachments: new Collection([["a1", { id: "a1", name: "foto.png", url: "https://cdn.discordapp.com/foto.png", contentType: "image/png" }]]),
            stickers: new Collection(),
            embeds: [],
            components: [],
            mentions: { users: new Collection() },
            guild: null,
        } as unknown as Message;
        const html = renderMessagesHtml({
            title: "Limpeza",
            heading: "Mensagens apagadas",
            meta: [["Moderador", "<b>mod</b>"]],
            messages: [message],
            showChannel: true,
            images: new Map([["a1", "data:image/png;base64,AAAA"]]),
        });
        expect(html).toContain('src="data:image/png;base64,AAAA"');
        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toContain("<script>alert");
        expect(html).toContain("&lt;b&gt;mod&lt;/b&gt;");
        expect(html).toContain('<span class="chan">#geral</span>');
    });
});
