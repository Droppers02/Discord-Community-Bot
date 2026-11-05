import { describe, expect, it, vi } from "vitest";

vi.mock("#database", () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), queryOne: vi.fn(async () => null), withTransaction: vi.fn() }));

const { parseOptions, payoutMultiplier, settle, shareBar, totalsByOption } = await import("../../src/modules/predictions/predictionLogic.js");
const { predictionCard } = await import("../../src/modules/predictions/predictionService.js");

const bets = [
    { user_id: "a", option: 0, amount: 100 },
    { user_id: "b", option: 0, amount: 300 },
    { user_id: "c", option: 1, amount: 600 },
];

describe("previsões — bolo", () => {
    it("quem acerta divide tudo em proporção ao que apostou", () => {
        const result = settle(bets, 0, 0);
        expect(result.refunded).toBe(false);
        expect(result.payouts.get("a")).toBe(250);
        expect(result.payouts.get("b")).toBe(750);
        expect(result.payouts.has("c")).toBe(false);
        expect([...result.payouts.values()].reduce((sum, n) => sum + n, 0)).toBe(1000);
    });

    it("com taxa, a taxa sai do bolo antes de dividir", () => {
        const result = settle(bets, 1, 10);
        expect(result.cut).toBe(100);
        expect(result.payouts.get("c")).toBe(900);
    });

    it("os arredondamentos nunca perdem nem inventam moedas", () => {
        const odd = [{ user_id: "a", option: 0, amount: 1 }, { user_id: "b", option: 0, amount: 1 }, { user_id: "c", option: 0, amount: 1 }, { user_id: "d", option: 1, amount: 7 }];
        const result = settle(odd, 0, 0);
        expect([...result.payouts.values()].reduce((sum, n) => sum + n, 0)).toBe(10);
        expect([...result.payouts.values()].every((n) => n === 3 || n === 4)).toBe(true);
    });

    it("se ninguém acertou, toda a gente recebe de volta", () => {
        const result = settle(bets, 2, 10);
        expect(result.refunded).toBe(true);
        expect(result.payouts.get("c")).toBe(600);
        expect(result.cut).toBe(0);
    });

    it("multiplicadores e totais por opção", () => {
        expect(payoutMultiplier(bets, 0, 0)).toBe(2.5);
        expect(payoutMultiplier(bets, 2, 0)).toBeNull();
        expect(totalsByOption(bets, 3)).toEqual([{ option: 0, total: 400, bettors: 2 }, { option: 1, total: 600, bettors: 1 }, { option: 2, total: 0, bettors: 0 }]);
        expect(shareBar(400, 1000)).toBe("▰▰▰▰▱▱▱▱▱▱");
    });
});

describe("previsões — opções", () => {
    it("separadas por |, linhas, ; ou vírgulas; sem repetidas; 2 a 8", () => {
        expect(parseOptions("Porto | Benfica | Empate")).toEqual(["Porto", "Benfica", "Empate"]);
        expect(parseOptions("Sim, Não")).toEqual(["Sim", "Não"]);
        expect(parseOptions("A | A")).toBeNull();
        expect(parseOptions("só uma")).toBeNull();
        expect(parseOptions(Array.from({ length: 9 }, (_, i) => `o${i}`).join("|"))).toBeNull();
    });
});

describe("previsões — cartão", () => {
    const base = { id: "p1", guild_id: "g", channel_id: "c", message_id: "m", creator_id: "u", question: "Quem ganha?", options: ["Porto", "Benfica"], winner: null, house_cut_pct: 0, locks_at: Date.now() + 60_000, created_at: 0, resolved_at: null };

    it("aberta: mostra percentagens e o menu para apostar", () => {
        const json = JSON.stringify(predictionCard({ ...base, status: "open" }, bets.filter((bet) => bet.option < 2)).toJSON());
        expect(json).toContain("pred/bet/p1");
        expect(json).toContain("40%");
        expect(json).toContain("paga x2.50");
    });

    it("fechada não aceita apostas; resolvida marca o vencedor e quem ganhou", () => {
        expect(JSON.stringify(predictionCard({ ...base, status: "locked" }, bets).toJSON())).not.toContain("pred/bet/p1");
        const resolved = JSON.stringify(predictionCard({ ...base, status: "resolved", winner: 1 }, bets.map((bet) => ({ ...bet, payout: bet.option === 1 ? 1000 : 0 }))).toJSON());
        expect(resolved).toContain("Benfica ✅");
        expect(resolved).toContain("<@c> +400");
        expect(resolved).not.toContain("pred/resolve/p1");
    });
});
