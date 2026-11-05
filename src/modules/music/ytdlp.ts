import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { logger } from "../../lib/logger.js";

// Música através do yt-dlp (YouTube, SoundCloud, Bandcamp, …) e do ffmpeg, que converte para
// Opus em Ogg — o formato que o Discord toca sem precisar de codificador Opus no Node.
// No Docker os dois vêm instalados; noutro sítio, YTDLP_PATH e FFMPEG_PATH apontam para eles.
// YTDLP_COOKIES_B64 (opcional): cookies do YouTube em base64, para quando o YouTube pede login
// a servidores em datacenters.

export interface Track {
    title: string;
    url: string;
    duration: number | null;
    author: string | null;
    thumbnail: string | null;
    source: "youtube" | "soundcloud" | "other";
    requestedBy: string;
}

const YTDLP = process.env.YTDLP_PATH?.trim() || "yt-dlp";
const FFMPEG = process.env.FFMPEG_PATH?.trim() || "ffmpeg";

let available: boolean | null = null;
let cookiesPath: string | null = null;

/** O yt-dlp e o ffmpeg existem nesta máquina? (verificado uma vez) */
export function musicAvailable(): boolean {
    if (available !== null) return available;
    const ok = (bin: string, arg: string) => spawnSync(bin, [arg], { timeout: 10_000, windowsHide: true }).status === 0;
    available = ok(YTDLP, "--version") && ok(FFMPEG, "-version");
    if (!available) logger.warn("Música: yt-dlp e/ou ffmpeg não encontrados — os comandos de música ficam indisponíveis.");
    const cookies = process.env.YTDLP_COOKIES_B64?.trim();
    if (available && cookies) {
        cookiesPath = join(tmpdir(), "epa-ytdlp-cookies.txt");
        writeFileSync(cookiesPath, Buffer.from(cookies, "base64"));
    }
    return available;
}

function baseArgs(): string[] {
    const args = ["--no-warnings", "--ignore-config", "--js-runtimes", "node"];
    if (cookiesPath && existsSync(cookiesPath)) args.push("--cookies", cookiesPath);
    return args;
}

function runJson(args: string[], timeoutMs = 25_000): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
        const child = spawn(YTDLP, [...baseArgs(), ...args], { windowsHide: true });
        let out = "";
        let err = "";
        const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
        child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
        child.stderr.on("data", (chunk: Buffer) => { err += chunk.toString("utf8"); });
        child.on("error", (error) => { clearTimeout(timer); reject(error); });
        child.on("close", (code) => {
            clearTimeout(timer);
            const items = out.split("\n").map((line) => line.trim()).filter(Boolean).flatMap((line) => {
                try {
                    return [JSON.parse(line) as unknown];
                } catch {
                    return [];
                }
            });
            if (items.length) return resolve(items);
            reject(new Error(err.split("\n").find((line) => line.includes("ERROR")) ?? `yt-dlp saiu com ${code}`));
        });
    });
}

interface YtItem { title?: string; url?: string; webpage_url?: string; original_url?: string; duration?: number; uploader?: string; channel?: string; thumbnail?: string; thumbnails?: Array<{ url: string }>; ie_key?: string; extractor_key?: string; id?: string }

function toTrack(item: YtItem, requestedBy: string): Track | null {
    const url = item.webpage_url ?? item.original_url ?? item.url ?? (item.id && (item.ie_key ?? item.extractor_key ?? "").toLowerCase().includes("youtube") ? `https://www.youtube.com/watch?v=${item.id}` : null);
    if (!url || !item.title) return null;
    const key = (item.extractor_key ?? item.ie_key ?? url).toLowerCase();
    return {
        title: item.title.slice(0, 200),
        url,
        duration: typeof item.duration === "number" ? Math.round(item.duration) : null,
        author: item.uploader ?? item.channel ?? null,
        thumbnail: item.thumbnail ?? item.thumbnails?.at(-1)?.url ?? null,
        source: key.includes("youtube") ? "youtube" : key.includes("soundcloud") ? "soundcloud" : "other",
        requestedBy,
    };
}

async function spotifyTitle(url: string): Promise<string | null> {
    try {
        const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8_000) });
        if (!response.ok) return null;
        const data = await response.json() as { title?: string };
        return data.title ?? null;
    } catch {
        return null;
    }
}

/**
 * Link (vídeo, playlist, SoundCloud, Spotify→pesquisa) ou texto a pesquisar. Se o YouTube
 * falhar (bloqueios a servidores), tenta o SoundCloud.
 */
