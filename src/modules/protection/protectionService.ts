import { ChannelType, type Guild, type GuildMember, type Message, type TextChannel } from "discord.js";
import { lockServer } from "../moderation/lockdown.js";
import { getLockdownSettings } from "../moderation/lockdownSettings.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { humanizeDuration } from "../../lib/time.js";
import { getModerationSettings } from "../moderation/moderationSettings.js";
import { warnMember } from "../moderation/moderationService.js";
import { getProtectionSettings, type ProtectionSettings } from "./protectionSettings.js";

// ─── Texto normalizado (acentos, maiúsculas, "l33t") ─────────────────────────

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[013457@$!]/g, (char) => LEET[char] ?? char)
        // "p.a.l.a.v.r.a" e "p a l a v r a" contam como a palavra.
        .replace(/(?<=\b\w)[.\-_ ](?=\w\b)/g, "");
}

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A primeira palavra proibida que aparece no texto (ou null). */
export function findBannedWord(text: string, words: string[]): string | null {
    const normalized = normalizeText(text);
    for (const word of words) {
        const prefix = word.endsWith("*");
        const base = normalizeText(word.replace(/\*+$/, ""));
        if (!base) continue;
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(base)}${prefix ? "" : "(?=$|[^\\p{L}\\p{N}])"}`, "u");
        if (pattern.test(normalized)) return word;
    }
    return null;
}

const ADULT_DOMAINS = [
    "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com", "youporn.com", "onlyfans.com", "fansly.com",
    "chaturbate.com", "stripchat.com", "livejasmin.com", "cam4.com", "bongacams.com", "brazzers.com", "spankbang.com",
    "rule34.xxx", "e621.net", "nhentai.net", "hentaihaven.xxx", "motherless.com", "tnaflix.com", "eporner.com", "porn.com",
    "youjizz.com", "tube8.com", "beeg.com", "hqporner.com", "manyvids.com",
];

export function findAdultLink(text: string): string | null {
    const hosts = [...text.matchAll(/https?:\/\/([^\s/]+)/gi)].map((match) => match[1]!.toLowerCase().replace(/^www\./, ""));
    for (const host of hosts) {
        if (ADULT_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return host;
        if (/\.(xxx|porn|sex|adult)$/.test(host)) return host;
    }
    return null;
}

async function protectionLog(guild: Guild, title: string, text: string, color: number = COLORS.warning): Promise<void> {
    const moderation = await getModerationSettings(guild.id);
    if (!moderation.log_channel) return;
    const channel = guild.channels.cache.get(moderation.log_channel);
    if (!channel?.isTextBased()) return;
    await (channel as TextChannel).send({
        components: [buildContainer({ color, title: `${e("shield")} ${title}`, description: text })],
        flags: CV2_FLAG,
        allowedMentions: { parse: [] },
    }).catch(() => null);
}

function isExempt(member: GuildMember, channelId: string, parentId: string | null, settings: ProtectionSettings): boolean {
    if (member.permissions.has("ManageMessages")) return true;
    if (settings.exempt_channels.includes(channelId) || (parentId && settings.exempt_channels.includes(parentId))) return true;
    return settings.exempt_roles.some((role) => member.roles.cache.has(role));
}

// ─── Filtro de palavras e de conteúdo adulto ─────────────────────────────────

/** Verifica uma mensagem (nova ou editada). Devolve true se foi apagada. */
export async function checkMessageContent(message: Message<true>): Promise<boolean> {
    if (message.author.bot || !message.member) return false;
    const settings = await getProtectionSettings(message.guildId);
    if (!settings.word_filter_enabled && !settings.adult_filter_enabled) return false;
    const parentId = message.channel.isThread() ? message.channel.parentId : null;
    if (isExempt(message.member, message.channelId, parentId, settings)) return false;

    const text = [message.content, ...message.embeds.map((embed) => `${embed.title ?? ""} ${embed.description ?? ""} ${embed.url ?? ""}`)].join(" ");
    let reason: string | null = null;
    if (settings.word_filter_enabled && settings.words.length) {
        const word = findBannedWord(text, settings.words);
        if (word) reason = t("palavra proibida «{word}»", { word });
    }
    const nsfwChannel = "nsfw" in message.channel && Boolean((message.channel as { nsfw?: boolean }).nsfw);
    if (!reason && settings.adult_filter_enabled && !nsfwChannel) {
        const host = findAdultLink(text);
        if (host) reason = t("link de conteúdo adulto ({host})", { host });
    }
    if (!reason) return false;

    await message.delete().catch(() => null);
    const member = message.member;
    let applied = t("mensagem apagada");
    try {
        if (settings.filter_action === "warn") {
            const me = message.guild.members.me;
            if (me) {
                const result = await warnMember(member, me, t("Filtro automático: {reason}", { reason }));
                applied = t("mensagem apagada e aviso #{n}", { n: result.entry.case_number });
            }
        } else if (settings.filter_action === "timeout" && member.moderatable) {
            await member.timeout(settings.filter_timeout_minutes * 60_000, t("Filtro automático: {reason}", { reason }));
            applied = t("mensagem apagada e castigo de {duration}", { duration: humanizeDuration(settings.filter_timeout_minutes * 60_000) });
        }
    } catch (error) {
        logger.warn("Proteção: falha a aplicar a ação do filtro:", error);
    }
    if (message.channel.isSendable()) {
        const notice = await message.channel.send({
            components: [buildContainer({ color: COLORS.warning, description: `${e("warn")} ${t("{user}, essa mensagem não é permitida aqui.", { user: `<@${member.id}>` })}` })],
            flags: CV2_FLAG,
            allowedMentions: { users: [member.id] },
        }).catch(() => null);
        if (notice) setTimeout(() => void notice.delete().catch(() => null), 6_000).unref?.();
    }
    void protectionLog(message.guild, t("Filtro automático"), t("{user} em {channel}: {reason} — {applied}.\n-# {excerpt}", {
        user: `<@${member.id}>`,
        channel: `<#${message.channelId}>`,
        reason,
        applied,
        excerpt: message.content.replace(/\n/g, " ").slice(0, 150),
    }));
    return true;
}

