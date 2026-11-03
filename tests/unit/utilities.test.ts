import { describe, expect, it } from "vitest";
import { lisbonToEpoch, parseDelay, parseWhen } from "../../src/lib/when.js";
import { findAdultLink, findBannedWord, normalizeText } from "../../src/modules/protection/protectionService.js";
import { normalizeProtection, buildProtectionDefaults } from "../../src/modules/protection/protectionSettings.js";
import { ACHIEVEMENTS, unlocked, type MemberStats } from "../../src/modules/community/achievements.js";
import { normalizeAppeal, buildAppealDefaults } from "../../src/modules/appeals/appealSettings.js";
import { fillTemplate } from "../../src/modules/community/welcomeMessages.js";

describe("datas escritas à mão (Lisboa)", () => {
    // 3 nov 2026, 15:00 em Lisboa (inverno, UTC+0).
    const now = Date.parse("2026-11-03T15:00:00Z");

    it("esperas", () => {
        expect(parseDelay("30")).toBe(30 * 60_000);
        expect(parseDelay("45m")).toBe(45 * 60_000);
        expect(parseDelay("2h")).toBe(2 * 3_600_000);
        expect(parseDelay("1d12h")).toBe(36 * 3_600_000);
        expect(parseDelay("amanhã")).toBeNull();
    });

    it("hora sem data: hoje, ou amanhã se já passou", () => {
        expect(parseWhen("21:30", now)).toBe(Date.parse("2026-11-03T21:30:00Z"));
        expect(parseWhen("9:00", now)).toBe(Date.parse("2026-11-04T09:00:00Z"));
        expect(parseWhen("21h", now)).toBe(Date.parse("2026-11-03T21:00:00Z"));
    });

    it("com data e com 'amanhã'", () => {
        expect(parseWhen("amanhã 9:00", now)).toBe(Date.parse("2026-11-04T09:00:00Z"));
        expect(parseWhen("25/12 18:00", now)).toBe(Date.parse("2026-12-25T18:00:00Z"));
        expect(parseWhen("25/12/2027 18:00", now)).toBe(Date.parse("2027-12-25T18:00:00Z"));
        expect(parseWhen("2027-01-05 08:15", now)).toBe(Date.parse("2027-01-05T08:15:00Z"));
    });

    it("no verão Lisboa está uma hora à frente de UTC", () => {
        expect(lisbonToEpoch({ year: 2026, month: 7, day: 10, hour: 21, minute: 0 })).toBe(Date.parse("2026-07-10T20:00:00Z"));
    });

    it("rejeita horas impossíveis", () => {
        expect(parseWhen("25:00", now)).toBeNull();
        expect(parseWhen("olá", now)).toBeNull();
    });
});

describe("filtro de palavras", () => {
    it("apanha acentos, maiúsculas e l33t", () => {
        expect(normalizeText("CÃO 4m4r3l0")).toBe("cao amarelo");
        expect(findBannedWord("Que CÃO tão feio", ["cao"])).toBe("cao");
        expect(findBannedWord("p4l4vr40", ["palavrao"])).toBe("palavrao");
    });

    it("palavra inteira, ou prefixo com *", () => {
        expect(findBannedWord("cartão", ["cart"])).toBeNull();
        expect(findBannedWord("cartão", ["cart*"])).toBe("cart*");
        expect(findBannedWord("nada a ver", ["cao"])).toBeNull();
    });

    it("links de conteúdo adulto", () => {
        expect(findAdultLink("olha https://www.pornhub.com/x")).toBe("pornhub.com");
        expect(findAdultLink("https://site.xxx/a")).toBe("site.xxx");
        expect(findAdultLink("https://youtube.com/watch?v=1")).toBeNull();
    });

    it("normaliza a lista de palavras", () => {
        const settings = normalizeProtection({ ...buildProtectionDefaults(), words: ["  Olá ", "olá", "a", "x*"] });
        expect(settings.words).toEqual(["olá"]);
    });
});

describe("conquistas", () => {
    const base: MemberStats = { level: 0, messages: 0, voiceHours: 0, coins: 0, earned: 0, dailyBest: 0, rep: 0, gamesPlayed: 0, gamesWon: 0, bestWinStreak: 0, married: false, friends: 0 };
    it("ninguém começa com conquistas", () => {
        expect(unlocked(base)).toHaveLength(0);
    });
    it("desbloqueiam pelos números", () => {
        const ids = unlocked({ ...base, level: 25, married: true, dailyBest: 8 }).map((achievement) => achievement.id);
        expect(ids).toEqual(expect.arrayContaining(["lvl5", "lvl20", "married", "daily7"]));
        expect(ids).not.toContain("lvl50");
    });
    it("ids únicos", () => {
        expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size).toBe(ACHIEVEMENTS.length);
    });
});

describe("revisão de bans", () => {
    it("perguntas vazias voltam às por omissão e os limites ficam dentro do intervalo", () => {
        const settings = normalizeAppeal({ ...buildAppealDefaults(), questions: ["", "Porquê?", "  "] as [string, string, string], cooldown_days: 9999, max_appeals: -3 });
        expect(settings.questions[0]).toBe(buildAppealDefaults().questions[0]);
        expect(settings.questions[1]).toBe("Porquê?");
        expect(settings.cooldown_days).toBe(365);
        expect(settings.max_appeals).toBe(0);
    });
});

describe("boas-vindas", () => {
    it("preenche as variáveis", () => {
        const member = { id: "1", displayName: "Zé", user: { username: "ze" }, guild: { name: "EPA", memberCount: 1234 } } as unknown as Parameters<typeof fillTemplate>[1];
        expect(fillTemplate("Olá {user} ({name}), és o nº {count} do {server}", member)).toBe(`Olá <@1> (Zé), és o nº ${new Intl.NumberFormat("pt-PT").format(1234)} do EPA`);
    });
});
