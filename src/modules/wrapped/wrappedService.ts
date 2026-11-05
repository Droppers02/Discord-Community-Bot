import { AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, MediaGalleryBuilder, MediaGalleryItemBuilder, type Client, type Guild, type TextChannel, type User } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne } from "#database";
import { ourGuilds } from "../../config.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { startDaily } from "../../repositories/gameStatsRepository.js";
import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { backToHubRow, channelSelect, onOff, optionButton, showChannel, toggleButton } from "../config/panelKit.js";
import { renderWrappedImage } from "./wrappedImage.js";
import { lisbonParts, longestStreak, monthOf, personaFor, periodRange, topEntry, WEEKDAY_NAMES, type PeriodRange, type Persona, type WrappedPeriod } from "./wrappedStats.js";

// EPA Wrapped: a retrospetiva de cada membro (imagem + resumo) e a do servidor, para o mês, o
// mês passado ou o ano. A do servidor sai sozinha no dia 1 de cada mês (se estiver ligado).

// ─── Definições ──────────────────────────────────────────────────────────────

export interface WrappedSettings { enabled: boolean; channel: string | null; monthly_post: boolean }
const defaults = (): WrappedSettings => ({ enabled: true, channel: null, monthly_post: true });
const normalize = (value: WrappedSettings): WrappedSettings => ({
    enabled: value.enabled !== false,
    channel: typeof value.channel === "string" && /^\d{5,25}$/.test(value.channel) ? value.channel : null,
    monthly_post: value.monthly_post !== false,
});
export const getWrappedSettings = (guildId: string) => getSettings("wrapped_settings", guildId, defaults(), normalize);
export const saveWrappedSettings = (guildId: string, patch: Partial<WrappedSettings>) => saveSettings("wrapped_settings", guildId, patch, defaults(), normalize);

// ─── Números de um membro ────────────────────────────────────────────────────

export interface MemberWrapped {
    range: PeriodRange;
    messages: number;
    xp: number;
    voiceSeconds: number;
    activeDays: number;
    streak: number;
    busiestDay: { day: string; messages: number } | null;
    rank: number | null;
    rankedMembers: number;
    percentile: number | null;
    favoriteHour: number | null;
    favoriteWeekday: number | null;
    favoriteChannel: { id: string; count: number } | null;
    channelsUsed: number;
    favoriteEmoji: { key: string; count: number } | null;
    emojis: number;
    talksMost: { id: string; count: number } | null;
    voiceBuddy: { id: string; seconds: number } | null;
    coinsEarned: number;
    coinsSpent: number;
    team: string | null;
    persona: Persona;
}