export async function resolveTracks(input: string, requestedBy: string, limit = 50): Promise<Track[]> {
    let query = input.trim();
    if (/open\.spotify\.com\/track\//.test(query)) query = (await spotifyTitle(query)) ?? query;
    const isUrl = /^https?:\/\//i.test(query);
    const attempts = isUrl
        ? [["--flat-playlist", "--dump-json", "--playlist-end", String(limit), query]]
        : [["--flat-playlist", "--dump-json", `ytsearch1:${query}`], ["--flat-playlist", "--dump-json", `scsearch1:${query}`]];
    let lastError: unknown = null;
    for (const args of attempts) {
        try {
            const items = await runJson(args);
            const tracks = (items as YtItem[]).map((item) => toTrack(item, requestedBy)).filter((track): track is Track => track !== null);
            if (tracks.length) return tracks.slice(0, limit);
        } catch (error) {
            lastError = error;
        }
    }
    if (lastError) logger.warn("Música: pesquisa falhou:", lastError);
    return [];
}

/** Áudio pronto para o Discord (Ogg/Opus). Devolve o stream e uma função para parar tudo. */
export function openAudio(track: Track): { stream: Readable; kill: () => void } {
    const ytdlp: ChildProcess = spawn(YTDLP, [...baseArgs(), "-f", "bestaudio/best", "-o", "-", "--no-playlist", "--quiet", track.url], { windowsHide: true });
    const ffmpeg: ChildProcess = spawn(FFMPEG, ["-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "2", "-ar", "48000", "-c:a", "libopus", "-b:a", "128k", "-f", "ogg", "pipe:1"], { windowsHide: true });
    ytdlp.stdout!.pipe(ffmpeg.stdin!);
    ytdlp.stderr!.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8").trim();
        if (text.includes("ERROR")) logger.warn(`Música (yt-dlp): ${text.slice(0, 300)}`);
    });
    ffmpeg.stdin!.on("error", () => null);
    ytdlp.on("error", (error) => logger.warn("Música: yt-dlp falhou a arrancar:", error));
    ffmpeg.on("error", (error) => logger.warn("Música: ffmpeg falhou a arrancar:", error));
    const kill = () => {
        ytdlp.kill("SIGKILL");
        ffmpeg.kill("SIGKILL");
    };
    return { stream: ffmpeg.stdout as Readable, kill };
}

/** Áudio de um link direto (ex.: as amostras de 30 s do Deezer), só com o ffmpeg. */
export function openRemoteAudio(url: string, maxSeconds = 30): { stream: Readable; kill: () => void } {
    const ffmpeg: ChildProcess = spawn(FFMPEG, [
        "-loglevel", "error", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "3",
        "-i", url, "-t", String(maxSeconds), "-vn", "-ac", "2", "-ar", "48000", "-c:a", "libopus", "-b:a", "128k", "-f", "ogg", "pipe:1",
    ], { windowsHide: true });
    ffmpeg.on("error", (error) => logger.warn("Áudio: ffmpeg falhou a arrancar:", error));
    return { stream: ffmpeg.stdout as Readable, kill: () => void ffmpeg.kill("SIGKILL") };
}

/** Só o ffmpeg (sem o yt-dlp) — chega para as amostras do quiz de música. */
let ffmpegOk: boolean | null = null;
export function ffmpegAvailable(): boolean {
    if (ffmpegOk === null) ffmpegOk = spawnSync(FFMPEG, ["-version"], { timeout: 10_000, windowsHide: true }).status === 0;
    return ffmpegOk;
}

export function formatDuration(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds)) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Letra pelo lrclib.net (gratuito, sem chave). */
export async function findLyrics(title: string): Promise<{ title: string; artist: string; lyrics: string } | null> {
    const clean = title.replace(/\(.*?\)|\[.*?\]|official|video|lyrics?|audio|hd|4k/gi, " ").replace(/\s+/g, " ").trim();
    try {
        const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`, { headers: { "User-Agent": "EPA-BOTCHI (discord bot)" }, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) return null;
        const results = await response.json() as Array<{ trackName: string; artistName: string; plainLyrics: string | null }>;
        const hit = results.find((entry) => entry.plainLyrics);
        return hit ? { title: hit.trackName, artist: hit.artistName, lyrics: hit.plainLyrics! } : null;
    } catch {
        return null;
    }
}
