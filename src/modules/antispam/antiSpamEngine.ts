import type { AntiSpamSettings } from "../../types.js";
import {
    COMBO_SCORES,
    FLOOD,
    MAX_SCORE,
    RAID,
    SCORES,
    SPAM_PATTERNS,
    TIMEOUT_STEPS_MINUTES,
} from "./antiSpamConfig.js";
import { t } from "../../lib/i18n.js";

// ─── Text helpers (pure) ───────────────────────────────────────────────────────
const DISCORD_INVITE_REGEX = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/i;

/** Lowercase, strip accents, collapse URLs/symbols — mirrors the Python normalize_text. */
export function normalizeText(text: string): string {
    let value = text.toLowerCase().trim();
    value = value.normalize("NFD").replace(/[̀-ͯ]/g, "");
    // lowercase "url" marker survives the symbol strip (avoids treating link-only
    // messages as "obfuscated" — a common false positive in the original Python).
    value = value.replace(/https?:\/\/\S+/g, " url ");
    value = value.replace(/[^a-z0-9\s]/g, " ");
    value = value.replace(/\s+/g, " ").trim();
    return value;
}

/** Levenshtein-based similarity (0..1) — stand-in for difflib SequenceMatcher.ratio. */
export function similarityRatio(a: string, b: string): number {
    if (a === b) return a ? 1 : 0;
    const lenA = a.length;
    const lenB = b.length;
    if (lenA === 0 || lenB === 0) return 0;

    const previous = new Array<number>(lenB + 1);
    const current = new Array<number>(lenB + 1);
    for (let j = 0; j <= lenB; j++) previous[j] = j;

    for (let i = 1; i <= lenA; i++) {
        current[0] = i;
        for (let j = 1; j <= lenB; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
        }
        for (let j = 0; j <= lenB; j++) previous[j] = current[j];
    }
    return 1 - previous[lenB] / Math.max(lenA, lenB);
}

const BARE_DOMAIN_REGEX = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

