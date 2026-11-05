import { Collection, SnowflakeUtil, type ButtonInteraction, type Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// O registo do caso vai à base de dados: aqui só se guarda o que foi pedido.
const recorded: Array<{ summary: string; file: string | null }> = [];
vi.mock("../../src/modules/moderation/moderationService.js", () => ({
    recordPurge: async (_guild: unknown, _moderator: unknown, _target: unknown, summary: string, backup: { name: string } | null) => {
        recorded.push({ summary, file: backup?.name ?? null });
        return { caseNumber: 7, logged: false };
    },
}));

const { handlePurgeButton, startPurge } = await import("../../src/modules/moderation/purgeService.js");
const { NO_FILTER, wasDeletedByPurge } = await import("../../src/modules/moderation/purgeFilters.js");

const NOW = Date.now();
const DAY = 86_400_000;

function setup(ages: number[]) {
    const bulkCalls: string[][] = [];
    const singleDeletes: string[] = [];
    const channel: Record<string, unknown> = { id: "c1", name: "geral", isTextBased: () => true, permissionsFor: () => ({ has: () => true }) };
    const guild = {
        id: "g1",
        name: "EPA",
        members: { me: { id: "bot" } },
        channels: { cache: new Collection([["c1", channel]]) },
        client: { users: { cache: new Collection(), fetch: async () => null } },
    };
    channel.guild = guild;
    const messages = ages.map((age, index) => ({
        id: SnowflakeUtil.generate({ timestamp: NOW - age }).toString(),
        createdTimestamp: NOW - age,
        createdAt: new Date(NOW - age),
        channelId: "c1",
        channel,
        guild,
        pinned: false,
        deletable: true,
        system: false,
        webhookId: null,
        content: `mensagem ${index}`,
        author: { id: index % 3 ? "u2" : "u1", username: `user${index % 3}`, bot: false, displayName: "x", displayAvatarURL: () => "https://cdn.discordapp.com/a.png" },
        member: null,
        attachments: new Collection(),
        embeds: [],
        stickers: new Collection(),
        components: [],
        mentions: { everyone: false, users: new Collection(), roles: new Collection() },
        url: `https://discord.com/channels/g1/c1/${index}`,
    })).sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1)) as unknown as Message[];

    Object.assign(channel, {
        messages: {
            fetch: async ({ limit, before }: { limit: number; before?: string }) =>
                new Collection(messages.filter((m) => !before || BigInt(m.id) < BigInt(before)).slice(0, limit).map((m) => [m.id, m])),
            delete: async (id: string) => void singleDeletes.push(id),
        },
        bulkDelete: async (ids: string[]) => void bulkCalls.push(ids),
    });

    const replies: Array<Record<string, unknown>> = [];
    const member = { id: "mod", user: { id: "mod", username: "moderador", tag: "moderador" }, guild };
    const interaction = {
        guild,
        member,
        user: member.user,
        editReply: async (payload: Record<string, unknown>) => void replies.push(payload),
        update: async (payload: Record<string, unknown>) => void replies.push(payload),
        deferUpdate: async () => undefined,
    };
    return { interaction, replies, bulkCalls, singleDeletes, messages };
}

/** Texto e customIds de uma resposta, já validados pelos builders do discord.js (toJSON). */
function render(payload: Record<string, unknown>): string {
    const components = payload.components as Array<{ toJSON(): unknown }>;
    return JSON.stringify(components.map((component) => component.toJSON()));
}

function buttonId(payload: Record<string, unknown>, action: string): string {
    const match = render(payload).match(new RegExp(`purge/${action}/([\\w-]+)`));
    if (!match) throw new Error(`sem botão ${action}`);
    return match[1]!;
}

const request = (amount: number) => ({
    channelIds: ["c1"], wide: false, scope: { type: "recentes" as const, amount }, filter: NO_FILTER,
    confirm: false, authorHint: { id: "u1", name: "Zé" }, fromUrl: null, toUrl: null,
});

