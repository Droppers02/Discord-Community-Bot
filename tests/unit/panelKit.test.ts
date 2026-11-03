import { ButtonStyle } from "discord.js";
import { describe, expect, it } from "vitest";
import { optionButton, toggleButton } from "../../src/modules/config/panelKit.js";

// Os botões mostram o que VAI acontecer ao clicar (como no PixelFx), não o estado atual.
describe("botões de ligar/desligar do /config", () => {
    it("ligado → botão vermelho para desligar", () => {
        const button = toggleButton("x/toggle", true).toJSON() as { label?: string; style: ButtonStyle };
        expect(button.label).toBe("Desligar");
        expect(button.style).toBe(ButtonStyle.Danger);
    });

    it("desligado → botão verde para ligar", () => {
        const button = toggleButton("x/toggle", false).toJSON() as { label?: string; style: ButtonStyle };
        expect(button.label).toBe("Ligar");
        expect(button.style).toBe(ButtonStyle.Success);
    });

    it("as opções secundárias dizem a ação e ficam cinzentas", () => {
        const labels = { enable: "Só dentro do horário", disable: "Avisar a qualquer hora" };
        const on = optionButton("x/hours", true, labels).toJSON() as { label?: string; style: ButtonStyle };
        const off = optionButton("x/hours", false, labels).toJSON() as { label?: string; style: ButtonStyle };
        expect(on.label).toBe("Avisar a qualquer hora");
        expect(off.label).toBe("Só dentro do horário");
        expect(on.style).toBe(ButtonStyle.Secondary);
        expect(off.style).toBe(ButtonStyle.Secondary);
    });
});
