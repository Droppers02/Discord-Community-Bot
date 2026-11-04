import { ApplicationIntegrationType } from "discord.js";
import { describe, expect, it } from "vitest";
import { userInstallUrl } from "../../src/modules/appeals/appealAccess.js";
import { buildAppealDefaults, normalizeAppeal, type AppealSettings } from "../../src/modules/appeals/appealSettings.js";

describe("revisão de bans", () => {
    it("o link de adicionar o bot à conta é de instalação de utilizador, só com comandos", () => {
        const url = new URL(userInstallUrl("1048304118042730496"));
        expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
        expect(url.searchParams.get("client_id")).toBe("1048304118042730496");
        expect(url.searchParams.get("integration_type")).toBe(String(ApplicationIntegrationType.UserInstall));
        expect(url.searchParams.get("scope")).toBe("applications.commands");
        expect(url.searchParams.has("permissions")).toBe(false);
    });

    it("as definições antigas do servidor de apelos são ignoradas", () => {
        const s = normalizeAppeal({ ...buildAppealDefaults(), appeal_guild: "123456789012345678" } as AppealSettings);
        expect("appeal_guild" in s).toBe(false);
    });
});
