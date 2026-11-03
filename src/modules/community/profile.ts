import type { GuildMember } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { e } from "../../lib/emojis.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { humanizeDuration, timestamp } from "../../lib/time.js";
import { query } from "#database";
import { statsOf } from "../../repositories/gameStatsRepository.js";
import { getMemberLevel } from "../../repositories/levelRepository.js";
import { rankingOf } from "../../repositories/rankingRepository.js";
import { getReputation } from "../../repositories/reputationRepository.js";
import { getAccount } from "../../repositories/economyRepository.js";
import { levelProgress, progressBar } from "../levels/levelMath.js";
import { GAMES, isGameKey } from "../games/gameCore.js";
import { parseColorString } from "../../lib/branding.js";
import { friendshipsOf, getProfile, marriageOf } from "../../repositories/socialRepository.js";
import { memberStats, unlocked } from "./achievements.js";
import { ringOf } from "./rings.js";

async function voiceSeconds(guildId: string, userId: string): Promise<number> {
    const result = await query<{ voice_seconds: string }>("SELECT voice_seconds FROM member_levels WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    return Number(result.rows[0]?.voice_seconds ?? 0);
}

/** Cartão de perfil: nível, moedas, reputação, voz e jogos — tudo num sítio. */
export async function buildProfile(member: GuildMember): Promise<ContainerPlusBuilder> {
    const guildId = member.guild.id;
    const [level, account, rep, games, voice, xpRank, coinRank, profile, marriage, friends, stats] = await Promise.all([
        getMemberLevel(guildId, member.id),
        getAccount(guildId, member.id),
        getReputation(guildId, member.id),
        statsOf(guildId, member.id),
        voiceSeconds(guildId, member.id),
        rankingOf(guildId, "xp", member.id),
        rankingOf(guildId, "coins", member.id),
        getProfile(guildId, member.id),
        marriageOf(guildId, member.id),
        friendshipsOf(guildId, member.id),
        memberStats(guildId, member.id),
    ]);
    const badges = unlocked(stats);
    const friendCount = friends.filter((entry) => entry.status === "accepted").length;
    const ring = marriage ? ringOf(marriage.ring_tier) : null;
    const progress = levelProgress(level?.xp ?? 0);
    const played = games.reduce((sum, stat) => sum + stat.played, 0);
    const wins = games.reduce((sum, stat) => sum + stat.wins, 0);
    const favourite = games[0] && isGameKey(games[0].game) ? `${GAMES[games[0].game].icon} ${t(GAMES[games[0].game].label)}` : null;
    const roles = member.roles.cache
        .filter((role) => role.id !== member.guild.id)
        .sort((a, b) => b.position - a.position)
        .first(5)
        .map((role) => `<@&${role.id}>`);

    return buildContainer({
        color: parseColorString(profile.color) ?? (member.displayColor || COLORS.primary),
        title: `${e("user")} ${member.displayName}`,
        thumbnailUrl: member.displayAvatarURL({ size: 256 }),
        description: [
            profile.bio ? `> ${profile.bio.split("\n").join("\n> ")}\n` : null,
            `**${t("Nível {level}", { level: progress.level })}**${xpRank ? ` · #${xpRank.position}` : ""}`,
            `${progressBar(progress.ratio)} ${Math.floor(progress.ratio * 100)}%`,
            `-# ${t("{xp} XP no total", { xp: formatNumber(level?.xp ?? 0) })}`,
            badges.length ? `${badges.map((badge) => badge.icon).join(" ")}\n-# ${t("{n} conquistas · /conquistas", { n: badges.length })}` : null,
        ].filter((line) => line !== null).join("\n"),
        fields: [
            {
                name: t("Pessoal"),
                value: [
                    marriage && ring ? `💍 ${t("Casado(a) com {user} · anel {ring}", { user: `<@${marriage.partner}>`, ring: `${ring.icon} ${t(ring.name)}` })}` : null,
                    `🤝 ${t("{count, plural, one {# amigo} other {# amigos}}", { count: friendCount })}`,
                    profile.favorite_game ? `🎮 ${t("Jogo favorito: {game}", { game: profile.favorite_game })}` : null,
                    profile.birthday ? `🎂 ${t("Aniversário: {date}", { date: profile.birthday })}` : null,
                ].filter(Boolean).join("\n"),
            },
            {
                name: t("Comunidade"),
                value: [
                    `${e("coin")} ${t("{coins} moedas", { coins: formatNumber(account?.balance ?? 0) })}${coinRank ? ` · #${coinRank.position}` : ""}`,
                    `${e("heart")} ${t("{count, plural, one {# ponto de reputação} other {# pontos de reputação}}", { count: rep.points })}`,
                    `${e("message")} ${t("{count, plural, one {# mensagem} other {# mensagens}}", { count: level?.messages ?? 0 })} · ${e("voice")} ${humanizeDuration(voice * 1000)} ${t("em voz")}`,
                    `${e("flame")} ${t("Diário: {streak} dias seguidos", { streak: account?.daily_streak ?? 0 })}`,
                ].join("\n"),
            },
            {
                name: t("Jogos"),
                value: played
                    ? [t("{played} jogos · {wins} vitórias ({rate}%)", { played: formatNumber(played), wins: formatNumber(wins), rate: Math.round((wins / played) * 100) }), favourite ? t("Mais jogado: {game}", { game: favourite }) : null].filter(Boolean).join("\n")
                    : t("*Ainda não jogou.*"),
            },
            {
                name: t("Conta"),
                value: [
                    t("No servidor desde {at}", { at: timestamp(member.joinedTimestamp, "D") }),
                    t("Conta criada {at}", { at: timestamp(member.user.createdTimestamp, "R") }),
                    roles.length ? roles.join(" ") : null,
                ].filter(Boolean).join("\n"),
            },
        ],
    });
}