export async function memberWrapped(guildId: string, userId: string, period: WrappedPeriod, now = Date.now()): Promise<MemberWrapped> {
    const range = periodRange(period, now);
    const days = [range.fromDay, range.toDay];
    const [totals, activeRows, busiest, ranking, counts, buddy, coins, team] = await Promise.all([
        queryOne<{ messages: string; xp: string; voice: string }>("SELECT COALESCE(SUM(messages), 0) AS messages, COALESCE(SUM(xp), 0) AS xp, COALESCE(SUM(voice_seconds), 0) AS voice FROM member_activity WHERE guild_id = $1 AND user_id = $2 AND day BETWEEN $3 AND $4", [guildId, userId, ...days]),
        query("SELECT day FROM member_activity WHERE guild_id = $1 AND user_id = $2 AND day BETWEEN $3 AND $4 AND (messages > 0 OR voice_seconds > 0)", [guildId, userId, ...days]),
        queryOne<{ day: string; messages: number }>("SELECT day, messages FROM member_activity WHERE guild_id = $1 AND user_id = $2 AND day BETWEEN $3 AND $4 ORDER BY messages DESC LIMIT 1", [guildId, userId, ...days]),
        query("SELECT user_id, SUM(messages) AS m FROM member_activity WHERE guild_id = $1 AND day BETWEEN $2 AND $3 GROUP BY user_id HAVING SUM(messages) > 0 ORDER BY m DESC", [guildId, ...days]),
        query("SELECT kind, key, SUM(count) AS c FROM wrapped_counts WHERE guild_id = $1 AND user_id = $2 AND month = ANY($3) GROUP BY kind, key", [guildId, userId, range.months]),
        queryOne<{ other: string; s: string }>(
            `SELECT CASE WHEN user_a = $2 THEN user_b ELSE user_a END AS other, SUM(seconds) AS s FROM voice_pairs
             WHERE guild_id = $1 AND (user_a = $2 OR user_b = $2) AND month = ANY($3) GROUP BY other ORDER BY s DESC LIMIT 1`,
            [guildId, userId, range.months],
        ),
        queryOne<{ earned: string; spent: string }>("SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS earned, COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0) AS spent FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 AND created_at BETWEEN $3 AND $4", [guildId, userId, range.fromMs, range.toMs]),
        queryOne<{ name: string; tag: string }>("SELECT t.name, t.tag FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.guild_id = $1 AND m.user_id = $2", [guildId, userId]).catch(() => null),
    ]);

    const byKind = (kind: string) => counts.rows.filter((entry) => entry.kind === kind).map((entry) => ({ key: String(entry.key), count: Number(entry.c) }));
    const hour = topEntry(byKind("hour"));
    const weekday = topEntry(byKind("weekday"));
    const channel = topEntry(byKind("channel"));
    const emojiEntries = byKind("emoji");
    const talk = topEntry(byKind("talk"));
    const position = ranking.rows.findIndex((entry) => String(entry.user_id) === userId);
    const messages = Number(totals?.messages ?? 0);
    const voiceSeconds = Number(totals?.voice ?? 0);
    const activeDays = activeRows.rows.length;
    const periodDays = Math.round((Date.parse(`${range.toDay}T00:00:00Z`) - Date.parse(`${range.fromDay}T00:00:00Z`)) / 86_400_000) + 1;
    const percentile = position >= 0 && ranking.rows.length ? Math.max(1, Math.ceil(((position + 1) / ranking.rows.length) * 100)) : null;

    const result: Omit<MemberWrapped, "persona"> = {
        range,
        messages,
        xp: Number(totals?.xp ?? 0),
        voiceSeconds,
        activeDays,
        streak: longestStreak(activeRows.rows.map((entry) => String(entry.day))),
        busiestDay: busiest && busiest.messages > 0 ? { day: busiest.day, messages: Number(busiest.messages) } : null,
        rank: position >= 0 ? position + 1 : null,
        rankedMembers: ranking.rows.length,
        percentile,
        favoriteHour: hour ? Number(hour.key) : null,
        favoriteWeekday: weekday ? Number(weekday.key) : null,
        favoriteChannel: channel ? { id: channel.key, count: channel.count } : null,
        channelsUsed: byKind("channel").length,
        favoriteEmoji: topEntry(emojiEntries),
        emojis: emojiEntries.reduce((sum, entry) => sum + entry.count, 0),
        talksMost: talk ? { id: talk.key, count: talk.count } : null,
        voiceBuddy: buddy ? { id: buddy.other, seconds: Number(buddy.s) } : null,
        coinsEarned: Number(coins?.earned ?? 0),
        coinsSpent: Number(coins?.spent ?? 0),
        team: team ? `[${team.tag}] ${team.name}` : null,
    };
    const persona = personaFor({
        messages, voiceHours: voiceSeconds / 3600, activeDays, periodDays, favoriteHour: result.favoriteHour,
        channelsUsed: result.channelsUsed, emojis: result.emojis, percentile,
    });
    return { ...result, persona };
}

const hours = (seconds: number) => seconds >= 3600 ? `${(seconds / 3600).toFixed(seconds >= 36_000 ? 0 : 1).replace(".", ",")} h` : `${Math.round(seconds / 60)} min`;