/** Extract hostnames from a message — catches both `https://x.com/...` and bare `x.com`. */
export function extractDomains(content: string): string[] {
    const domains: string[] = [];
    for (const token of content.split(/\s+/)) {
        const value = token.replace(/^[<>[\](){}"'`.,!?;]+|[<>[\](){}"'`.,!?;]+$/g, "");
        if (!value) continue;

        let candidate: string;
        if (/^https?:\/\//i.test(value)) candidate = value;
        else if (value.startsWith("www.") || BARE_DOMAIN_REGEX.test(value)) candidate = `http://${value}`;
        else continue;

        let host: string;
        try {
            host = new URL(candidate).hostname.toLowerCase();
        } catch {
            continue;
        }
        if (!host) continue;
        if (host.startsWith("www.")) host = host.slice(4);
        domains.push(host);
    }
    return domains;
}

export function isAllowedDomain(domain: string, whitelist: string[]): boolean {
    return whitelist.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

// ─── Content scoring (pure) ────────────────────────────────────────────────────
export interface AnalyzeInput {
    content: string;
    normalizedContent: string;
    mentionEveryone: boolean;
    uniqueMentionCount: number;
    mediaCount: number;
    accountAgeDays: number;
}

export interface SpamScore {
    score: number;
    reasons: string[];
}

export function analyzeMessage(input: AnalyzeInput, settings: AntiSpamSettings): SpamScore {
    let score = 0;
    const reasons: string[] = [];
    const { content } = input;

    // Text patterns (scams, invites, nsfw, …)
    for (const pattern of SPAM_PATTERNS) {
        if (pattern.key === "discord_invite" && settings.allow_invites) continue;
        if (pattern.regex.test(content)) {
            score += pattern.score;
            reasons.push(t(pattern.name));
        }
    }

    // External links outside the whitelist
    const blocked = [...new Set(extractDomains(content).filter((domain) => !isAllowedDomain(domain, settings.link_whitelist)))];
    const hasExternalLink = blocked.length > 0;
    if (hasExternalLink) {
        score += SCORES.externalLink;
        const preview = blocked.slice(0, 4).join(", ");
        reasons.push(t("Link externo fora da whitelist: {links}", { links: `${preview}${blocked.length > 4 ? "…" : ""}` }));
    }

    // @everyone / @here
    if (input.mentionEveryone) {
        score += SCORES.mentionEveryone;
        reasons.push(t("Menção @everyone ou @here"));
    }

    // Many user mentions
    if (input.uniqueMentionCount >= SCORES.minMentions) {
        score += SCORES.multiMention;
        reasons.push(t("Múltiplas menções ({count} utilizadores)", { count: input.uniqueMentionCount }));
    }

    // Several media attachments on their own
    if (input.mediaCount >= SCORES.minMedia) {
        score += SCORES.mediaMulti;
        reasons.push(`${input.mediaCount} ${t("anexos de média")}`);
    }

    // Heavy obfuscation: lots of symbols in the actual text (URLs/domains excluded so
    // a link-only message is never mistaken for obfuscation).
    const textOnly = content
        .replace(/https?:\/\/\S+/gi, " ")
        .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\S*/gi, " ")
        .replace(/\s+/g, "");
    if (textOnly.length >= 10) {
        const alnum = (textOnly.match(/[\p{L}\p{N}]/gu) ?? []).length;
        if (alnum / textOnly.length < 0.4) {
            score += SCORES.obfuscation;
            reasons.push(t("Texto com alta ofuscação/símbolos"));
        }
    }

    // ── Combinations (the self-bot signature) ──
    const hasDiscordLink = DISCORD_INVITE_REGEX.test(content);
    const hasMention = input.mentionEveryone || input.uniqueMentionCount >= SCORES.minMentions;
    const isSuspiciousAccount = settings.min_account_age_days > 0 && input.accountAgeDays <= settings.min_account_age_days;

    if (hasMention && hasDiscordLink) { score += COMBO_SCORES.mentionInvite; reasons.push(t("Combinação: menção + convite Discord")); }
    if (hasMention && input.mediaCount >= SCORES.minMedia) { score += COMBO_SCORES.mentionMedia; reasons.push(t("Combinação: menção + múltiplos anexos")); }
    if (input.mediaCount >= SCORES.minMedia && hasDiscordLink) { score += COMBO_SCORES.mediaInvite; reasons.push(t("Combinação: anexos + convite Discord")); }
    // MELHORIA — link externo + qualquer média: o padrão típico do self-bot.
    if (hasExternalLink && input.mediaCount >= 1) { score += COMBO_SCORES.linkMedia; reasons.push(t("Combinação: link externo + imagem/vídeo")); }
    // MELHORIA — conta nova a despejar link/média.
    if (isSuspiciousAccount && (hasExternalLink || input.mediaCount >= 1)) { score += COMBO_SCORES.newAccountPayload; reasons.push(t("Combinação: conta nova + link/média")); }

    return { score: Math.min(score, MAX_SCORE), reasons };
}

// ─── Flood / near-duplicate tracker (stateful) ─────────────────────────────────
interface FloodEntry {
    channelId: string;
    normalized: string;
    ts: number;
}
const floodTracker = new Map<string, FloodEntry[]>();

export interface FloodResult {
    isFlood: boolean;
    reason: string;
}

/**
 * Canais onde o utilizador escreveu dentro da janela de flood — é aqui que a purga vai
 * procurar as mensagens dele (o spam típico espalha-se por vários canais, não só naquele
 * onde a deteção disparou).
 */
export function recentChannelsOf(guildId: string, userId: string): string[] {
    const entries = floodTracker.get(`${guildId}:${userId}`) ?? [];
    return [...new Set(entries.map((entry) => entry.channelId))];
}

export function trackFlood(
    guildId: string,
    userId: string,
    channelId: string,
    normalizedContent: string,
    settings: AntiSpamSettings,
): FloodResult {
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const windowMs = settings.flood_window_seconds * 1000;

    const entries = (floodTracker.get(key) ?? []).filter((entry) => now - entry.ts < windowMs);
    entries.push({ channelId, normalized: normalizedContent, ts: now });
    floodTracker.set(key, entries);

    const sameChannel = entries.filter((entry) => entry.channelId === channelId);

    const duplicates = sameChannel.filter((entry) => entry.normalized && entry.normalized === normalizedContent).length;
    if (duplicates >= FLOOD.duplicateThreshold) {
        return { isFlood: true, reason: t("Conteúdo idêntico enviado {count}× no mesmo canal", { count: duplicates }) };
    }

    if (normalizedContent) {
        const similar = sameChannel.filter((entry) => entry.normalized && similarityRatio(entry.normalized, normalizedContent) >= FLOOD.similarityRatio).length;
        if (similar >= FLOOD.similarThreshold) {
            return { isFlood: true, reason: t("Mensagens quase iguais ({count}×) no mesmo canal", { count: similar }) };
        }
    }

    if (sameChannel.length >= settings.flood_messages) {
        return { isFlood: true, reason: t("{count} mensagens no mesmo canal em {seconds}s", { count: sameChannel.length, seconds: settings.flood_window_seconds }) };
    }

    const channelsUsed = new Set(entries.map((entry) => entry.channelId));
    if (channelsUsed.size >= FLOOD.crossChannelMinChannels) {
        const distinct = new Set(entries.map((entry) => entry.normalized).filter(Boolean));
        if (distinct.size <= FLOOD.crossChannelMaxDistinct) {
            return { isFlood: true, reason: t("Mesmo conteúdo em {count} canais diferentes", { count: channelsUsed.size }) };
        }
    }
    if (channelsUsed.size >= FLOOD.highVolumeChannels && entries.length >= FLOOD.highVolumeMessages) {
        return { isFlood: true, reason: t("Spam em {channels} canais ({messages} msgs em {seconds}s)", { channels: channelsUsed.size, messages: entries.length, seconds: settings.flood_window_seconds }) };
    }

    return { isFlood: false, reason: "" };
}

// ─── Raid tracker (suspicious new-account waves) ───────────────────────────────
interface JoinInfo {
    joinedAt: number;
    suspicious: boolean;
}
interface RaidEvent {
    userId: string;
    ts: number;
    suspicious: boolean;
}
const recentJoins = new Map<string, Map<string, JoinInfo>>();
const raidEvents = new Map<string, RaidEvent[]>();
const raidLastAlert = new Map<string, number>();

export function isSuspiciousAccountAge(accountAgeDays: number, settings: AntiSpamSettings): boolean {
    return settings.min_account_age_days > 0 && accountAgeDays <= settings.min_account_age_days;
}

export function recordJoin(guildId: string, userId: string, suspicious: boolean): void {
    let joins = recentJoins.get(guildId);
    if (!joins) {
        joins = new Map();
        recentJoins.set(guildId, joins);
    }
    joins.set(userId, { joinedAt: Date.now(), suspicious });
}

export interface RaidResult {
    isRaid: boolean;
    reason: string;
}

export function checkRaidOnMessage(guildId: string, userId: string): RaidResult {
    const now = Date.now();

    const joins = recentJoins.get(guildId);
    if (joins) {
        const graceMs = RAID.joinGraceSec * 1000;
        for (const [id, info] of joins) {
            if (now - info.joinedAt > graceMs) joins.delete(id);
        }
    }
    const suspiciousRecentJoin = joins?.get(userId)?.suspicious ?? false;

    const windowMs = RAID.windowSec * 1000;
    const events = (raidEvents.get(guildId) ?? []).filter((event) => now - event.ts <= windowMs);
    events.push({ userId, ts: now, suspicious: suspiciousRecentJoin });
    raidEvents.set(guildId, events);

    const suspiciousUsers = new Set(events.filter((event) => event.suspicious).map((event) => event.userId));
    if (suspiciousUsers.size < RAID.userThreshold) return { isRaid: false, reason: "" };

    const lastAlert = raidLastAlert.get(guildId);
    if (lastAlert && now - lastAlert < RAID.cooldownSec * 1000) return { isRaid: false, reason: "" };

    raidLastAlert.set(guildId, now);
    return { isRaid: true, reason: t("Raid suspeita: {count} contas novas a enviar mensagens em {seconds}s", { count: suspiciousUsers.size, seconds: RAID.windowSec }) };
}

// ─── Progressive timeout ladder ────────────────────────────────────────────────
/** Timeout (ms) for the Nth offense (1-based); caps at the last configured rung. */
export function timeoutForOffense(offenseCount: number): number {
    const index = Math.min(Math.max(1, offenseCount), TIMEOUT_STEPS_MINUTES.length) - 1;
    return TIMEOUT_STEPS_MINUTES[index] * 60_000;
}
