import type { GuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import { legacyRolePanels, mergeLegacyRolePanels } from "../../src/modules/community/legacyRolePanels.js";
import { applyRoleSelection, MAX_RR_PANELS, MAX_RR_ROLES } from "../../src/modules/community/reactionRoles.js";

describe("auto-cargos — painéis do bot antigo", () => {
    it("são os 3 painéis (jogos, plataformas, DM) com os cargos todos", () => {
        const panels = legacyRolePanels();
        expect(panels.map((panel) => panel.id)).toEqual(["epa-jogos", "epa-plataformas", "epa-dm"]);
        expect(panels.map((panel) => panel.roles.length)).toEqual([15, 4, 3]);
        for (const panel of panels) {
            expect(panel.roles.length).toBeLessThanOrEqual(MAX_RR_ROLES);
            expect(new Set(panel.roles.map((entry) => entry.role_id)).size).toBe(panel.roles.length);
            expect((panel.description ?? "").length).toBeLessThanOrEqual(500);
        }
        expect(panels.find((panel) => panel.id === "epa-dm")?.max_roles).toBe(1);
    });

    it("juntam-se aos que já existem sem duplicar", () => {
        const once = mergeLegacyRolePanels([]);
        expect(once).toHaveLength(3);
        expect(mergeLegacyRolePanels(once)).toHaveLength(3);
        expect(mergeLegacyRolePanels([], MAX_RR_PANELS).length).toBeLessThanOrEqual(MAX_RR_PANELS);
    });
});

describe("auto-cargos — escolha única", () => {
    function fakeMember(roleIds: string[]) {
        const owned = new Set(roleIds);
        const panelRole = { editable: true, permissions: { has: () => false } };
        return {
            owned,
            member: {
                guild: { roles: { cache: { get: () => panelRole } } },
                roles: {
                    cache: { has: (id: string) => owned.has(id) },
                    add: async (id: string) => void owned.add(id),
                    remove: async (id: string) => void owned.delete(id),
                },
            } as unknown as GuildMember,
        };
    }

    const dm = legacyRolePanels().find((panel) => panel.id === "epa-dm")!;
    const [canDm, askDm, noDm] = dm.roles.map((entry) => entry.role_id);

    it("escolher uma preferência de DM tira as outras", async () => {
        const { member, owned } = fakeMember([canDm!, noDm!]);
        const result = await applyRoleSelection(member, dm, [], askDm);
        expect(result.added).toEqual([askDm]);
        expect(result.removed.sort()).toEqual([canDm, noDm].sort());
        expect([...owned]).toEqual([askDm]);
    });

    it("nos painéis sem limite os cargos acumulam", async () => {
        const games = legacyRolePanels()[0]!;
        const [first, second] = games.roles.map((entry) => entry.role_id);
        const { member, owned } = fakeMember([first!]);
        const result = await applyRoleSelection(member, games, [], second);
        expect(result.removed).toEqual([]);
        expect(owned.has(first!) && owned.has(second!)).toBe(true);
    });
});
