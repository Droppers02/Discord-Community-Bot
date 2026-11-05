import { tk } from "../../lib/i18n.js";

// Jogos grátis — fontes e leitura (sem Discord): a API da Epic (grátis agora e na próxima semana)
// e a GamerPower (Steam, GOG, Prime Gaming, Ubisoft, itch.io, consolas, telemóveis…).

export const PLATFORMS = ["epic", "steam", "gog", "prime", "ubisoft", "itch", "ea", "battlenet", "playstation", "xbox", "switch", "android", "ios", "drmfree", "vr"] as const;
export type PlatformKey = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
    epic: tk("Epic Games"),
    steam: tk("Steam"),
    gog: tk("GOG"),
    prime: tk("Prime Gaming"),
    ubisoft: tk("Ubisoft"),
    itch: tk("itch.io"),
    ea: tk("EA"),
    battlenet: tk("Battle.net"),
    playstation: tk("PlayStation"),
    xbox: tk("Xbox"),
    switch: tk("Nintendo Switch"),
    android: tk("Android"),
    ios: tk("iOS"),
    drmfree: tk("Sem DRM"),
    vr: tk("VR"),
};

export type OfferType = "game" | "dlc" | "beta";

export interface FreeOffer {
    id: string;
    source: "epic" | "gamerpower";
    title: string;
    platforms: PlatformKey[];
    type: OfferType;
    worth: string | null;
    image: string | null;
    url: string;
    startsAt: number | null;
    endsAt: number | null;
    description: string | null;
    upcoming: boolean;
}

/** "PC, Steam, Epic Games Store" → chaves conhecidas. */
export function mapPlatforms(raw: string): PlatformKey[] {
    const found = new Set<PlatformKey>();
    for (const part of raw.split(",").map((entry) => entry.trim().toLowerCase())) {
        if (part.includes("epic")) found.add("epic");
        else if (part.includes("steam")) found.add("steam");
        else if (part === "gog" || part.includes("gog")) found.add("gog");
        else if (part.includes("prime") || part.includes("amazon")) found.add("prime");
        else if (part.includes("ubisoft") || part.includes("uplay")) found.add("ubisoft");
        else if (part.includes("switch") || part.includes("nintendo")) found.add("switch");
        else if (part === "itch.io" || part === "itch" || part.startsWith("itch.")) found.add("itch");
        else if (part.includes("origin") || part === "ea" || part.includes("ea app")) found.add("ea");
        else if (part.includes("battle")) found.add("battlenet");
        else if (part.includes("playstation") || part.startsWith("ps")) found.add("playstation");
        else if (part.includes("xbox")) found.add("xbox");
        else if (part.includes("android")) found.add("android");
        else if (part === "ios" || part.includes("iphone")) found.add("ios");
        else if (part.includes("drm")) found.add("drmfree");
        else if (part === "vr" || part.includes("oculus") || part.includes("meta quest")) found.add("vr");
    }
    return [...found];
}

function gamerPowerDate(value: unknown): number | null {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
    const ms = Date.parse(`${value.replace(" ", "T")}Z`);
    return Number.isFinite(ms) ? ms : null;
}

interface GamerPowerItem {
    id?: number; title?: string; worth?: string; image?: string; thumbnail?: string; description?: string;
    open_giveaway_url?: string; gamerpower_url?: string; type?: string; platforms?: string; end_date?: string; published_date?: string; status?: string;
}

/** Lê a resposta da GamerPower (só as ativas). */
export function parseGamerPower(json: unknown): FreeOffer[] {
    if (!Array.isArray(json)) return [];
    return (json as GamerPowerItem[]).flatMap((item) => {
        if (!item.id || !item.title || (item.status && item.status !== "Active")) return [];
        const type: OfferType = /dlc/i.test(item.type ?? "") ? "dlc" : /early|beta/i.test(item.type ?? "") ? "beta" : "game";
        const title = item.title.replace(/\s*\((?:Steam|Epic Games|GOG|Prime Gaming|Itch\.io)[^)]*\)\s*$/i, "").replace(/\s+(Giveaway|Key Giveaway|Steam Key Giveaway)$/i, "").trim();
        return [{
            id: `gp:${item.id}`,
            source: "gamerpower" as const,
            title: title || item.title,
            platforms: mapPlatforms(item.platforms ?? ""),
            type,
            worth: item.worth && item.worth !== "N/A" ? item.worth : null,
            image: item.image ?? item.thumbnail ?? null,
            url: item.open_giveaway_url ?? item.gamerpower_url ?? "https://www.gamerpower.com",
            startsAt: gamerPowerDate(item.published_date),
            endsAt: gamerPowerDate(item.end_date),
            description: item.description?.slice(0, 400) ?? null,
            upcoming: false,
        }];
    });
}

