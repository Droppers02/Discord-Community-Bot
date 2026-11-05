import { afterEach, describe, expect, it, vi } from "vitest";

// Base de dados simulada: devolve números plausíveis consoante a consulta.
vi.mock("#database", () => ({
    withTransaction: vi.fn(),
    query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT day FROM member_activity")) return { rows: [{ day: "2026-11-01" }, { day: "2026-11-02" }, { day: "2026-11-03" }, { day: "2026-11-05" }] };
        if (sql.includes("GROUP BY user_id HAVING SUM(messages)")) return { rows: [{ user_id: "other", m: 900 }, { user_id: "u1", m: 420 }, { user_id: "x", m: 10 }] };
        if (sql.includes("FROM wrapped_counts")) return { rows: [
            { kind: "hour", key: "23", c: 120 }, { kind: "hour", key: "14", c: 30 },
            { kind: "weekday", key: "5", c: 80 },
            { kind: "channel", key: "c1", c: 300 }, { kind: "channel", key: "c2", c: 50 },
            { kind: "emoji", key: "<:pepe:123456789012345678>", c: 40 }, { kind: "emoji", key: "😂", c: 12 },
            { kind: "talk", key: "friend", c: 33 },
        ] };
        return { rows: [] };
    }),
    queryOne: vi.fn(async (sql: string) => {
        if (sql.includes("COALESCE(SUM(messages), 0) AS messages, COALESCE(SUM(xp)")) return { messages: "420", xp: "6100", voice: "45000" };
        if (sql.includes("ORDER BY messages DESC LIMIT 1")) return { day: "2026-11-02", messages: 120 };
        if (sql.includes("FROM voice_pairs")) return { other: "buddy", s: "18000" };
        if (sql.includes("FROM economy_ledger")) return { earned: "2500", spent: "800" };
        return null;
    }),
}));

const { emojisIn } = await import("../../src/modules/wrapped/wrappedTracker.js");
const { longestStreak, monthOf, periodRange, personaFor, topEntry } = await import("../../src/modules/wrapped/wrappedStats.js");
const { buildMemberWrapped, memberWrapped } = await import("../../src/modules/wrapped/wrappedService.js");

const NOV_5 = Date.UTC(2026, 10, 5, 12);

describe("wrapped — períodos e contas", () => {
    it("este mês, mês passado (com a viragem do ano) e ano", () => {
        expect(periodRange("mes", NOV_5)).toMatchObject({ fromDay: "2026-11-01", toDay: "2026-11-05", months: ["2026-11"], label: "novembro 2026" });
        expect(periodRange("mes-passado", NOV_5)).toMatchObject({ fromDay: "2026-10-01", toDay: "2026-10-31", months: ["2026-10"] });
        expect(periodRange("mes-passado", Date.UTC(2027, 0, 10))).toMatchObject({ fromDay: "2026-12-01", toDay: "2026-12-31", label: "dezembro 2026" });
        expect(periodRange("ano", NOV_5).months).toHaveLength(11);
        expect(periodRange("ano-passado", NOV_5)).toMatchObject({ fromDay: "2025-01-01", toDay: "2025-12-31", label: "2025" });
        expect(monthOf(Date.UTC(2026, 11, 31, 23, 30))).toBe("2026-12"); // 23:30 em Lisboa (inverno)
    });

    it("maior sequência de dias seguidos", () => {
        expect(longestStreak(["2026-11-03", "2026-11-01", "2026-11-02", "2026-11-05", "2026-11-06"])).toBe(3);
        expect(longestStreak(["2026-12-31", "2027-01-01"])).toBe(2);
        expect(longestStreak([])).toBe(0);
    });

    it("o que mais aparece", () => {
        expect(topEntry([{ key: "a", count: 1 }, { key: "b", count: 5 }])).toEqual({ key: "b", count: 5 });
        expect(topEntry([])).toBeNull();
    });

    it("personas", () => {
        const base = { messages: 200, voiceHours: 1, activeDays: 5, periodDays: 30, favoriteHour: 15, channelsUsed: 3, emojis: 10, percentile: 40 };
        expect(personaFor({ ...base, messages: 3, voiceHours: 0 }).title).toBe("O Fantasma");
        expect(personaFor({ ...base, voiceHours: 50 }).title).toBe("Monarca da Voz");
        expect(personaFor({ ...base, messages: 900, percentile: 3 }).title).toBe("Teclado em Chamas");
        expect(personaFor({ ...base, favoriteHour: 2 }).title).toBe("Coruja da Noite");
        expect(personaFor({ ...base, favoriteHour: 7 }).title).toBe("Madrugador");
        expect(personaFor({ ...base, activeDays: 28 }).title).toBe("Sempre Presente");
        expect(personaFor(base).title).toBe("Membro de Ouro");
    });

    it("encontra emojis do servidor e normais", () => {
        expect(emojisIn("ola <:pepe:123456789012345678> 😂😂 <a:dance:223456789012345678> 👍🏽")).toEqual(["<:pepe:123456789012345678>", "<:dance:223456789012345678>", "😂", "😂", "👍"]);
        expect(emojisIn("sem nada")).toEqual([]);
    });
});

describe("wrapped — retrospetiva de um membro", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("junta tudo: totais, sequência, lugar, favoritos, parceiros e moedas", async () => {
        const data = await memberWrapped("g", "u1", "mes", NOV_5);
        expect(data).toMatchObject({ messages: 420, xp: 6100, voiceSeconds: 45000, activeDays: 4, streak: 3, rank: 2, rankedMembers: 3, favoriteHour: 23, favoriteWeekday: 5, coinsEarned: 2500, coinsSpent: 800 });
        expect(data.favoriteChannel).toEqual({ id: "c1", count: 300 });
        expect(data.voiceBuddy).toEqual({ id: "buddy", seconds: 18000 });
        expect(data.talksMost?.id).toBe("friend");
        expect(data.persona.title).toBe("Coruja da Noite");
    });

    it("gera a imagem e o resumo (com o avatar a falhar, desenha na mesma)", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
        const user = { id: "u1", username: "ze", displayAvatarURL: () => "https://cdn.discordapp.com/a.png" };
        const guild = {
            id: "g", name: "EPA",
            members: { fetch: async () => { throw new Error("x"); } },
            client: { users: { fetch: async (id: string) => ({ username: id === "friend" ? "Amigo" : "Parceiro" }) } },
            channels: { cache: new Map([["c1", { name: "geral" }]]) },
        };
        const { container, files } = await buildMemberWrapped(guild as never, user as never, "mes");
        expect(files).toHaveLength(1);
        const png = (files[0]!.attachment as Buffer);
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        const json = JSON.stringify(container.toJSON());
        expect(json).toContain("attachment://wrapped.png");
        expect(json).toContain("Coruja da Noite");
        expect(json).toContain("<#c1>");
        expect(json).toContain("<@buddy>");
    }, 20_000);
});
