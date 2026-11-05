import { ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder, type Client, type Guild, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query } from "#database";
import { ourGuilds } from "../../config.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import { startDaily } from "../../repositories/gameStatsRepository.js";
import { lisbonDay } from "../economy/economyService.js";
import { filterOffers, mergeOffers, parseEpic, parseGamerPower, PLATFORM_LABELS, type FreeOffer } from "./freeGamesSources.js";
import { getFreeGamesSettings, type FreeGamesSettings } from "./freeGamesSettings.js";

// Jogos grátis: de 30 em 30 minutos vê a Epic e a GamerPower, publica o que ainda não foi
// publicado neste servidor (free_game_posts), marca como "terminou" o que acabou e, à quinta,
// faz o resumo da Epic. As respostas das fontes ficam 10 minutos em cache (partilhadas).

const EPIC_URL = "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-PT&country=PT&allowCountries=PT";
const GAMERPOWER_URL = "https://www.gamerpower.com/api/giveaways";
const CACHE_MS = 10 * 60_000;
const TICK_MS = 30 * 60_000;
const MAX_POSTS_PER_TICK = 6;

let cache: { at: number; offers: FreeOffer[] } | null = null;

async function fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, { headers: { "User-Agent": "EPA-BOTCHI (discord bot)" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
    return response.json();
}

/** Todas as ofertas (grátis agora e as próximas da Epic), com cache. */
export async function fetchOffers(force = false): Promise<FreeOffer[]> {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.offers;
    const [epic, gamerPower] = await Promise.all([
        fetchJson(EPIC_URL).then((json) => parseEpic(json)).catch((error) => { logger.warn("Jogos grátis: Epic falhou:", error); return [] as FreeOffer[]; }),
        fetchJson(GAMERPOWER_URL).then(parseGamerPower).catch((error) => { logger.warn("Jogos grátis: GamerPower falhou:", error); return [] as FreeOffer[]; }),
    ]);
    const offers = mergeOffers(epic, gamerPower);
    if (offers.length || !cache) cache = { at: Date.now(), offers };
    return cache.offers;
}

const TYPE_LABEL = { game: "Jogo", dlc: "DLC", beta: "Acesso antecipado" } as const;

export function offerCard(offer: FreeOffer, opts: { mentionRole?: string | null; ended?: boolean } = {}): ContainerPlusBuilder {
    const platforms = offer.platforms.map((key) => t(PLATFORM_LABELS[key])).join(", ") || t("PC");
    const container = buildContainer({
        color: opts.ended ? COLORS.neutral : COLORS.success,
        title: `${opts.ended ? "⌛" : "🆓"} ${offer.title}`,
        description: [
            opts.mentionRole ? `<@&${opts.mentionRole}>` : null,
            `**${platforms}** · ${t(TYPE_LABEL[offer.type])}`,
            opts.ended
                ? t("Esta oferta já terminou.")
                : [
                    offer.worth ? t("Valia **{worth}** — agora é grátis!", { worth: offer.worth }) : t("Grátis!"),
                    offer.endsAt ? t("Até {date} ({ago})", { date: timestamp(offer.endsAt, "f"), ago: timestamp(offer.endsAt, "R") }) : null,
                ].filter(Boolean).join(" · "),
            !opts.ended && offer.description ? `-# ${offer.description.slice(0, 300)}` : null,
        ].filter(Boolean).join("\n"),
    });
    if (offer.image && !opts.ended) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(offer.image)));
    container.addActionRowComponents(row(new ButtonBuilder()
        .setLabel(opts.ended ? t("Terminou") : offer.source === "epic" ? t("Resgatar na Epic") : t("Resgatar"))
        .setStyle(ButtonStyle.Link)
        .setURL(offer.url)
        .setDisabled(Boolean(opts.ended))));
    return container;
}

