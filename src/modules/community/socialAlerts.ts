import type { Client, TextChannel } from "discord.js";
import { logger } from "../../lib/logger.js";
import { env } from "#env";
import { getSocialSettings, saveSocialSettings } from "./communitySettings.js";
import { isAllowedGuild } from "../../config.js";
import type { SocialSubscription } from "../../types.js";
import { t } from "../../lib/i18n.js";

// Alertas sociais, verificados de 5 em 5 minutos; `last_item` evita anúncios repetidos.
//   • YouTube — RSS público (sem chave): vídeos novos.
//   • Twitch — Helix com app token (TWITCH_CLIENT_ID/SECRET no .env; sem eles fica dormente).
//   • Kick — API pública oficial com app token (KICK_CLIENT_ID/SECRET; sem eles fica dormente).
//   • TikTok — sem API oficial: o direto vem do endpoint público do TikTok Live e os vídeos
//     novos do contador do perfil. Pode falhar se o TikTok mudar o site — falha em silêncio.

const POLL_INTERVAL_MS = 5 * 60_000;
let timer: NodeJS.Timeout | null = null;

// Um feed que não responde não pode prender a ronda de verificação de todos os servidores.
const FETCH_TIMEOUT_MS = 10_000;
// O TikTok devolve uma página vazia a pedidos sem cara de browser.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

type AlertKind = "video" | "live";

interface FoundItem {
    itemId: string;
    title: string;
    url: string;
    kind: AlertKind;
}

function defaultTemplate(sub: SocialSubscription, item: FoundItem): string {
    if (item.kind === "live") return t("🔴 **{name}** está em direto: **{title}**\n{url}");
    // O TikTok não dá o título do vídeo (só o contador do perfil).
    if (sub.platform === "tiktok") return t("🎵 **{name}** publicou um vídeo novo no TikTok\n{url}");
    return t("📺 **{name}** publicou um vídeo novo: **{title}**\n{url}");
}

function template(sub: SocialSubscription, item: FoundItem): string {
    const base = sub.message_template?.trim() || defaultTemplate(sub, item);
    const mention = sub.mention_role ? `<@&${sub.mention_role}> ` : "";
    return mention + base.replaceAll("{name}", sub.display_name ?? sub.handle).replaceAll("{title}", item.title).replaceAll("{url}", item.url);
}

function envValue(key: string): string | undefined {
    return (env as Record<string, string | undefined>)[key];
}

// ─── YouTube (RSS, sem chave) ────────────────────────────────────────────────
async function checkYoutube(sub: SocialSubscription): Promise<FoundItem | null> {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(sub.handle)}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const xml = await res.text();
    const entry = xml.split("<entry>")[1];
    if (!entry) return null;
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
    if (!videoId || !title) return null;
    return { itemId: `yt:${videoId}`, title, url: `https://youtu.be/${videoId}`, kind: "video" };
}

// ─── Tokens de app (client credentials), com cache até perto de expirar ──────
interface CachedToken { token: string; expiresAt: number }
const appTokens = new Map<string, CachedToken>();

async function appToken(name: "twitch" | "kick", url: string, idKey: string, secretKey: string): Promise<string | null> {
    const id = envValue(idKey);
    const secret = envValue(secretKey);
    if (!id || !secret) return null;
    const cached = appTokens.get(name);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    // Segredo no corpo, não no endereço: URLs acabam em logs de proxies e de erros.
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json() as { access_token?: string; expires_in?: number | string };
    if (!json.access_token) return null;
    // A Kick não documenta a validade; sem número, renova-se ao fim de uma hora.
    const seconds = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3600;
    appTokens.set(name, { token: json.access_token, expiresAt: Date.now() + seconds * 1000 });
    return json.access_token;
}

// ─── Twitch (Helix com app token; dormente sem credenciais) ─────────────────
async function checkTwitch(sub: SocialSubscription): Promise<FoundItem | null> {
    const token = await appToken("twitch", "https://id.twitch.tv/oauth2/token", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET");
    const clientId = envValue("TWITCH_CLIENT_ID");
    if (!token || !clientId) return null;
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(sub.handle)}`, {
        headers: { "client-id": clientId, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data: Array<{ id: string; title: string; user_name: string }> };
    const stream = json.data[0];
    if (!stream) return null; // offline
    return { itemId: `tw:${stream.id}`, title: stream.title || "Live", url: `https://twitch.tv/${sub.handle}`, kind: "live" };
}