beforeEach(() => { recorded.length = 0; });

describe("limpar — fluxo completo", () => {
    it("poucas mensagens: apaga logo, regista o caso e entrega a cópia", async () => {
        const { interaction, replies, bulkCalls } = setup(Array.from({ length: 5 }, (_, i) => i * 60_000));
        await startPurge(interaction as never, request(5));
        expect(bulkCalls).toHaveLength(1);
        expect(bulkCalls[0]).toHaveLength(5);
        expect(recorded).toHaveLength(1);
        expect(recorded[0]!.file).toMatch(/^limpeza-geral-\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.html$/);
        const last = replies.at(-1)!;
        expect(render(last)).toContain("5 mensagens apagadas");
        expect((last.files as unknown[]).length).toBe(1); // sem canal de registo: a cópia vem na resposta
    });

    it("muitas mensagens: pré-visualiza, e só apaga depois de confirmar", async () => {
        const { interaction, replies, bulkCalls } = setup(Array.from({ length: 150 }, (_, i) => i * 60_000));
        await startPurge(interaction as never, request(150));
        expect(bulkCalls).toHaveLength(0);
        const preview = render(replies.at(-1)!);
        expect(preview).toContain("150 mensagens");
        expect(preview).toContain("Quem escreveu");
        expect(preview).toContain("Só as de Zé");

        await handlePurgeButton(interaction as unknown as ButtonInteraction<"cached">, buttonId(replies.at(-1)!, "ok"), "ok");
        expect(bulkCalls.map((ids) => ids.length)).toEqual([100, 50]);
        expect(render(replies.at(-1)!)).toContain("150 mensagens apagadas");
    });

    it("\"Só as de X\" volta a procurar só as desse autor", async () => {
        const { interaction, replies } = setup(Array.from({ length: 60 }, (_, i) => i * 60_000));
        await startPurge(interaction as never, request(60));
        await handlePurgeButton(interaction as unknown as ButtonInteraction<"cached">, buttonId(replies.at(-1)!, "only"), "only");
        const preview = render(replies.at(-1)!);
        expect(preview).toContain("20 mensagens"); // u1 escreveu 1 em cada 3 das 60
        expect(preview).toContain("só de <@u1>");
        expect(preview).not.toContain("Só as de");
    });

    it("antigas (mais de 14 dias): só com o botão próprio, uma a uma e sem entradas soltas no registo", async () => {
        const { interaction, replies, bulkCalls, singleDeletes, messages } = setup([0, 60_000, 20 * DAY, 21 * DAY]);
        await startPurge(interaction as never, request(4));
        const preview = render(replies.at(-1)!);
        expect(preview).toContain("2 têm mais de 14 dias");
        await handlePurgeButton(interaction as unknown as ButtonInteraction<"cached">, buttonId(replies.at(-1)!, "old"), "old");
        expect(bulkCalls).toEqual([[messages[0]!.id, messages[1]!.id]]);
        expect(singleDeletes).toEqual([messages[2]!.id, messages[3]!.id]);
        expect(wasDeletedByPurge(messages[2]!.id)).toBe(true);
        expect(render(replies.at(-1)!)).toContain("2 antigas apagadas uma a uma");
    });

    it("cancelar não apaga nada; um pedido gasto ou expirado avisa", async () => {
        const { interaction, replies, bulkCalls } = setup(Array.from({ length: 30 }, (_, i) => i * 60_000));
        await startPurge(interaction as never, request(30));
        const id = buttonId(replies.at(-1)!, "cancel");
        await handlePurgeButton(interaction as unknown as ButtonInteraction<"cached">, id, "cancel");
        expect(render(replies.at(-1)!)).toContain("não apaguei nada");
        await handlePurgeButton(interaction as unknown as ButtonInteraction<"cached">, id, "ok");
        expect(render(replies.at(-1)!)).toContain("expirou");
        expect(bulkCalls).toHaveLength(0);
    });
});