/** A retrospetiva de um membro: imagem e resumo com os mesmos números (e menções). */
export async function buildMemberWrapped(guild: Guild, user: User, period: WrappedPeriod): Promise<{ container: ContainerPlusBuilder; files: AttachmentBuilder[] }> {
    const data = await memberWrapped(guild.id, user.id, period);
    const member = await guild.members.fetch(user.id).catch(() => null);
    const name = member?.displayName ?? user.username;
    const nameOf = async (id: string) => (await guild.members.fetch(id).catch(() => null))?.displayName ?? (await guild.client.users.fetch(id).catch(() => null))?.username ?? "?";
    const channelName = data.favoriteChannel ? guild.channels.cache.get(data.favoriteChannel.id)?.name ?? "?" : null;
    const emojiName = data.favoriteEmoji ? (data.favoriteEmoji.key.match(/^<:(\w+):\d+>$/)?.[1] ?? null) : null;

    const image = await renderWrappedImage({
        name,
        avatarUrl: (member ?? user).displayAvatarURL({ extension: "png", size: 256 }),
        periodLabel: data.range.label,
        personaTitle: t(data.persona.title),
        personaLine: t(data.persona.line),
        stats: [
            { label: t("mensagens"), value: formatNumber(data.messages) },
            { label: t("em voz"), value: hours(data.voiceSeconds) },
            { label: t("XP ganho"), value: formatNumber(data.xp) },
            { label: t("dias ativos"), value: formatNumber(data.activeDays) },
            { label: t("dias seguidos (recorde)"), value: formatNumber(data.streak) },
            { label: t("moedas ganhas"), value: formatNumber(data.coinsEarned) },
        ],
        favorites: [
            ...(channelName ? [{ label: t("Canal"), value: channelName }] : []),
            ...(data.favoriteHour !== null ? [{ label: t("Hora"), value: `${String(data.favoriteHour).padStart(2, "0")}h` }] : []),
            ...(data.favoriteWeekday !== null ? [{ label: t("Dia"), value: t(WEEKDAY_NAMES[data.favoriteWeekday]!) }] : []),
            ...(data.talksMost ? [{ label: t("Falas com"), value: await nameOf(data.talksMost.id) }] : []),
            ...(data.voiceBuddy ? [{ label: t("Voz com"), value: await nameOf(data.voiceBuddy.id) }] : []),
            ...(emojiName ? [{ label: t("Emoji"), value: emojiName }] : data.team ? [{ label: t("Equipa"), value: data.team }] : []),
        ],
        footer: data.rank ? t("{rank}.º de {total} a escrever · top {pct}% · {server}", { rank: data.rank, total: data.rankedMembers, pct: data.percentile ?? 100, server: guild.name }) : guild.name,
    });

    const files = image ? [new AttachmentBuilder(image, { name: "wrapped.png", description: t("EPA Wrapped de {name}", { name }) })] : [];
    const lines = [
        `${data.persona.emoji} **${t(data.persona.title)}** — ${t(data.persona.line)}`,
        "",
        t("💬 **{n}** mensagens · 🎙️ **{voice}** em voz · ✨ **{xp}** XP", { n: formatNumber(data.messages), voice: hours(data.voiceSeconds), xp: formatNumber(data.xp) }),
        t("📅 **{days}** dias ativos · 🔥 recorde de **{streak}** dias seguidos", { days: data.activeDays, streak: data.streak }),
        data.busiestDay ? t("📈 O teu dia mais falador: {day} ({n} mensagens)", { day: data.busiestDay.day.split("-").reverse().join("/"), n: formatNumber(data.busiestDay.messages) }) : null,
        data.rank ? t("🏅 {rank}.º de {total} a escrever (top {pct}%)", { rank: data.rank, total: data.rankedMembers, pct: data.percentile ?? 100 }) : null,
        data.favoriteChannel ? t("📍 Canal favorito: {channel} ({n})", { channel: `<#${data.favoriteChannel.id}>`, n: formatNumber(data.favoriteChannel.count) }) : null,
        data.favoriteEmoji ? t("😄 Emoji favorito: {emoji} ({n}×)", { emoji: data.favoriteEmoji.key, n: data.favoriteEmoji.count }) : null,
        data.talksMost ? t("🗣️ Quem mais te responde/mencionas: {user}", { user: `<@${data.talksMost.id}>` }) : null,
        data.voiceBuddy ? t("🎧 Parceiro de voz: {user} ({time} juntos)", { user: `<@${data.voiceBuddy.id}>`, time: hours(data.voiceBuddy.seconds) }) : null,
        data.coinsEarned || data.coinsSpent ? t("🪙 {earned} moedas ganhas · {spent} gastas", { earned: formatNumber(data.coinsEarned), spent: formatNumber(data.coinsSpent) }) : null,
        data.team ? t("🛡️ Equipa: {team}", { team: data.team }) : null,
    ].filter((line) => line !== null);

    const container = buildContainer({
        color: COLORS.primary,
        title: `🎁 ${t("EPA Wrapped de {name} — {period}", { name, period: data.range.label })}`,
        description: lines.join("\n"),
        footerText: data.messages + data.voiceSeconds === 0 ? t("Ainda não há dados deste período — os detalhes (horas, canais, emojis, voz) contam a partir da 4.0.") : null,
    });
    if (files.length) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://wrapped.png")));
    return { container, files };
}