async function postedIds(guildId: string): Promise<Set<string>> {
    const { rows } = await query("SELECT offer_id FROM free_game_posts WHERE guild_id = $1", [guildId]);
    return new Set(rows.map((row) => String(row.offer_id)));
}

async function postOffers(guild: Guild, settings: FreeGamesSettings, offers: FreeOffer[]): Promise<number> {
    const channel = settings.channel ? guild.channels.cache.get(settings.channel) : null;
    if (!channel?.isTextBased()) return 0;
    const already = await postedIds(guild.id);
    const fresh = filterOffers(offers, settings).filter((offer) => !already.has(offer.id)).slice(0, MAX_POSTS_PER_TICK);
    let posted = 0;
    for (const offer of fresh) {
        const sent = await (channel as TextChannel).send({
            components: [offerCard(offer, { mentionRole: settings.ping_role })],
            flags: CV2_FLAG,
            allowedMentions: settings.ping_role ? { roles: [settings.ping_role] } : { parse: [] },
        }).catch((error) => { logger.warn("Jogos grátis: falha a publicar:", error); return null; });
        await query(
            `INSERT INTO free_game_posts (guild_id, offer_id, channel_id, message_id, title, ends_at, posted_at, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (guild_id, offer_id) DO NOTHING`,
            [guild.id, offer.id, channel.id, sent?.id ?? null, offer.title, offer.endsAt, Date.now(), JSON.stringify(offer)],
        );
        if (sent) posted++;
    }
    return posted;
}

/** Marca como terminadas as publicações cujo prazo passou (botão desligado, imagem fora). */
async function expirePosts(guild: Guild): Promise<void> {
    const { rows } = await query("SELECT offer_id, channel_id, message_id, data FROM free_game_posts WHERE guild_id = $1 AND expired = FALSE AND ends_at IS NOT NULL AND ends_at < $2", [guild.id, Date.now()]);
    for (const row of rows) {
        const channel = guild.channels.cache.get(String(row.channel_id));
        const message = channel?.isTextBased() && row.message_id ? await channel.messages.fetch(String(row.message_id)).catch(() => null) : null;
        if (message && row.data) await message.edit({ components: [offerCard(row.data as FreeOffer, { ended: true })], allowedMentions: { parse: [] } }).catch(() => null);
        await query("UPDATE free_game_posts SET expired = TRUE WHERE guild_id = $1 AND offer_id = $2", [guild.id, row.offer_id]);
    }
}

export function epicWeekView(offers: FreeOffer[]): ContainerPlusBuilder {
    const epic = offers.filter((offer) => offer.source === "epic");
    const now = epic.filter((offer) => !offer.upcoming);
    const next = epic.filter((offer) => offer.upcoming);
    const line = (offer: FreeOffer) => `• [${offer.title}](${offer.url})${offer.endsAt && !offer.upcoming ? ` — ${t("até {date}", { date: timestamp(offer.endsAt, "D") })}` : ""}${offer.upcoming && offer.startsAt ? ` — ${t("a partir de {date}", { date: timestamp(offer.startsAt, "D") })}` : ""}`;
    return buildContainer({
        color: COLORS.primary,
        title: `📅 ${t("Epic Games — jogos grátis da semana")}`,
        fields: [
            { name: t("Grátis agora"), value: now.length ? now.map(line).join("\n") : t("*Nada esta semana.*") },
            { name: t("Na próxima semana"), value: next.length ? next.map(line).join("\n") : t("*Ainda não se sabe.*") },
        ],
    });
}

