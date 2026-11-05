import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("#database", () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), queryOne: vi.fn(async () => null), withTransaction: vi.fn() }));

const { filterOffers, mapPlatforms, mergeOffers, parseEpic, parseGamerPower } = await import("../../src/modules/freegames/freeGamesSources.js");
const { epicWeekView, offerCard } = await import("../../src/modules/freegames/freeGamesService.js");

// Amostras reais das duas APIs (guardadas em tests/fixtures a 5 de novembro de 2026).
const epicJson = JSON.parse(readFileSync(new URL("../fixtures/epic.json", import.meta.url), "utf8"));
const gamerPowerJson = JSON.parse(readFileSync(new URL("../fixtures/gamerpower.json", import.meta.url), "utf8"));
const NOW = Date.parse("2026-11-05T01:00:00Z");

describe("jogos grátis — Epic", () => {
    const offers = parseEpic(epicJson, NOW);

    it("só conta como grátis o que tem 0% do preço (os descontos não entram)", () => {
        const titles = offers.map((offer) => offer.title);
        expect(titles).toContain("Sorry We're Closed");
        expect(titles).not.toContain("Ghostrunner 2"); // 20% de desconto, não é grátis
    });

    it("separa o grátis agora do da próxima semana, com link e imagem", () => {
        const now = offers.find((offer) => offer.title === "Sorry We're Closed")!;
        expect(now.upcoming).toBe(false);
        expect(now.url).toMatch(/^https:\/\/store\.epicgames\.com\/pt\/p\//);
        expect(now.endsAt).toBeGreaterThan(NOW);
        const next = offers.find((offer) => offer.title.startsWith("Idle Champions"))!;
        expect(next.upcoming).toBe(true);
        expect(offers.every((offer) => offer.platforms.includes("epic"))).toBe(true);
    });

    it("respostas estranhas não rebentam", () => {
        expect(parseEpic(null)).toEqual([]);
        expect(parseEpic({ data: {} })).toEqual([]);
        expect(parseGamerPower({ status: 0 })).toEqual([]);
    });
});

describe("jogos grátis — GamerPower", () => {
    const offers = parseGamerPower(gamerPowerJson);

    it("lê as ofertas com plataformas, tipo e prazo", () => {
        expect(offers.length).toBeGreaterThan(0);
        expect(offers.every((offer) => offer.id.startsWith("gp:") && offer.url.startsWith("http"))).toBe(true);
        expect(offers.some((offer) => offer.platforms.includes("steam"))).toBe(true);
        expect(offers.every((offer) => !/giveaway$/i.test(offer.title))).toBe(true);
    });

    it("traduz os nomes das plataformas", () => {
        expect(mapPlatforms("PC, Steam, Epic Games Store")).toEqual(["steam", "epic"]);
        expect(mapPlatforms("Playstation 5, Xbox Series X|S, Nintendo Switch")).toEqual(["playstation", "xbox", "switch"]);
        expect(mapPlatforms("Amazon Prime, GOG, Itch.io, DRM-Free")).toEqual(["prime", "gog", "itch", "drmfree"]);
    });
});

describe("jogos grátis — juntar e filtrar", () => {
    const epic = parseEpic(epicJson, NOW);
    const base = { source: "gamerpower" as const, type: "game" as const, worth: "$9.99", image: null, url: "https://x", startsAt: null, endsAt: null, description: null, upcoming: false };

    it("os da Epic vêm da Epic; a GamerPower não os repete", () => {
        const merged = mergeOffers(epic, [{ ...base, id: "gp:1", title: "Sorry We're Closed", platforms: ["epic"] }, { ...base, id: "gp:2", title: "Outro", platforms: ["steam"] }]);
        expect(merged.filter((offer) => offer.title === "Sorry We're Closed")).toHaveLength(1);
        expect(merged.some((offer) => offer.id === "gp:2")).toBe(true);
        // Sem dados da Epic, os da Epic na GamerPower ficam.
        expect(mergeOffers([], [{ ...base, id: "gp:1", title: "X", platforms: ["epic"] }])).toHaveLength(1);
    });

    it("filtra por plataforma, DLC, acesso antecipado, futuras e terminadas", () => {
        const offers = [
            { ...base, id: "a", title: "A", platforms: ["steam" as const] },
            { ...base, id: "b", title: "B", platforms: ["steam" as const], type: "dlc" as const },
            { ...base, id: "c", title: "C", platforms: ["xbox" as const] },
            { ...base, id: "d", title: "D", platforms: ["steam" as const], upcoming: true },
            { ...base, id: "e", title: "E", platforms: ["steam" as const], endsAt: NOW - 1 },
            { ...base, id: "f", title: "F", platforms: ["steam" as const], type: "beta" as const },
        ];
        expect(filterOffers(offers, { platforms: ["steam"], include_dlc: false, include_beta: false }, NOW).map((offer) => offer.id)).toEqual(["a"]);
        expect(filterOffers(offers, { platforms: ["steam", "xbox"], include_dlc: true, include_beta: true }, NOW).map((offer) => offer.id)).toEqual(["a", "b", "c", "f"]);
    });

    it("os cartões serializam (com aviso ao cargo, e terminado com o botão desligado)", () => {
        const offer = epic.find((entry) => !entry.upcoming)!;
        const posted = JSON.stringify(offerCard(offer, { mentionRole: "123456789012345678" }).toJSON());
        expect(posted).toContain("<@&123456789012345678>");
        expect(posted).toContain("Resgatar na Epic");
        const ended = JSON.stringify(offerCard(offer, { ended: true }).toJSON());
        expect(ended).toContain("\"disabled\":true");
        expect(JSON.stringify(epicWeekView(epic).toJSON())).toContain("Na próxima semana");
    });
});
