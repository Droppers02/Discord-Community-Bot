import { describe, expect, it, vi } from "vitest";
import { ChannelType, type Guild } from "discord.js";

// A DB nunca é tocada: queryOne devolve "sem linha" (defaults de cada sistema),
// exceto para guild_config, onde devolve uma linha mínima para o ensureGuildConfig.
vi.mock("#database", () => ({
    db: {},
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    queryOne: vi.fn(async (sql: string) =>
        typeof sql === "string" && sql.includes("guild_config") ? { guild_id: "guild-1" } : null),
    withTransaction: vi.fn(async () => null),
    initDatabase: vi.fn(async () => {}),
    closeDatabase: vi.fn(async () => {}),
    releaseLock: vi.fn(() => {}),
}));

import {
    buildConfigComponents,
    buildReactionRolePanelModal,
    buildSocialAddModal,
    buildSupportHoursModal,
    type ConfigSection,
} from "../../src/modules/config/configPanel.js";

function fakeGuild(): Guild {
    const textChannel = (id: string, name: string) => ({
        id,
        name,
        type: ChannelType.GuildText,
        parent: { name: "Geral" },
    });
    const cache = new Map([
        ["100", textChannel("100", "geral")],
        ["101", textChannel("101", "logs")],
    ]);
    return { id: "guild-1", channels: { cache } } as unknown as Guild;
}

const SECTIONS: ConfigSection[] = [
    "hub", "giveaways", "logs", "suggestions", "antispam", "support", "welcome",
    "voice", "roles", "ai", "custombot", "reactionroles", "social", "aimod", "stats", "broadcast",
];

describe("config panel", () => {
    for (const section of SECTIONS) {
        it(`renderiza e serializa a secção "${section}"`, async () => {
            const containers = await buildConfigComponents(section, "guild-1", fakeGuild(), "user-1");
            expect(containers.length).toBeGreaterThan(0);
            for (const container of containers) {
                const json = container.toJSON();
                expect(json).toBeTruthy();
            }
        });
    }
});

// Os campos onde se escrevia à mão ("botoes|menu", "youtube|twitch", o fuso em IANA)
// passaram a ser escolhas. Estes testes garantem que os modais continuam a serializar e
// que a escolha guardada volta marcada ao reabrir.
describe("modais de escolha", () => {
    function componentOf(json: { components?: unknown[] }, index: number): Record<string, unknown> {
        const label = (json.components ?? [])[index] as { component: Record<string, unknown> };
        return label.component;
    }

    it("o horário de atendimento usa menus, com o valor atual pré-selecionado", () => {
        const json = buildSupportHoursModal({ support_hours_json: JSON.stringify({ enabled: true, tz: "America/Sao_Paulo", start: "10:00", end: "23:00" }) }).toJSON();
        const [start, end, tz] = [0, 1, 2].map((index) => componentOf(json, index));

        for (const select of [start, end, tz]) expect(select.type).toBe(3); // string select
        const selectedValue = (select: Record<string, unknown>): unknown =>
            (select.options as Array<Record<string, unknown>>).find((option) => option.default)?.value;
        expect(selectedValue(start)).toBe("10:00");
        expect(selectedValue(end)).toBe("23:00");
        expect(selectedValue(tz)).toBe("America/Sao_Paulo");
    });

    it("mantém na lista uma hora com minutos que venha de uma configuração antiga", () => {
        const json = buildSupportHoursModal({ support_hours_json: JSON.stringify({ enabled: true, tz: "Europe/Lisbon", start: "09:30", end: "21:00" }) }).toJSON();
        const options = componentOf(json, 0).options as Array<Record<string, unknown>>;
        expect(options.map((option) => option.value)).toContain("09:30");
        expect(options.length).toBeLessThanOrEqual(25);
    });

    it("o modo do painel de auto-cargos é um grupo de opções", () => {
        const json = buildReactionRolePanelModal({ id: "p1", name: "Jogos", title: "Jogos", description: null, mode: "select", max_roles: 3 }).toJSON();
        const mode = componentOf(json, 3);
        expect(mode.type).toBe(21); // radio group
        const options = mode.options as Array<Record<string, unknown>>;
        expect(options.find((option) => option.default)?.value).toBe("select");
    });

    it("a plataforma do alerta social é um grupo de opções", () => {
        const platform = componentOf(buildSocialAddModal().toJSON(), 0);
        expect(platform.type).toBe(21);
        expect((platform.options as Array<Record<string, unknown>>).map((option) => option.value)).toEqual(["youtube", "tiktok", "twitch", "kick"]);
    });
});
