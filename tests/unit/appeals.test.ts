import { describe, expect, it } from "vitest";
import { buildAppealDefaults, normalizeAppeal, type AppealSettings } from "../../src/modules/appeals/appealSettings.js";

const withPatch = (patch: Record<string, unknown>) => normalizeAppeal({ ...buildAppealDefaults(), ...patch } as AppealSettings);

describe("revisão de bans — servidor de apelos", () => {
    it("começa sem servidor de apelos nem convite", () => {
        const s = buildAppealDefaults();
        expect(s.appeal_guild).toBeNull();
        expect(s.appeal_invite).toBeNull();
    });

    it("aceita só IDs de servidor válidos", () => {
        expect(withPatch({ appeal_guild: "1440864293137420288" }).appeal_guild).toBe("1440864293137420288");
        expect(withPatch({ appeal_guild: "não é um id" }).appeal_guild).toBeNull();
        expect(withPatch({ appeal_guild: 123 }).appeal_guild).toBeNull();
    });

    it("guarda só convites discord.gg", () => {
        expect(withPatch({ appeal_invite: "https://discord.gg/AbC-12x" }).appeal_invite).toBe("https://discord.gg/AbC-12x");
        expect(withPatch({ appeal_invite: "https://evil.example/discord.gg/abc" }).appeal_invite).toBeNull();
        expect(withPatch({ appeal_invite: "discord.gg/abc" }).appeal_invite).toBeNull();
    });
});
