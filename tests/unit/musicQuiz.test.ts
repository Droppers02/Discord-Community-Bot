import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#database", () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), queryOne: vi.fn(async () => null), withTransaction: vi.fn() }));

const { hintFor, matchesAnswer, normalizeAnswer, normalizeArtist, pickRounds, pointsFor, similarity } = await import("../../src/modules/musicquiz/musicQuizLogic.js");
const { isDeezerPreview, loadTracks } = await import("../../src/modules/musicquiz/musicQuiz.js");

describe("quiz de música — limpar e comparar", () => {
    it("tira feats, parênteses, remasters e acentos", () => {
        expect(normalizeAnswer("Dracula (with JENNIE)")).toBe("dracula");
        expect(normalizeAnswer("Bohemian Rhapsody - Remastered 2011")).toBe("bohemian rhapsody");
        expect(normalizeAnswer("Despacito feat. Justin Bieber")).toBe("despacito");
        expect(normalizeAnswer("Canção do Mar")).toBe("cancao do mar");
        expect(normalizeArtist("The Weeknd")).toBe("weeknd");
    });

    it("aceita erros de escrita e a resposta no meio de uma frase", () => {
        expect(matchesAnswer("dracula", "dracula")).toBe(true);
        expect(matchesAnswer("Dracla", "dracula")).toBe(true);
        expect(matchesAnswer("é o dracula do tame impala", "dracula")).toBe(true);
        expect(matchesAnswer("é o dracula do tame impala", "tame impala", true)).toBe(true);
        expect(matchesAnswer("bohemian rapsody", "bohemian rhapsody")).toBe(true);
        expect(matchesAnswer("the weeknd", "weeknd", true)).toBe(true);
        expect(matchesAnswer("frankenstein", "dracula")).toBe(false);
        expect(matchesAnswer("", "dracula")).toBe(false);
    });

    it("respostas curtas só contam certinhas", () => {
        expect(matchesAnswer("u2", "u2", true)).toBe(true);
        expect(matchesAnswer("u3", "u2", true)).toBe(false);
        expect(matchesAnswer("abba", "abba", true)).toBe(true);
        expect(matchesAnswer("abbb", "abba", true)).toBe(false);
    });

    it("semelhança e pontos", () => {
        expect(similarity("abc", "abc")).toBe(1);
        expect(similarity("abcd", "abce")).toBe(0.75);
        expect(pointsFor("title", 5_000)).toBe(3);
        expect(pointsFor("title", 20_000)).toBe(2);
        expect(pointsFor("artist", 1_000)).toBe(1);
    });

    it("dica com a primeira letra de cada palavra", () => {
        expect(hintFor("Bohemian Rhapsody")).toBe("B_______  R_______");
        expect(hintFor("Dracula (with JENNIE)")).toBe("D______");
        expect(hintFor("Don't Stop")).toBe("D__'_  S___");
    });

    it("escolhe rondas sem repetir artistas enquanto houver outros", () => {
        const tracks = [{ artist: "A", id: 1 }, { artist: "A", id: 2 }, { artist: "B", id: 3 }, { artist: "C", id: 4 }];
        const picked = pickRounds(tracks, 3, () => 0.5);
        expect(new Set(picked.map((entry) => entry.artist)).size).toBe(3);
        expect(pickRounds(tracks, 4, () => 0.5)).toHaveLength(4);
    });
});

describe("quiz de música — músicas do Deezer", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("só aceita amostras do CDN do Deezer em https", () => {
        expect(isDeezerPreview("https://cdnt-preview.dzcdn.net/api/1/1/6/2/5/0/6254df.mp3?hdnea=exp=1762311717~acl=/api/1/1/6/2/5/0/6254df.mp3*~data=user_id=0,application_id=42~hmac=ab12")).toBe(true);
        expect(isDeezerPreview("http://cdnt-preview.dzcdn.net/x.mp3")).toBe(false);
        expect(isDeezerPreview("https://evil.example.com/x.mp3")).toBe(false);
        expect(isDeezerPreview("file:///etc/passwd")).toBe(false);
        expect(isDeezerPreview("https://dzcdn.net.evil.com/x")).toBe(false);
    });

    it("lê uma playlist, ignora faixas sem amostra e repetidas", async () => {
        const track = (title: string, artist: string, preview = "https://cdnt-preview.dzcdn.net/api/1/a.mp3") => ({ title, title_short: title, preview, link: "https://www.deezer.com/track/1", artist: { name: artist }, album: { cover_big: "https://e-cdns-images.dzcdn.net/c.jpg" } });
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tracks: { data: [track("Song A", "X"), track("Song A", "X"), track("Song B", "Y", ""), track("Song C", "Z")] } }))));
        const tracks = await loadTracks("anos80", null);
        expect(tracks.map((entry) => entry.title)).toEqual(["Song A", "Song C"]);
        expect(tracks[0]!.answerArtist).toBe("x");
    });
});
