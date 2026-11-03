import { describe, expect, it } from "vitest";
import { dayDiff, lisbonDay, nextLisbonMidnight } from "../../src/modules/economy/economyService.js";
import { normalizeEconomy, buildEconomyDefaults } from "../../src/modules/economy/economySettings.js";
import { parseRange } from "../../src/modules/economy/economyConfigView.js";
import { formatMessage } from "../../src/lib/i18n.js";

describe("dias em Lisboa (diário)", () => {
    it("o dia muda à meia-noite de Lisboa, não à de UTC", () => {
        // Verão (UTC+1): 23:30 UTC já é dia seguinte em Lisboa.
        expect(lisbonDay(Date.parse("2026-07-10T23:30:00Z"))).toBe("2026-07-11");
        // Inverno (UTC+0).
        expect(lisbonDay(Date.parse("2026-12-10T23:30:00Z"))).toBe("2026-12-10");
    });

    it("conta dias de calendário", () => {
        expect(dayDiff(Date.parse("2026-11-03T08:00:00Z"), Date.parse("2026-11-03T22:00:00Z"))).toBe(0);
        expect(dayDiff(Date.parse("2026-11-03T23:50:00Z"), Date.parse("2026-11-04T00:10:00Z"))).toBe(1);
        expect(dayDiff(Date.parse("2026-11-01T12:00:00Z"), Date.parse("2026-11-04T12:00:00Z"))).toBe(3);
    });

    it("próxima meia-noite certa, incluindo a mudança de hora", () => {
        expect(nextLisbonMidnight(Date.parse("2026-11-03T15:00:00Z"))).toBe(Date.parse("2026-11-04T00:00:00Z"));
        expect(nextLisbonMidnight(Date.parse("2026-07-10T15:00:00Z"))).toBe(Date.parse("2026-07-10T23:00:00Z"));
    });
});

describe("definições da economia", () => {
    it("mínimo nunca acima do máximo e artigos inválidos saem", () => {
        const normalized = normalizeEconomy({
            ...buildEconomyDefaults(),
            daily_min: 2000,
            daily_max: 100,
            shop: [{ id: "a", name: "VIP", description: null, price: 100, role_id: "123456789012345678", duration_days: 0 }, { id: "b", name: "", description: null, price: 1, role_id: "x", duration_days: 0 }],
        });
        expect(normalized.daily_max).toBeGreaterThanOrEqual(normalized.daily_min);
        expect(normalized.shop).toHaveLength(1);
    });

    it("lê intervalos escritos à mão", () => {
        expect(parseRange("800-1200")).toEqual([800, 1200]);
        expect(parseRange(" 1.200 - 800 ")).toEqual([800, 1200]);
        expect(parseRange("abc")).toBeNull();
    });
});

describe("texto (t)", () => {
    it("variáveis e plurais em português", () => {
        expect(formatMessage("Olá, {name}!", { name: "Zé" })).toBe("Olá, Zé!");
        expect(formatMessage("{count, plural, one {# vitória} other {# vitórias}}", { count: 1 })).toBe("1 vitória");
        expect(formatMessage("{count, plural, one {# vitória} other {# vitórias}}", { count: 1500 })).toBe("1500 vitórias".replace("1500", new Intl.NumberFormat("pt-PT").format(1500)));
        expect(formatMessage("{count, plural, =0 {nada} other {# coisas}}", { count: 0 })).toBe("nada");
    });
});
