import { describe, expect, it } from "vitest";
import { handValue } from "../../src/modules/games/blackjack.js";
import { HANGMAN_WORDS, TERMO_WORDS } from "../../src/modules/games/data/words.js";
import { QUIZ_CATEGORIES, QUIZ_QUESTIONS } from "../../src/modules/games/data/quiz.js";
import { minesMultiplier, MINE_TILES } from "../../src/modules/games/mines.js";
import { rouletteWins } from "../../src/modules/games/quickBets.js";
import { applyShipVote, shipName, shipScore } from "../../src/modules/games/ship.js";
import { plainName } from "../../src/modules/games/shipImage.js";
import { dailyWord, evaluateGuess } from "../../src/modules/games/termo.js";
import { baseWord } from "../../src/modules/games/textUtil.js";

describe("termo", () => {
    it("marca verdes, amarelos e cinzentos", () => {
        expect(evaluateGuess("PRAIA", "PRAIA")).toEqual(["g", "g", "g", "g", "g"]);
        // CARRO × PEDRA: o 2.º R está no sítio (verde), o 1.º já não tem par (cinzento), o A existe noutro sítio.
        expect(evaluateGuess("CARRO", "PEDRA")).toEqual(["b", "y", "b", "g", "b"]);
    });

    it("letras repetidas só contam tantas vezes quantas existem", () => {
        // ARROZ tem um A: no palpite AAAAA só o primeiro (na posição certa) fica verde.
        expect(evaluateGuess("AAAAA", "ARROZ")).toEqual(["g", "b", "b", "b", "b"]);
        // Dois R no palpite, dois na resposta (posições 2 e 3) → ambos verdes.
        expect(evaluateGuess("CARRO", "BARRO")).toEqual(["b", "g", "g", "g", "g"]);
        // Um E no palpite fora do sítio, a resposta tem um E → amarelo uma vez só.
        expect(evaluateGuess("TERRA", "PEDRA")).toEqual(["b", "g", "b", "g", "g"]);
    });

    it("acentos não contam (LIMÃO = LIMAO)", () => {
        expect(evaluateGuess("LIMAO", "LIMÃO")).toEqual(["g", "g", "g", "g", "g"]);
    });

    it("a palavra do dia é igual para todos no mesmo dia", () => {
        expect(dailyWord("2026-11-03")).toBe(dailyWord("2026-11-03"));
        expect(TERMO_WORDS).toContain(dailyWord("2026-12-25"));
    });

    it("todas as palavras têm 5 letras e não se repetem", () => {
        for (const word of TERMO_WORDS) expect(baseWord(word)).toMatch(/^[A-Z]{5}$/);
        expect(new Set(TERMO_WORDS.map(baseWord)).size).toBe(TERMO_WORDS.length);
    });
});

describe("forca", () => {
    it("palavras só com letras, espaços e hífenes, e com dica", () => {
        for (const entry of HANGMAN_WORDS) {
            expect(baseWord(entry.word)).toMatch(/^[A-Z][A-Z -]*[A-Z]$/);
            expect(entry.hint.length).toBeGreaterThan(3);
        }
    });
});

describe("quiz", () => {
    it("cada pergunta tem 4 respostas diferentes e uma categoria válida", () => {
        for (const question of QUIZ_QUESTIONS) {
            expect(new Set(question.answers).size).toBe(4);
            expect(QUIZ_CATEGORIES).toContain(question.category);
        }
    });

    it("todas as categorias têm perguntas suficientes para um quiz de 10", () => {
        for (const category of QUIZ_CATEGORIES) {
            expect(QUIZ_QUESTIONS.filter((question) => question.category === category).length).toBeGreaterThanOrEqual(10);
        }
    });
});

describe("blackjack", () => {
    const card = (rank: string) => ({ rank, suit: "♠" }) as Parameters<typeof handValue>[0][number];
    it("ases valem 11 ou 1", () => {
        expect(handValue([card("A"), card("K")]).total).toBe(21);
        expect(handValue([card("A"), card("A"), card("9")]).total).toBe(21);
        expect(handValue([card("A"), card("9"), card("5")]).total).toBe(15);
        expect(handValue([card("K"), card("Q"), card("5")]).total).toBe(25);
    });
});

describe("minas", () => {
    it("multiplicador cresce a cada casa e respeita a margem da casa", () => {
        expect(minesMultiplier(3, 0)).toBeCloseTo(0.97, 2);
        expect(minesMultiplier(3, 1)).toBeGreaterThan(1);
        expect(minesMultiplier(3, 2)).toBeGreaterThan(minesMultiplier(3, 1));
        // 1 bomba, 1 casa: 20/19 × 0,97 ≈ 1,02
        expect(minesMultiplier(1, 1)).toBeCloseTo((MINE_TILES / (MINE_TILES - 1)) * 0.97, 1);
    });
});

describe("roleta", () => {
    it("o zero só paga a quem apostou nele", () => {
        expect(rouletteWins("vermelho", null, 0)).toBe(false);
        expect(rouletteWins("par", null, 0)).toBe(false);
        expect(rouletteWins("numero", 0, 0)).toBe(true);
    });
    it("cores, paridade e metades", () => {
        expect(rouletteWins("vermelho", null, 1)).toBe(true);
        expect(rouletteWins("preto", null, 2)).toBe(true);
        expect(rouletteWins("impar", null, 7)).toBe(true);
        expect(rouletteWins("alto", null, 19)).toBe(true);
        expect(rouletteWins("baixo", null, 19)).toBe(false);
    });
});

describe("ship", () => {
    it("é igual nos dois sentidos e fica entre 0 e 100", () => {
        const score = shipScore("123", "456");
        expect(shipScore("456", "123")).toBe(score);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
    });

    it("muda de dia para dia, mas é fixo durante o dia", () => {
        expect(shipScore("123", "456", "2026-11-04")).toBe(shipScore("456", "123", "2026-11-04"));
        const days = new Set(Array.from({ length: 10 }, (_, i) => shipScore("123", "456", `2026-11-${String(i + 1).padStart(2, "0")}`)));
        expect(days.size).toBeGreaterThan(1);
    });

    it("junta os nomes do casal", () => {
        expect(shipName("Lord dos Chatos", "Lorda das Pipas")).toBe("Chapas");
        expect(shipName("Ana", "Rui")).toBe("Anui");
        expect(shipName("𝓛𝓮𝓫𝓮𝓮 ✨", "Droppers")).toBe("Lebpers");
        expect(plainName("🔥 ✨")).toBe("?");
    });

    it("votos: carregar outra vez retira, no outro botão troca", () => {
        const up = new Set<string>();
        const down = new Set<string>();
        expect(applyShipVote(up, down, "a", "up")).toBe("added");
        expect(applyShipVote(up, down, "a", "down")).toBe("switched");
        expect([up.size, down.size]).toEqual([0, 1]);
        expect(applyShipVote(up, down, "a", "down")).toBe("removed");
        expect([up.size, down.size]).toEqual([0, 0]);
    });
});
