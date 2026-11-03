import { describe, expect, it } from "vitest";
import { e, ei, emoji, registerAppEmojis } from "../../src/lib/emojis.js";

describe("emojis da aplicação", () => {
    it("usa o unicode enquanto os emojis da aplicação não estão carregados", () => {
        registerAppEmojis(new Map());
        expect(e("success")).toBe("✅");
        expect(emoji.coin).toBe("🪙");
        expect(ei("settings")).toBe("⚙️");
    });

    it("usa o emoji da aplicação quando existe (pelo nome do ícone, com aliases)", () => {
        registerAppEmojis(new Map([
            ["check", { id: "111", animated: false }],
            ["coin", { id: "222", animated: false }],
            ["refreshing", { id: "333", animated: true }],
        ]));
        expect(e("accept")).toBe("<:check:111>");
        expect(emoji.coin).toBe("<:coin:222>");
        expect(e("refreshing")).toBe("<a:refreshing:333>");
        expect(ei("coin")).toEqual({ id: "222", name: "coin", animated: false });
    });

    it("um nome sem ícone nem unicode dá texto vazio (nunca `:nome:`)", () => {
        registerAppEmojis(new Map());
        expect(e("naoexiste")).toBe("");
    });
});
