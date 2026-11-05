import { describe, expect, it } from "vitest";
import { canDo, colorHex, isoWeek, parseColor, previousWeek, sortByRank, validName, validTag } from "../../src/modules/teams/teamLogic.js";
import { buildTeamDefaults, normalizeTeams } from "../../src/modules/teams/teamSettings.js";

describe("equipas — quem pode fazer o quê", () => {
    it("convidar e editar: dono e oficiais", () => {
        expect(canDo("owner", "invite")).toBe(true);
        expect(canDo("officer", "invite")).toBe(true);
        expect(canDo("member", "invite")).toBe(false);
        expect(canDo("officer", "edit")).toBe(true);
    });

    it("expulsar só quem está abaixo", () => {
        expect(canDo("owner", "kick", "officer")).toBe(true);
        expect(canDo("officer", "kick", "member")).toBe(true);
        expect(canDo("officer", "kick", "officer")).toBe(false);
        expect(canDo("officer", "kick", "owner")).toBe(false);
        expect(canDo("member", "kick", "member")).toBe(false);
    });

    it("promover, passar a equipa, levantar e apagar: só o dono", () => {
        for (const action of ["promote", "demote", "transfer", "withdraw", "delete"] as const) {
            expect(canDo("owner", action, "member")).toBe(true);
            expect(canDo("officer", action, "member")).toBe(false);
        }
    });

    it("lista ordenada por cargo e depois por pontos", () => {
        const sorted = sortByRank([
            { id: "m1", rank: "member" as const, points: 50 },
            { id: "o", rank: "owner" as const, points: 1 },
            { id: "m2", rank: "member" as const, points: 90 },
            { id: "of", rank: "officer" as const, points: 10 },
        ]);
        expect(sorted.map((member) => member.id)).toEqual(["o", "of", "m2", "m1"]);
    });
});

describe("equipas — nomes, tags e cores", () => {
    it("nomes de 3 a 32 caracteres, sem símbolos estranhos", () => {
        expect(validName("  Os   Invencíveis ")).toBe("Os Invencíveis");
        expect(validName("ab")).toBeNull();
        expect(validName("<@everyone>")).toBeNull();
    });

    it("tags de 2 a 5 letras/números, em maiúsculas", () => {
        expect(validTag("epa")).toBe("EPA");
        expect(validTag("A")).toBeNull();
        expect(validTag("TOOLONG")).toBeNull();
        expect(validTag("A-B")).toBeNull();
    });

    it("cores por hexadecimal ou por nome", () => {
        expect(parseColor("#ff8800")).toBe(0xff8800);
        expect(parseColor("ff8800")).toBe(0xff8800);
        expect(parseColor("Vermelho")).toBe(0xe74c3c);
        expect(parseColor("azul")).toBe(0x3498db);
        expect(parseColor("arco-íris")).toBeNull();
        expect(colorHex(0x00ff00)).toBe("#00ff00");
    });
});

describe("equipas — semanas da guerra", () => {
    it("semanas ISO em Lisboa, com a viragem do ano", () => {
        expect(isoWeek(Date.UTC(2026, 0, 1, 12))).toBe("2026-W01");  // quinta
        expect(isoWeek(Date.UTC(2026, 10, 2, 12))).toBe("2026-W45"); // segunda
        expect(isoWeek(Date.UTC(2026, 10, 8, 12))).toBe("2026-W45"); // domingo da mesma semana
        expect(isoWeek(Date.UTC(2026, 11, 31, 12))).toBe("2026-W53");
        expect(isoWeek(Date.UTC(2027, 0, 1, 12))).toBe("2026-W53");  // sexta, ainda na semana 53
        expect(isoWeek(Date.UTC(2027, 0, 4, 12))).toBe("2027-W01");
    });

    it("domingo às 23:30 em Lisboa ainda é a mesma semana (hora de verão)", () => {
        expect(isoWeek(Date.UTC(2026, 6, 12, 22, 30))).toBe("2026-W28"); // domingo 23:30 em Lisboa
        expect(isoWeek(Date.UTC(2026, 6, 12, 23, 30))).toBe("2026-W29"); // segunda 00:30 em Lisboa
    });

    it("a semana anterior", () => {
        expect(previousWeek(Date.UTC(2026, 10, 9, 12))).toBe("2026-W45");
        expect(previousWeek(Date.UTC(2027, 0, 4, 12))).toBe("2026-W53");
    });

    it("definições fora dos limites são corrigidas", () => {
        expect(normalizeTeams({ ...buildTeamDefaults(), max_members: 1, max_teams: 0, create_cost: -5 })).toMatchObject({ max_members: 2, max_teams: 1, create_cost: 0 });
    });
});