// ─── O servidor ──────────────────────────────────────────────────────────────

export async function buildServerWrapped(guild: Guild, period: WrappedPeriod): Promise<ContainerPlusBuilder> {
    const range = periodRange(period);
    const days = [range.fromDay, range.toDay];
    const [totals, top, busiest, channels, emojis, voice] = await Promise.all([
        queryOne<{ messages: string; voice: string; members: string }>("SELECT COALESCE(SUM(messages), 0) AS messages, COALESCE(SUM(voice_seconds), 0) AS voice, COUNT(DISTINCT user_id) AS members FROM member_activity WHERE guild_id = $1 AND day BETWEEN $2 AND $3", [guild.id, ...days]),
        query("SELECT user_id, SUM(messages) AS m FROM member_activity WHERE guild_id = $1 AND day BETWEEN $2 AND $3 GROUP BY user_id ORDER BY m DESC LIMIT 5", [guild.id, ...days]),
        queryOne<{ day: string; m: string }>("SELECT day, SUM(messages) AS m FROM member_activity WHERE guild_id = $1 AND day BETWEEN $2 AND $3 GROUP BY day ORDER BY m DESC LIMIT 1", [guild.id, ...days]),
        query("SELECT key, SUM(count) AS c FROM wrapped_counts WHERE guild_id = $1 AND month = ANY($2) AND kind = 'channel' GROUP BY key ORDER BY c DESC LIMIT 3", [guild.id, range.months]),
        query("SELECT key, SUM(count) AS c FROM wrapped_counts WHERE guild_id = $1 AND month = ANY($2) AND kind = 'emoji' GROUP BY key ORDER BY c DESC LIMIT 5", [guild.id, range.months]),
        query("SELECT user_id, SUM(voice_seconds) AS v FROM member_activity WHERE guild_id = $1 AND day BETWEEN $2 AND $3 GROUP BY user_id HAVING SUM(voice_seconds) > 0 ORDER BY v DESC LIMIT 3", [guild.id, ...days]),
    ]);
    const medals = ["🥇", "🥈", "🥉", "4.", "5."];
    return buildContainer({
        color: COLORS.gold,
        title: `🎁 ${t("EPA Wrapped do servidor — {period}", { period: range.label })}`,
        thumbnailUrl: guild.iconURL({ size: 128 }),
        description: t("💬 **{messages}** mensagens · 🎙️ **{voice}** em voz · 👥 **{members}** pessoas ativas", { messages: formatNumber(Number(totals?.messages ?? 0)), voice: hours(Number(totals?.voice ?? 0)), members: formatNumber(Number(totals?.members ?? 0)) }),
        fields: [
            { name: t("Quem mais escreveu"), value: top.rows.length ? top.rows.map((entry, index) => `${medals[index]} <@${entry.user_id}> — ${formatNumber(Number(entry.m))}`).join("\n") : t("*Ninguém ainda.*") },
            { name: t("Quem mais esteve em voz"), value: voice.rows.length ? voice.rows.map((entry, index) => `${medals[index]} <@${entry.user_id}> — ${hours(Number(entry.v))}`).join("\n") : t("*Ninguém ainda.*") },
            {
                name: t("Destaques"),
                value: [
                    busiest ? t("📈 Dia mais animado: {day} ({n} mensagens)", { day: busiest.day.split("-").reverse().join("/"), n: formatNumber(Number(busiest.m)) }) : null,
                    channels.rows.length ? t("📍 Canais mais ativos: {list}", { list: channels.rows.map((entry) => `<#${entry.key}>`).join(", ") }) : null,
                    emojis.rows.length ? t("😄 Emojis do momento: {list}", { list: emojis.rows.map((entry) => String(entry.key)).join(" ") }) : null,
                ].filter(Boolean).join("\n") || t("*Os destaques aparecem à medida que o servidor fala.*"),
            },
        ],
        footerText: t("Vê o teu com /wrapped"),
        rows: [row(new ButtonBuilder().setCustomId(buildCustomId("wrapped", "me", period)).setLabel(t("Ver o meu Wrapped")).setEmoji("🎁").setStyle(ButtonStyle.Primary))],
    });
}

