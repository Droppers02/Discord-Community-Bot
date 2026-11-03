import { describe, expect, it, vi } from "vitest";

// A DB nunca é tocada: o repositório de settings devolve "sem linha" → defaults.
vi.mock("#database", () => ({
    query: vi.fn(async () => ({ rows: [] })),
    queryOne: vi.fn(async () => null),
}));

const { buildAntiSpamDefaults } = await import("../../src/modules/antispam/antispamSettings.js");

describe("anti-spam defaults", () => {
    it("mantém o timeout como punição por omissão (comportamento anterior)", () => {
        const defaults = buildAntiSpamDefaults();
        expect(defaults.action).toBe("timeout");
    });

    it("limpa as mensagens recentes do infrator por omissão", () => {
        const defaults = buildAntiSpamDefaults();
        // O pedido era garantir que as imagens/links do spammer saem do servidor — não só
        // a mensagem detetada.
        expect(defaults.purge_recent).toBe(true);
        expect(defaults.purge_minutes).toBeGreaterThan(0);
    });

    it("não traz cargo de castigo pré-definido (tem de ser escolhido pelo admin)", () => {
        expect(buildAntiSpamDefaults().quarantine_role).toBeNull();
    });
});
