import { describe, expect, it } from "vitest";
import { normalizeSocialHandle, parseTiktokMemory, tiktokAnnouncements, tiktokMemory } from "../../src/modules/community/socialAlerts.js";

describe("normalizeSocialHandle", () => {
    it("aceita o id do canal do YouTube, também dentro de um link", () => {
        expect(normalizeSocialHandle("youtube", "UC1234567890abcdefghijklmn")).toBe("UC1234567890abcdefghijklmn");
        expect(normalizeSocialHandle("youtube", "https://www.youtube.com/channel/UC1234567890abcdefghijklmn")).toBe("UC1234567890abcdefghijklmn");
        expect(normalizeSocialHandle("youtube", "@pixelstudio")).toBeNull();
    });

    it("tira o @ e extrai o perfil dos links", () => {
        expect(normalizeSocialHandle("tiktok", "@pixel.studio")).toBe("pixel.studio");
        expect(normalizeSocialHandle("tiktok", "https://www.tiktok.com/@pixel.studio?lang=pt")).toBe("pixel.studio");
        expect(normalizeSocialHandle("twitch", "https://twitch.tv/pixelstudio")).toBe("pixelstudio");
        expect(normalizeSocialHandle("kick", "https://kick.com/pixel-studio")).toBe("pixel-studio");
    });

    it("recusa o que não é uma conta", () => {
        expect(normalizeSocialHandle("kick", "a b")).toBeNull();
        expect(normalizeSocialHandle("twitch", "")).toBeNull();
    });
});

describe("memória do TikTok", () => {
    it("guarda e lê o contador e a sala", () => {
        expect(parseTiktokMemory(tiktokMemory(12, "room1"))).toEqual({ videos: 12, room: "room1" });
        expect(parseTiktokMemory(tiktokMemory(null, null))).toEqual({ videos: null, room: null });
        expect(parseTiktokMemory("yt:abc")).toEqual({ videos: null, room: null });
    });

    it("na primeira verificação só memoriza", () => {
        const result = tiktokAnnouncements(null, { videos: 5, live: { roomId: "r1", title: "Olá" } }, "pixel");
        expect(result.items).toEqual([]);
        expect(parseTiktokMemory(result.next)).toEqual({ videos: 5, room: "r1" });
    });

    it("anuncia vídeo novo e direto novo, uma vez", () => {
        const memory = tiktokMemory(5, null);
        const first = tiktokAnnouncements(memory, { videos: 6, live: { roomId: "r2", title: "Direto" } }, "pixel");
        expect(first.items.map((item) => item.kind)).toEqual(["video", "live"]);
        const again = tiktokAnnouncements(first.next, { videos: 6, live: { roomId: "r2", title: "Direto" } }, "pixel");
        expect(again.items).toEqual([]);
    });

    it("uma leitura falhada não apaga o contador; o fim do direto esquece a sala", () => {
        const result = tiktokAnnouncements(tiktokMemory(8, "r3"), { videos: null, live: null }, "pixel");
        expect(result.items).toEqual([]);
        expect(parseTiktokMemory(result.next)).toEqual({ videos: 8, room: null });
    });
});
