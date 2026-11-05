import { describe, expect, it, vi } from "vitest";

vi.mock("#database", () => ({
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    queryOne: vi.fn(async () => null),
    withTransaction: vi.fn(),
}));

const { buildConfessionModal, publicView, reviewView, submitConfession } = await import("../../src/modules/confessions/confessionService.js");
const { buildConfessionDefaults, normalizeConfessions } = await import("../../src/modules/confessions/confessionSettings.js");

const entry = (overrides: Record<string, unknown> = {}) => ({
    guild_id: "g1", number: 7, kind: "confession" as const, parent_number: null, author_id: "secret-author", content: "Eu nunca vi o Shrek.",
    image_url: "confissao-7.png", status: "pending" as const, review_message_id: null, posted_channel_id: null, posted_message_id: null,
    thread_id: null, reviewed_by: null, reject_reason: null, created_at: Date.now(), reviewed_at: null, ...overrides,
});
const json = (container: { toJSON(): unknown }) => JSON.stringify(container.toJSON());

describe("confissões — vistas", () => {
    const settings = { ...buildConfessionDefaults(), enabled: true, channel: "c1" };

    it("a publicação nunca mostra o autor e tem responder/confessar/reportar", () => {
        const view = json(publicView(entry({ status: "approved" }), settings));
        expect(view).not.toContain("secret-author");
        expect(view).toContain("Confissão #7");
        expect(view).toContain("attachment://confissao-7.png");
        expect(view).toContain("confess/reply/7");
        expect(view).toContain("confess/report/7");
        expect(json(publicView(entry(), { ...settings, allow_replies: false }))).not.toContain("confess/reply/7");
    });

    it("as respostas dizem a que confissão respondem e não abrem novas respostas", () => {
        const view = json(publicView(entry({ kind: "reply", parent_number: 3, number: 9, image_url: null }), settings));
        expect(view).toContain("Resposta anónima #9");
        expect(view).toContain("confissão #3");
        expect(view).not.toContain("confess/reply/");
    });

    it("a revisão tem aprovar/rejeitar/bloquear enquanto está à espera, e o autor nunca aparece", () => {
        const pending = json(reviewView(entry(), "g1"));
        expect(pending).toContain("confess/approve/7");
        expect(pending).toContain("confess/block/7");
        expect(pending).toContain("confess/reveal/7");
        expect(pending).not.toContain("secret-author");
        const approved = json(reviewView(entry({ status: "approved", reviewed_by: "s1", posted_channel_id: "c1", posted_message_id: "m1" }), "g1"));
        expect(approved).not.toContain("confess/approve/7");
        expect(approved).toContain("https://discord.com/channels/g1/c1/m1");
        expect(approved).toContain("confess/remove/7");
        const rejected = json(reviewView(entry({ status: "rejected", reject_reason: "spam" }), "g1"));
        expect(rejected).toContain("spam");
        expect(rejected).not.toContain("confess/remove/7");
    });

    it("o formulário leva o envio de imagem só quando as imagens estão ligadas", () => {
        expect(JSON.stringify(buildConfessionModal(0, true).toJSON())).toContain("\"type\":19");
        expect(JSON.stringify(buildConfessionModal(4, false).toJSON())).not.toContain("\"type\":19");
        expect(JSON.stringify(buildConfessionModal(4, false).toJSON())).toContain("confess/submit/4");
    });
});

describe("confissões — regras", () => {
    it("definições inválidas e bloqueios repetidos são limpos", () => {
        const s = normalizeConfessions({ ...buildConfessionDefaults(), cooldown_minutes: -1, blocked: ["123456789012345678", "123456789012345678", "x"] });
        expect(s.cooldown_minutes).toBe(0);
        expect(s.blocked).toEqual(["123456789012345678"]);
    });

    it("com as confissões desligadas, ninguém envia", async () => {
        const member = { id: "u1", guild: { id: "g1" } } as never;
        const result = await submitConfession(member, "uma confissão qualquer", [], 0);
        expect(result).toMatchObject({ ok: false });
    });
});
