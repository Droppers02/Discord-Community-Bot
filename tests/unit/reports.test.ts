import { describe, expect, it, vi } from "vitest";

vi.mock("#database", () => ({
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    queryOne: vi.fn(async () => ({ n: "2" })),
    withTransaction: vi.fn(),
}));

const { buildReportCard, cooldownLeft, mainReason, resolutionLabel, RESOLUTIONS } = await import("../../src/modules/reports/reportService.js");
const { buildReportDefaults, normalizeReports } = await import("../../src/modules/reports/reportSettings.js");

const guild = { id: "g1" } as never;

function report(overrides: Record<string, unknown> = {}) {
    return {
        id: 12, guild_id: "g1", channel_id: "c1", message_id: "m1", author_id: "a1", author_tag: "autor",
        content: "compra seguidores em ```spam.xyz```", attachments: [{ name: "denuncia-12-1.png", source: "evidence" as const }],
        message_created_at: Date.now() - 60_000,
        reporters: [{ id: "r1", reason: "spam" as const, details: "isto é spam", at: 1 }, { id: "r2", reason: "burla" as const, details: null, at: 2 }, { id: "r3", reason: "spam" as const, details: null, at: 3 }],
        status: "open" as const, claimed_by: null, resolved_by: null, resolution: null, card_message_id: null, created_at: 1, updated_at: 1,
        ...overrides,
    };
}

describe("denúncias", () => {
    it("o motivo principal é o mais escolhido", () => {
        expect(mainReason(report().reporters)).toBe("spam");
        expect(mainReason([])).toBe("outro");
    });

    it("descreve o que cada resolução faz", () => {
        const byValue = Object.fromEntries(RESOLUTIONS.map((entry) => [entry.value, entry.plan]));
        expect(resolutionLabel(byValue.delete_t1h!)).toBe("mensagem apagada + castigo de 1h");
        expect(resolutionLabel(byValue.delete_ban!)).toBe("mensagem apagada + banimento");
        expect(resolutionLabel({ remove: false, warn: false, timeoutMs: null, kick: false, ban: false })).toBe("sem ação");
    });

    it("definições inválidas ficam com limites seguros", () => {
        const s = normalizeReports({ ...buildReportDefaults(), cooldown_minutes: -5, auto_hide: 999, channel: "x" });
        expect(s).toMatchObject({ cooldown_minutes: 0, auto_hide: 20, channel: null });
    });

    it("sem intervalo configurado, não há espera", () => {
        expect(cooldownLeft("g1", "r9", { ...buildReportDefaults(), cooldown_minutes: 0 })).toBe(0);
    });

    it("o cartão serializa aberto (com menu) e resolvido (sem menu), e não deixa fugir ``` do conteúdo", async () => {
        const settings = { ...buildReportDefaults(), enabled: true, channel: "staff" };
        const open = JSON.stringify((await buildReportCard(guild, report(), settings)).toJSON());
        expect(open).toContain("report/resolve/12");
        expect(open).toContain("attachment://denuncia-12-1.png");
        expect(open).toContain("ˋˋˋspam.xyzˋˋˋ");
        expect(open).toContain("<@r1>");
        const done = JSON.stringify((await buildReportCard(guild, report({ status: "resolved", resolved_by: "s1", resolution: "mensagem apagada" }), settings)).toJSON());
        expect(done).not.toContain("report/resolve/12");
        expect(done).toContain("mensagem apagada");
        const anonymous = JSON.stringify((await buildReportCard(guild, report(), { ...settings, anonymous: true })).toJSON());
        expect(anonymous).not.toContain("<@r1>");
        expect(anonymous).toContain("3 pessoas");
    });
});
