import { describe, expect, it, vi } from "vitest";

vi.mock("#database", () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), queryOne: vi.fn(async () => null), withTransaction: vi.fn() }));

const { defaultSizeFor, expiryFor, joinGroup, leaveGroup, parseStart, slugify } = await import("../../src/modules/lfg/lfgLogic.js");
const { findGame, normalizeGame, normalizeLfg, buildLfgDefaults } = await import("../../src/modules/lfg/lfgSettings.js");
const { groupCard } = await import("../../src/modules/lfg/lfgService.js");

const base = { host_id: "h", size: 3, members: ["h"], waitlist: [] as string[], status: "open" as const };

describe("grupos — entrar e sair", () => {
    it("entra até encher; depois vai para a lista de espera", () => {
        const a = joinGroup(base, "a");
        expect(a.result).toBe("joined");
        const b = joinGroup(a.group, "b");
        expect(b).toMatchObject({ result: "joined", filled: true });
        expect(b.group.status).toBe("full");
        const c = joinGroup(b.group, "c");
        expect(c.result).toBe("waitlisted");
        expect(c.group.waitlist).toEqual(["c"]);
        expect(joinGroup(c.group, "a").result).toBe("already");
        expect(joinGroup({ ...base, status: "closed" }, "z").result).toBe("closed");
    });

    it("quem sai liberta a vaga para o primeiro da lista de espera", () => {
        const full = { ...base, members: ["h", "a", "b"], waitlist: ["c", "d"], status: "full" as const };
        const out = leaveGroup(full, "a");
        expect(out).toMatchObject({ left: true, promoted: "c", newHost: null });
        expect(out.group.members).toEqual(["h", "b", "c"]);
        expect(out.group.waitlist).toEqual(["d"]);
        expect(out.group.status).toBe("full");
    });

    it("se o organizador sai, passa a liderança; se fica vazio, fecha", () => {
        const out = leaveGroup({ ...base, members: ["h", "a"] }, "h");
        expect(out.newHost).toBe("a");
        expect(out.group.host_id).toBe("a");
        expect(leaveGroup(base, "h")).toMatchObject({ empty: true, group: { status: "closed" } });
        expect(leaveGroup(base, "ninguem").left).toBe(false);
        expect(leaveGroup({ ...base, waitlist: ["w"] }, "w").group.waitlist).toEqual([]);
    });

    it("um grupo já em jogo não puxa ninguém da lista de espera", () => {
        const out = leaveGroup({ ...base, members: ["h", "a", "b"], waitlist: ["c"], status: "started" as const }, "a");
        expect(out.promoted).toBeNull();
        expect(out.group.status).toBe("started");
    });
});

describe("grupos — tempo, jogos e tamanhos", () => {
    it("expira 2 h depois da hora marcada, ou ao fim das horas configuradas", () => {
        expect(expiryFor(0, 10_000, 3)).toBe(10_000 + 7_200_000);
        expect(expiryFor(1_000, null, 3)).toBe(1_000 + 10_800_000);
    });

    it("lê a hora de começo", () => {
        const now = Date.UTC(2026, 10, 5, 12, 0); // 12:00 em Lisboa (inverno = UTC)
        expect(parseStart("daqui a 30m", now)).toBe(now + 1_800_000);
        expect(parseStart("daqui a 2h", now)).toBe(now + 7_200_000);
        expect(parseStart("45m", now)).toBe(now + 2_700_000);
        expect(parseStart("2h", now)).toBe(Date.UTC(2026, 10, 6, 2, 0)); // 2h = às duas (amanhã)
        expect(parseStart("21h", now)).toBe(Date.UTC(2026, 10, 5, 21, 0));
        expect(parseStart("agora", now)).toBeNull();
        expect(parseStart("blá", now)).toBeNull();
    });

    it("tamanhos típicos e nomes", () => {
        expect(defaultSizeFor("Valorant")).toBe(5);
        expect(defaultSizeFor("Rocket League")).toBe(3);
        expect(defaultSizeFor("League of Legends")).toBe(5);
        expect(defaultSizeFor("Jogo Inventado")).toBe(5);
        expect(slugify("GTA V RP")).toBe("gta-v-rp");
    });

    it("encontra o jogo pelo nome, chave ou parte", () => {
        const games = [normalizeGame({ name: "Valorant", size: 5 })!, normalizeGame({ name: "Rocket League", size: 3 })!];
        expect(findGame(games, "valorant")?.name).toBe("Valorant");
        expect(findGame(games, "rocket")?.name).toBe("Rocket League");
        expect(findGame(games, "minecraft")).toBeNull();
        expect(normalizeGame({ name: "  " })).toBeNull();
        expect(normalizeGame({ name: "X", size: 99 })!.size).toBe(20);
        const s = normalizeLfg({ ...buildLfgDefaults(), games: [games[0]!, games[0]!] });
        expect(s.games).toHaveLength(1);
    });
});

describe("grupos — cartão", () => {
    const group = {
        id: "abc12345", guild_id: "g", channel_id: "c", message_id: "m", host_id: "h", game_key: "valorant", game_name: "Valorant",
        size: 5, members: ["h", "a"], waitlist: ["w"], note: "Ouro+", mode: "Ranked", starts_at: Date.now() + 3_600_000, reminded: false,
        voice_channel_id: null, status: "open" as const, created_at: Date.now(), expires_at: Date.now() + 7_200_000, closed_at: null,
    };
    const game = { key: "valorant", name: "Valorant", emoji: "🔫", role_id: "999999999999999999", size: 5 };

    it("mostra vagas, espera, nota e menciona o cargo só ao criar", () => {
        const created = JSON.stringify(groupCard(group, game, true).toJSON());
        expect(created).toContain("2/5");
        expect(created).toContain("<@&999999999999999999>");
        expect(created).toContain("Lista de espera (1)");
        expect(created).toContain("lfg/join/abc12345");
        expect(JSON.stringify(groupCard(group, game, false).toJSON())).not.toContain("<@&999999999999999999>");
    });

    it("um grupo fechado deixa de ter botões", () => {
        expect(JSON.stringify(groupCard({ ...group, status: "closed" }, game, false).toJSON())).not.toContain("lfg/join/");
    });
});