/** /jogosgratis — o que está grátis agora (filtrado pelas plataformas do servidor). */
export async function freeGamesListView(guildId: string): Promise<ContainerPlusBuilder> {
    const [settings, offers] = await Promise.all([getFreeGamesSettings(guildId), fetchOffers()]);
    const current = filterOffers(offers, { ...settings, platforms: settings.platforms.length ? settings.platforms : ["epic", "steam", "gog", "prime"] });
    const upcoming = offers.filter((offer) => offer.source === "epic" && offer.upcoming);
    const lines = current.slice(0, 15).map((offer) => {
        const platforms = offer.platforms.map((key) => t(PLATFORM_LABELS[key])).join("/");
        return `🆓 [${offer.title}](${offer.url}) · ${platforms}${offer.worth ? ` · ~~${offer.worth}~~` : ""}${offer.endsAt ? ` · ${t("até {when}", { when: timestamp(offer.endsAt, "R") })}` : ""}`;
    });
    return buildContainer({
        color: COLORS.success,
        title: `🆓 ${t("Jogos grátis agora")}`,
        description: lines.length ? lines.join("\n") : t("Nada grátis nas plataformas escolhidas neste momento. 😢"),
        fields: upcoming.length ? [{ name: t("Em breve na Epic"), value: upcoming.map((offer) => `⏳ [${offer.title}](${offer.url})${offer.startsAt ? ` · ${timestamp(offer.startsAt, "R")}` : ""}`).join("\n") }] : [],
        footerText: t("Fontes: Epic Games e GamerPower · atualiza de 10 em 10 minutos"),
    });
}

/**
 * Ao ligar: as ofertas que já estão a decorrer contam como vistas, menos as 3 mais recentes —
 * assim não chovem 20 publicações de uma vez, e daí para a frente só aparecem as novas.
 */
export async function seedSeenOffers(guild: Guild): Promise<void> {
    const settings = await getFreeGamesSettings(guild.id);
    const current = filterOffers(await fetchOffers(), settings).sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0));
    for (const offer of current.slice(3)) {
        await query(
            `INSERT INTO free_game_posts (guild_id, offer_id, channel_id, message_id, title, ends_at, posted_at, data, expired) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, TRUE)
             ON CONFLICT (guild_id, offer_id) DO NOTHING`,
            [guild.id, offer.id, settings.channel ?? "0", offer.title, offer.endsAt, Date.now(), JSON.stringify(offer)],
        );
    }
}

/** Publica já o que houver (botão do /config). */
export async function checkFreeGamesNow(guild: Guild): Promise<number> {
    const settings = await getFreeGamesSettings(guild.id);
    if (!settings.enabled) return 0;
    return postOffers(guild, settings, await fetchOffers(true));
}

const weekFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", hourCycle: "h23" });

async function tick(client: Client<true>): Promise<void> {
    const guilds = ourGuilds(client);
    const settingsByGuild = await Promise.all(guilds.map(async (guild) => ({ guild, settings: await getFreeGamesSettings(guild.id) })));
    const active = settingsByGuild.filter(({ settings }) => settings.enabled && settings.channel);
    if (!active.length) return;
    const offers = await fetchOffers(true);
    const parts = Object.fromEntries(weekFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
    // A Epic muda à quinta às 16:00 (UTC) — o resumo sai depois das 17h de Lisboa.
    const weeklyTime = parts.weekday === "Thu" && Number(parts.hour) >= 17;
    for (const { guild, settings } of active) {
        await postOffers(guild, settings, offers).catch((error) => logger.warn("Jogos grátis:", error));
        await expirePosts(guild).catch(() => null);
        if (settings.weekly_epic && weeklyTime && await startDaily(guild.id, "_", "freegames-weekly", lisbonDay(Date.now()))) {
            const channel = guild.channels.cache.get(settings.channel!);
            if (channel?.isTextBased()) await (channel as TextChannel).send({ components: [epicWeekView(offers)], flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch(() => null);
        }
    }
}

let timer: NodeJS.Timeout | null = null;

export function startFreeGamesJobs(client: Client<true>): void {
    if (timer) return;
    const run = () => void tick(client).catch((error) => logger.warn("Jogos grátis: falha na tarefa:", error));
    setTimeout(run, 90_000).unref?.();
    timer = setInterval(run, TICK_MS);
    timer.unref?.();
}