// ─── Anti-raid ───────────────────────────────────────────────────────────────

const recentJoins = new Map<string, Array<{ id: string; at: number }>>();
const raidCooldown = new Map<string, number>();

export async function trackJoinForRaid(member: GuildMember): Promise<void> {
    const settings = await getProtectionSettings(member.guild.id);
    if (!settings.raid_enabled || member.user.bot) return;
    const now = Date.now();
    const windowMs = settings.raid_seconds * 1000;
    const joins = (recentJoins.get(member.guild.id) ?? []).filter((join) => now - join.at <= windowMs);
    joins.push({ id: member.id, at: now });
    recentJoins.set(member.guild.id, joins);
    if (joins.length < settings.raid_joins) return;
    if ((raidCooldown.get(member.guild.id) ?? 0) > now) return;
    raidCooldown.set(member.guild.id, now + windowMs);
    recentJoins.set(member.guild.id, []);

    const guild = member.guild;
    let action = t("só alerta");
    try {
        if (settings.raid_action === "pause") {
            const until = new Date(now + settings.raid_pause_minutes * 60_000);
            await guild.setIncidentActions({ invitesDisabledUntil: until });
            action = t("convites pausados até {at}", { at: `<t:${Math.floor(until.getTime() / 1000)}:t>` });
        } else if (settings.raid_action === "kick") {
            let kicked = 0;
            for (const join of joins) {
                const target = guild.members.cache.get(join.id);
                if (target?.kickable) {
                    await target.kick(t("Anti-raid automático")).then(() => kicked++).catch(() => null);
                }
            }
            action = t("{count} membros expulsos", { count: kicked });
        }
    } catch (error) {
        logger.warn("Anti-raid: falha a aplicar a ação:", error);
        action = t("a ação falhou (permissões do bot?)");
    }
    // Trancas (/config → Trancas): fechar o servidor enquanto o raid passa.
    const lockdown = await getLockdownSettings(guild.id);
    if (lockdown.raid_lockdown) {
        const locked = await lockServer(guild, { source: "raid", reason: t("Raid detetado"), by: guild.client.user.id, until: now + lockdown.raid_lockdown_minutes * 60_000 }).catch(() => null);
        if (locked?.channels) action += ` · ${t("servidor trancado ({n} canais, {min} min)", { n: locked.channels, min: lockdown.raid_lockdown_minutes })}`;
    }
    void protectionLog(guild, t("🚨 Raid detetado"), [
        t("{count} entradas em {seconds} s — {action}.", { count: joins.length, seconds: settings.raid_seconds, action }),
        joins.slice(-15).map((join) => `<@${join.id}>`).join(" "),
    ].join("\n"), COLORS.danger);
}

// ─── Slowmode automático ─────────────────────────────────────────────────────

const channelBursts = new Map<string, number[]>();
const slowmodeActive = new Map<string, NodeJS.Timeout>();

export async function trackMessageForSlowmode(message: Message<true>): Promise<void> {
    if (message.author.bot || message.channel.type !== ChannelType.GuildText) return;
    const settings = await getProtectionSettings(message.guildId);
    if (!settings.slowmode_enabled) return;
    if (settings.slowmode_channels.length && !settings.slowmode_channels.includes(message.channelId)) return;
    if (slowmodeActive.has(message.channelId)) return;
    const now = Date.now();
    const windowMs = settings.slowmode_window_seconds * 1000;
    const stamps = (channelBursts.get(message.channelId) ?? []).filter((at) => now - at <= windowMs);
    stamps.push(now);
    channelBursts.set(message.channelId, stamps);
    if (stamps.length < settings.slowmode_messages) return;

    const channel = message.channel as TextChannel;
    if (channel.rateLimitPerUser > 0) return; // já tem slowmode posto à mão
    channelBursts.delete(message.channelId);
    const ok = await channel.setRateLimitPerUser(settings.slowmode_seconds, t("Slowmode automático")).then(() => true).catch(() => false);
    if (!ok) return;
    const duration = settings.slowmode_duration_minutes * 60_000;
    const timer = setTimeout(() => {
        slowmodeActive.delete(channel.id);
        if (channel.rateLimitPerUser === settings.slowmode_seconds) void channel.setRateLimitPerUser(0, t("Fim do slowmode automático")).catch(() => null);
    }, duration);
    timer.unref?.();
    slowmodeActive.set(channel.id, timer);
    await channel.send({
        components: [buildContainer({ color: COLORS.info, description: `🐢 ${t("Muita conversa ao mesmo tempo — slowmode de {seconds} s durante {duration}.", { seconds: settings.slowmode_seconds, duration: humanizeDuration(duration) })}` })],
        flags: CV2_FLAG,
    }).catch(() => null);
    void protectionLog(message.guild, t("Slowmode automático"), t("{channel}: {count} mensagens em {window} s → slowmode de {seconds} s durante {duration}.", {
        channel: `<#${channel.id}>`, count: stamps.length, window: settings.slowmode_window_seconds, seconds: settings.slowmode_seconds, duration: humanizeDuration(duration),
    }), COLORS.info);
}