interface EpicOfferWindow { startDate?: string; endDate?: string; discountSetting?: { discountPercentage?: number } }
interface EpicElement {
    title?: string; id?: string; namespace?: string; description?: string; productSlug?: string | null; urlSlug?: string;
    offerType?: string;
    keyImages?: Array<{ type?: string; url?: string }>;
    catalogNs?: { mappings?: Array<{ pageSlug?: string }> | null };
    offerMappings?: Array<{ pageSlug?: string }> | null;
    price?: { totalPrice?: { originalPrice?: number; fmtPrice?: { originalPrice?: string } } };
    promotions?: { promotionalOffers?: Array<{ promotionalOffers?: EpicOfferWindow[] }>; upcomingPromotionalOffers?: Array<{ promotionalOffers?: EpicOfferWindow[] }> } | null;
}

function freeWindow(groups: Array<{ promotionalOffers?: EpicOfferWindow[] }> | undefined): EpicOfferWindow | null {
    for (const group of groups ?? []) {
        for (const window of group.promotionalOffers ?? []) {
            if (window.discountSetting?.discountPercentage === 0) return window;
        }
    }
    return null;
}

/** Lê a resposta da Epic: grátis agora (`upcoming: false`) e na próxima semana (`upcoming: true`). */
export function parseEpic(json: unknown, now = Date.now()): FreeOffer[] {
    const elements = (json as { data?: { Catalog?: { searchStore?: { elements?: EpicElement[] } } } })?.data?.Catalog?.searchStore?.elements;
    if (!Array.isArray(elements)) return [];
    const offers: FreeOffer[] = [];
    for (const element of elements) {
        if (!element.title || !element.id) continue;
        const current = freeWindow(element.promotions?.promotionalOffers);
        const upcoming = freeWindow(element.promotions?.upcomingPromotionalOffers);
        const window = current ?? upcoming;
        if (!window) continue;
        const startsAt = window.startDate ? Date.parse(window.startDate) : null;
        const endsAt = window.endDate ? Date.parse(window.endDate) : null;
        const isUpcoming = !current || (startsAt !== null && startsAt > now);
        if (endsAt !== null && endsAt < now) continue;
        const slug = element.offerMappings?.[0]?.pageSlug ?? element.catalogNs?.mappings?.[0]?.pageSlug ?? element.productSlug?.replace(/\/home$/, "") ?? null;
        const image = element.keyImages?.find((image) => image.type === "OfferImageWide")?.url
            ?? element.keyImages?.find((image) => image.type === "DieselStoreFrontWide")?.url
            ?? element.keyImages?.find((image) => image.type === "Thumbnail")?.url
            ?? null;
        offers.push({
            id: `epic:${element.namespace ?? "x"}:${element.id}:${startsAt ?? 0}`,
            source: "epic",
            title: element.title,
            platforms: ["epic"],
            type: element.offerType === "DLC" || element.offerType === "ADD_ON" ? "dlc" : "game",
            worth: element.price?.totalPrice?.fmtPrice?.originalPrice && element.price.totalPrice.originalPrice ? element.price.totalPrice.fmtPrice.originalPrice : null,
            image,
            url: slug ? `https://store.epicgames.com/pt/p/${slug}` : "https://store.epicgames.com/pt/free-games",
            startsAt,
            endsAt,
            description: element.description?.slice(0, 400) ?? null,
            upcoming: isUpcoming,
        });
    }
    return offers;
}

function normalizeTitle(title: string): string {
    return title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

/** Junta as duas fontes: os da Epic vêm da Epic (mais fiável); a GamerPower não os repete. */
export function mergeOffers(epic: FreeOffer[], gamerPower: FreeOffer[]): FreeOffer[] {
    const epicTitles = new Set(epic.map((offer) => normalizeTitle(offer.title)));
    const rest = gamerPower.filter((offer) => !(offer.platforms.includes("epic") && (epic.length > 0 || epicTitles.has(normalizeTitle(offer.title)))));
    return [...epic, ...rest];
}

export interface OfferFilter { platforms: PlatformKey[]; include_dlc: boolean; include_beta: boolean }

/** As ofertas que interessam a este servidor (só as que já estão grátis). */
export function filterOffers(offers: FreeOffer[], filter: OfferFilter, now = Date.now()): FreeOffer[] {
    const wanted = new Set(filter.platforms);
    return offers.filter((offer) => {
        if (offer.upcoming) return false;
        if (offer.endsAt !== null && offer.endsAt < now) return false;
        if (offer.type === "dlc" && !filter.include_dlc) return false;
        if (offer.type === "beta" && !filter.include_beta) return false;
        return offer.platforms.some((platform) => wanted.has(platform));
    });
}
