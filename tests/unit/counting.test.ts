import { describe, expect, it } from "vitest";
import { evaluate, judgeCount, parseCount, reactionFor } from "../../src/modules/counting/countingMath.js";
import { buildCountingDefaults, normalizeCounting } from "../../src/modules/counting/countingSettings.js";

const rules = { noDouble: true, resetOnFail: true, milestoneEvery: 100, rewardEvery: 50 };

describe("contagem — contas seguras", () => {
    it("faz contas com prioridades, parênteses e potências", () => {
        expect(evaluate("2+3*4")).toBe(14);
        expect(evaluate("(2+3)*4")).toBe(20);
        expect(evaluate("2^3^2")).toBe(512);
        expect(evaluate("10 x 4 ÷ 2")).toBe(20);
        expect(evaluate("-3+10")).toBe(7);
        expect(evaluate("1,5*2")).toBe(3);
    });

    it("recusa lixo, divisões por zero e números gigantes", () => {
        expect(evaluate("2+")).toBeNull();
        expect(evaluate("4/0")).toBeNull();
        expect(evaluate("9^99")).toBeNull();
        expect(evaluate("process.exit()")).toBeNull();
        expect(evaluate("(1+2")).toBeNull();
        expect(evaluate("1".repeat(70))).toBeNull();
    });
});

describe("contagem — ler a mensagem", () => {
    it("lê o número do início (com ou sem texto a seguir)", () => {
        expect(parseCount("42", false)).toBe(42);
        expect(parseCount("42 boa!", false)).toBe(42);
        expect(parseCount("42!", false)).toBe(42);
        expect(parseCount("olá 42", false)).toBeNull();
        expect(parseCount("6*7", false)).toBeNull(); // sem contas, "6*7" não é uma contagem
    });

    it("com contas: só aceita resultados inteiros", () => {
        expect(parseCount("6*7", true)).toBe(42);
        expect(parseCount("(40+2) siga", true)).toBe(42);
        expect(parseCount("85/2", true)).toBeNull();
        expect(parseCount("43 lol", true)).toBe(43);
        expect(parseCount("haha", true)).toBeNull();
    });
});

describe("contagem — decisões", () => {
    const state = { current: 49, lastUserId: "a", record: 120, runRecord: 120, saves: 0 };

    it("número certo de outra pessoa: conta, com prémio e marco nos múltiplos", () => {
        expect(judgeCount(state, 50, "b", rules)).toEqual({ kind: "ok", value: 50, record: false, beatRecord: false, milestone: false, reward: true });
        expect(judgeCount({ ...state, current: 99 }, 100, "b", rules)).toMatchObject({ kind: "ok", milestone: true, reward: true });
    });

    it("bater o recorde só faz festa no número que o bate", () => {
        expect(judgeCount({ ...state, current: 120 }, 121, "b", rules)).toMatchObject({ record: true, beatRecord: true });
        expect(judgeCount({ ...state, current: 121, record: 121 }, 122, "b", rules)).toMatchObject({ record: true, beatRecord: false });
        expect(judgeCount({ current: 0, lastUserId: null, record: 0, runRecord: 0, saves: 0 }, 1, "b", rules)).toMatchObject({ record: true, beatRecord: false });
    });

    it("duas seguidas ou número errado: vida se houver, senão vai ao ar", () => {
        expect(judgeCount(state, 50, "a", rules)).toEqual({ kind: "fail", expected: 50, got: 50, double: true, reached: 49 });
        expect(judgeCount({ ...state, saves: 2 }, 51, "b", rules)).toEqual({ kind: "saved", expected: 50, got: 51, double: false });
        expect(judgeCount(state, 50, "a", { ...rules, noDouble: false })).toMatchObject({ kind: "ok" });
    });

    it("sem recomeçar: o erro só não conta", () => {
        expect(judgeCount(state, 7, "b", { ...rules, resetOnFail: false })).toMatchObject({ kind: "wrong", expected: 50 });
    });

    it("reações especiais", () => {
        expect(reactionFor(100, true, false)).toBe("💯");
        expect(reactionFor(300, true, false)).toBe("🎉");
        expect(reactionFor(121, false, true)).toBe("⭐");
        expect(reactionFor(12, false, false)).toBe("✅");
    });

    it("definições fora dos limites são corrigidas", () => {
        expect(normalizeCounting({ ...buildCountingDefaults(), max_saves: 99, shame_hours: 0 })).toMatchObject({ max_saves: 10, shame_hours: 1 });
    });
});
