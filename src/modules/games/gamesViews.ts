import { StringSelectMenuBuilder, type Guild, type GuildMember } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { e } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { statsOf, topForGame, type GameStatRow } from "../../repositories/gameStatsRepository.js";
import { GAME_KEYS, GAMES, isGameKey, type GameKey } from "./gameCore.js";

const MEDALS = ["🥇", "🥈", "🥉"];

function gameSelect(selected: GameKey | null) {
    return row(new StringSelectMenuBuilder()
        .setCustomId(buildCustomId("g", "hub", "rank"))
        .setPlaceholder(t("Ver o ranking de um jogo…"))
        .addOptions(GAME_KEYS.map((key) => ({ label: t(GAMES[key].label), value: key, emoji: GAMES[key].icon, description: GAMES[key].command, default: key === selected }))));
}

function statLine(stat: GameStatRow): string {
    const key = isGameKey(stat.game) ? stat.game : null;
    const name = key ? `${GAMES[key].icon} ${t(GAMES[key].label)}` : stat.game;
    const rate = stat.played ? Math.round((stat.wins / stat.played) * 100) : 0;
    const coins = stat.coins_won - stat.coins_lost;
    return `${name} — ${t("{wins}V {losses}D {draws}E", { wins: stat.wins, losses: stat.losses, draws: stat.draws })} · ${rate}% · ${t("melhor sequência {n}", { n: stat.best_streak })}${coins ? ` · ${coins > 0 ? "+" : "−"}${formatNumber(Math.abs(coins))}` : ""}`;
}

export async function buildGamesHub(member: GuildMember): Promise<ContainerPlusBuilder> {
    const stats = await statsOf(member.guild.id, member.id);
    const totals = stats.reduce((acc, stat) => ({ played: acc.played + stat.played, wins: acc.wins + stat.wins }), { played: 0, wins: 0 });
    const catalog = GAME_KEYS.map((key) => `${GAMES[key].icon} **${t(GAMES[key].label)}** · \`${GAMES[key].command}\`\n-# ${t(GAMES[key].description)}`).join("\n");
    return buildContainer({
        color: COLORS.primary,
        title: `${e("gamepad")} ${t("Mini-jogos")}`,
        thumbnailUrl: member.displayAvatarURL({ size: 128 }),
        description: catalog,
        fields: [
            {
                name: t("Estatísticas de {name}", { name: member.displayName }),
                value: stats.length
                    ? [t("{played} jogos · {wins} vitórias", { played: formatNumber(totals.played), wins: formatNumber(totals.wins) }), ...stats.slice(0, 12).map(statLine)].join("\n")
                    : t("*Ainda não jogou nada. Escolhe um jogo acima!*"),
            },
        ],
        footerText: t("V = vitórias · D = derrotas · E = empates · ganhos líquidos em moedas"),
        rows: [gameSelect(null)],
    });
}

export async function buildGameRanking(guild: Guild, game: GameKey): Promise<ContainerPlusBuilder> {
    const rows = await topForGame(guild.id, game, 10);
    const info = GAMES[game];
    const lines = rows.map((stat, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${stat.user_id}> — ${t("{wins} vitórias em {played}", { wins: stat.wins, played: stat.played })}${stat.best_score ? ` · ${t("recorde {score}", { score: formatNumber(stat.best_score) })}` : ""}`);
    return buildContainer({
        color: COLORS.gold,
        title: `${info.icon} ${t("Ranking — {game}", { game: t(info.label) })}`,
        description: lines.length ? lines.join("\n") : t("Ainda ninguém jogou {game}. Sê o primeiro com `{command}`!", { game: t(info.label), command: info.command }),
        rows: [gameSelect(game)],
    });
}