// ─── /config → EPA Wrapped ───────────────────────────────────────────────────

export const WRAPPED_CFG_NS = "wrappedcfg";
export async function buildWrappedContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getWrappedSettings(guildId);
    const cid = (action: string) => buildCustomId(WRAPPED_CFG_NS, action);
    return buildContainer({
        color: s.enabled ? COLORS.primary : COLORS.neutral,
        title: `🎁 ${t("EPA Wrapped")}`,
        description: t("`/wrapped` mostra a retrospetiva de cada um em imagem: mensagens, voz, XP, dias seguidos, canal/hora/emoji favoritos, com quem mais fala e o parceiro de voz, e uma persona. No dia 1 de cada mês sai a retrospetiva do servidor."),
        fields: [
            { name: t("Estado"), value: onOff(s.enabled) },
            { name: t("Retrospetiva mensal do servidor"), value: `${onOff(s.monthly_post)} · ${t("canal: {channel}", { channel: s.channel ? showChannel(s.channel) : t("canal de sistema") })}` },
        ],
        rows: [
            row(toggleButton(cid("toggle"), s.enabled), optionButton(cid("monthly"), s.monthly_post, { enable: t("Publicar todos os meses"), disable: t("Não publicar") })),
            channelSelect(cid("channel"), t("Canal da retrospetiva mensal"), s.channel, [ChannelType.GuildText, ChannelType.GuildAnnouncement]),
            backToHubRow(),
        ],
    });
}

// ─── Tarefa mensal ───────────────────────────────────────────────────────────

async function tick(client: Client<true>): Promise<void> {
    const now = Date.now();
    const { day, hour } = lisbonParts(now);
    if (day !== 1 || hour < 10) return;
    const previousMonth = monthOf(now - 2 * 86_400_000);
    for (const guild of ourGuilds(client)) {
        const settings = await getWrappedSettings(guild.id);
        if (!settings.enabled || !settings.monthly_post) continue;
        if (!(await startDaily(guild.id, "_", "wrapped-monthly", previousMonth))) continue;
        const channel = (settings.channel ? guild.channels.cache.get(settings.channel) : null) ?? guild.systemChannel;
        if (!channel?.isTextBased()) continue;
        await (channel as TextChannel).send({ components: [await buildServerWrapped(guild, "mes-passado")], flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch((error) => logger.warn("Wrapped: falha a publicar:", error));
    }
    // Arrumação: contagens com mais de 14 meses saem.
    const cutoff = monthOf(now - 425 * 86_400_000);
    await query("DELETE FROM wrapped_counts WHERE month < $1", [cutoff]).catch(() => null);
    await query("DELETE FROM voice_pairs WHERE month < $1", [cutoff]).catch(() => null);
}

let timer: NodeJS.Timeout | null = null;

export function startWrappedJobs(client: Client<true>): void {
    if (timer) return;
    const run = () => void tick(client).catch((error) => logger.warn("Wrapped: falha na tarefa:", error));
    setTimeout(run, 120_000).unref?.();
    timer = setInterval(run, 30 * 60_000);
    timer.unref?.();
}