// ─── Kick (API pública oficial; dormente sem credenciais) ───────────────────
async function checkKick(sub: SocialSubscription): Promise<FoundItem | null> {
    const token = await appToken("kick", "https://id.kick.com/oauth/token", "KICK_CLIENT_ID", "KICK_CLIENT_SECRET");
    if (!token) return null;
    const slug = sub.handle.trim().toLowerCase();
    const res = await fetch(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: Array<{ slug?: string; stream_title?: string; stream?: { is_live?: boolean; start_time?: string } | null }> };
    const channel = json.data?.[0];
    if (!channel?.stream?.is_live) return null; // offline
    // Sem id de sessão na resposta: o início do direto identifica-o.
    return { itemId: `kk:${channel.stream.start_time ?? "live"}`, title: channel.stream_title || "Live", url: `https://kick.com/${channel.slug ?? slug}`, kind: "live" };
}

// ─── TikTok (sem API oficial; o melhor possível) ─────────────────────────────
async function tiktokLive(handle: string): Promise<{ roomId: string; title: string } | null> {
    const params = new URLSearchParams({ aid: "1988", app_language: "en", app_name: "tiktok_web", uniqueId: handle, sourceType: "54" });
    const res = await fetch(`https://www.tiktok.com/api-live/user/room/?${params.toString()}`, {
        headers: { "user-agent": BROWSER_UA, accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null) as { data?: { user?: { roomId?: string }; liveRoom?: { status?: number; title?: string } } } | null;
    const room = json?.data?.liveRoom;
    const roomId = json?.data?.user?.roomId;
    // status 2 = em direto.
    if (!room || room.status !== 2 || !roomId) return null;
    return { roomId, title: room.title || "Live" };
}

async function tiktokVideoCount(handle: string): Promise<number | null> {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(handle)}`, {
        headers: { "user-agent": BROWSER_UA, "accept-language": "en" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const raw = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    if (!raw) return null;
    try {
        const data = JSON.parse(raw) as { __DEFAULT_SCOPE__?: Record<string, { userInfo?: { stats?: { videoCount?: number } } }> };
        const count = data.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo?.stats?.videoCount;
        return typeof count === "number" ? count : null;
    } catch {
        return null;
    }
}

/** Memória do TikTok: o contador de vídeos e o último direto, num só `last_item`. */
export function parseTiktokMemory(value: string | null): { videos: number | null; room: string | null } {
    const match = value?.match(/^tt:v(-?\d+)\|l(.*)$/);
    if (!match) return { videos: null, room: null };
    const videos = Number(match[1]);
    return { videos: videos >= 0 ? videos : null, room: match[2] || null };
}

export function tiktokMemory(videos: number | null, room: string | null): string {
    return `tt:v${videos ?? -1}|l${room ?? ""}`;
}

/**
 * O que há para anunciar numa conta do TikTok e a memória nova. Na primeira verificação
 * (sem memória) só se memoriza — não se anuncia o que já existia antes de a conta ser seguida.
 */
export function tiktokAnnouncements(
    memory: string | null,
    current: { videos: number | null; live: { roomId: string; title: string } | null },
    handle: string,
): { items: FoundItem[]; next: string } {
    const before = parseTiktokMemory(memory);
    const first = memory === null;
    const items: FoundItem[] = [];
    const profile = `https://www.tiktok.com/@${handle}`;
    if (!first && current.videos !== null && before.videos !== null && current.videos > before.videos) {
        items.push({ itemId: `ttv:${current.videos}`, title: t("Vídeo novo"), url: profile, kind: "video" });
    }
    if (!first && current.live && current.live.roomId !== before.room) {
        items.push({ itemId: `ttl:${current.live.roomId}`, title: current.live.title, url: `${profile}/live`, kind: "live" });
    }
    // Uma leitura falhada (null) não apaga o que se sabia; um direto terminado esquece a sala.
    const videos = current.videos ?? before.videos;
    const room = current.live ? current.live.roomId : null;
    return { items, next: tiktokMemory(videos, room) };
}

export const SOCIAL_PLATFORMS = ["youtube", "twitch", "tiktok", "kick"] as const;
export type SocialPlatformInput = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(value: string | null | undefined): value is SocialPlatformInput {
    return (SOCIAL_PLATFORMS as readonly string[]).includes(value ?? "");
}

/**
 * A conta como a plataforma a quer, a partir do que a pessoa colou: um link do perfil, o
 * nome com ou sem "@", ou (YouTube) o id do canal. Devolve null se não for válida.
 */
export function normalizeSocialHandle(platform: SocialPlatformInput, raw: string): string | null {
    let value = raw.trim();
    const fromUrl = (re: RegExp) => value.match(re)?.[1] ?? null;
    if (platform === "youtube") {
        value = fromUrl(/youtube\.com\/channel\/(UC[\w-]{20,})/i) ?? value;
        return /^UC[\w-]{20,}$/.test(value) ? value : null;
    }
    if (platform === "tiktok") value = fromUrl(/tiktok\.com\/@([\w.]+)/i) ?? value;
    if (platform === "twitch") value = fromUrl(/twitch\.tv\/([\w]+)/i) ?? value;
    if (platform === "kick") value = fromUrl(/kick\.com\/([\w-]+)/i) ?? value;
    value = value.replace(/^@/, "");
    const valid = platform === "tiktok" ? /^[\w.]{2,24}$/ : platform === "kick" ? /^[\w-]{2,25}$/ : /^\w{3,25}$/;
    return valid.test(value) ? value : null;
}

export function isTwitchConfigured(): boolean {
    return Boolean(envValue("TWITCH_CLIENT_ID") && envValue("TWITCH_CLIENT_SECRET"));
}

export function isKickConfigured(): boolean {
    return Boolean(envValue("KICK_CLIENT_ID") && envValue("KICK_CLIENT_SECRET"));
}

/** Itens a anunciar e a memória seguinte de uma subscrição (sem tocar no Discord). */
async function checkSubscription(sub: SocialSubscription): Promise<{ items: FoundItem[]; next: string | null }> {
    if (sub.platform === "tiktok") {
        const handle = sub.handle.replace(/^@/, "").trim();
        const [videos, live] = await Promise.all([
            tiktokVideoCount(handle).catch(() => null),
            tiktokLive(handle).catch(() => null),
        ]);
        return tiktokAnnouncements(sub.last_item, { videos, live }, handle);
    }
    const item = sub.platform === "youtube" ? await checkYoutube(sub)
        : sub.platform === "twitch" ? await checkTwitch(sub)
        : sub.platform === "kick" ? await checkKick(sub)
        : null; // instagram: sem fonte pública fiável
    if (!item || item.itemId === sub.last_item) return { items: [], next: sub.last_item };
    // Primeira verificação de uma subscrição nova: memoriza sem anunciar (evita anunciar o
    // último vídeo antigo mal se configura).
    return { items: sub.last_item === null ? [] : [item], next: item.itemId };
}

async function pollGuild(client: Client<true>, guildId: string): Promise<void> {
    if (!isAllowedGuild(guildId)) return;
    const settings = await getSocialSettings(guildId);
    if (settings.subscriptions.length === 0) return;

    let changed = false;
    const updated = [...settings.subscriptions];

    for (let i = 0; i < updated.length; i++) {
        const sub = updated[i];
        if (!sub.announce_channel) continue;
        try {
            const { items, next } = await checkSubscription(sub);
            const channel = client.channels.cache.get(sub.announce_channel);
            if (channel?.isTextBased()) {
                for (const item of items) {
                    await (channel as TextChannel).send({
                        content: template(sub, item),
                        allowedMentions: { parse: ["roles"] },
                    }).catch(() => null);
                }
            }
            if (next !== sub.last_item) {
                updated[i] = { ...sub, last_item: next };
                changed = true;
            }
        } catch (error) {
            logger.warn(`Alertas sociais: falha em ${sub.platform}/${sub.handle}:`, error);
        }
    }

    if (changed) await saveSocialSettings(guildId, { subscriptions: updated });
}

export function startSocialAlertsPoller(client: Client<true>): void {
    if (timer) return;
    const tick = async () => {
        for (const guild of client.guilds.cache.values()) {
            await pollGuild(client, guild.id).catch(() => null);
        }
    };
    timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    timer.unref?.();
    setTimeout(() => void tick(), 15_000).unref?.();
}
