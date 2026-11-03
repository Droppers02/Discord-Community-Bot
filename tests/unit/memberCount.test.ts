import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";

vi.mock("#database", () => ({
    query: vi.fn(async () => ({ rows: [] })),
    queryOne: vi.fn(async () => null),
}));

const { statValue } = await import("../../src/modules/community/statsAndBroadcast.js");

// Guild mínimo — o statValue só precisa das caches para canais/cargos/boosts.
function fakeGuild(): Guild {
    return {
        channels: { cache: { size: 12 } },
        roles: { cache: { size: 7 } },
        premiumSubscriptionCount: 3,
    } as unknown as Guild;
}

describe("contadores de membros", () => {
    // O bug: "Membros" usava guild.memberCount, que INCLUI os bots.
    it("o contador de Membros não conta bots", () => {
        const counts = { humans: 24, bots: 6 };
        expect(statValue("members", fakeGuild(), counts)).toBe(24);
    });

    it("Humanos e Membros dão o mesmo (ambos excluem bots)", () => {
        const counts = { humans: 24, bots: 6 };
        expect(statValue("humans", fakeGuild(), counts)).toBe(statValue("members", fakeGuild(), counts));
    });

    it("os bots têm o seu próprio contador", () => {
        expect(statValue("bots", fakeGuild(), { humans: 24, bots: 6 })).toBe(6);
    });

    it("os restantes contadores continuam a vir do servidor", () => {
        const counts = { humans: 24, bots: 6 };
        expect(statValue("channels", fakeGuild(), counts)).toBe(12);
        expect(statValue("roles", fakeGuild(), counts)).toBe(7);
        expect(statValue("boosts", fakeGuild(), counts)).toBe(3);
    });
});
