import { ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type Guild } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { e, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t, tk } from "../../lib/i18n.js";
import { humanizeDuration } from "../../lib/time.js";
import { RANKING_TYPES, rankingCount, rankingOf, rankingPage, type RankingType } from "../../repositories/rankingRepository.js";
import { levelFromXp } from "../levels/levelMath.js";

export const RANKING_PAGE_SIZE = 10;
const MEDALS = ["🥇", "🥈", "🥉"];

export const RANKING_LABELS: Record<RankingType, { label: string; icon: string; empty: string }> = {
    xp: { label: tk("Níveis (XP)"), icon: "trophy", empty: tk("Ainda ninguém ganhou XP — escreve no servidor para entrares.") },
    coins: { label: tk("Mais ricos"), icon: "moneybag", empty: tk("Ainda ninguém tem moedas — usa `/diario` para começar.") },
    games: { label: tk("Vitórias nos jogos"), icon: "gamepad", empty: tk("Ainda ninguém ganhou um jogo — experimenta `/jogos`.") },
    rep: { label: tk("Reputação"), icon: "heart", empty: tk("Ainda ninguém recebeu reputação — usa `/rep`.") },
    voice: { label: tk("Tempo em voz"), icon: "voice", empty: tk("Ainda ninguém passou tempo em voz com outros membros.") },
    messages: { label: tk("Mensagens"), icon: "message", empty: tk("Ainda não há mensagens contadas.") },
};

export function isRankingType(value: string): value is RankingType {
    return (RANKING_TYPES as readonly string[]).includes(value);
}

function formatValue(type: RankingType, value: number): string {
    switch (type) {
        case "xp": return t("Nível {level} · {xp} XP", { level: levelFromXp(value), xp: formatNumber(value) });
        case "coins": return `${e("coin")} ${formatNumber(value)}`;
        case "games": return t("{count, plural, one {# vitória} other {# vitórias}}", { count: value });
        case "rep": return t("{count, plural, one {# ponto} other {# pontos}}", { count: value });
        case "voice": return humanizeDuration(value * 1000);
        case "messages": return t("{count, plural, one {# mensagem} other {# mensagens}}", { count: value });
    }
}

export async function buildRanking(guild: Guild, type: RankingType, page: number, viewerId: string): Promise<ContainerPlusBuilder> {
    const total = await rankingCount(guild.id, type);
    const pages = Math.max(1, Math.ceil(total / RANKING_PAGE_SIZE));
    const current = Math.min(Math.max(0, page), pages - 1);
    const rows = await rankingPage(guild.id, type, RANKING_PAGE_SIZE, current * RANKING_PAGE_SIZE);
    const meta = RANKING_LABELS[type];
    const lines = rows.map((entry, i) => {
        const position = current * RANKING_PAGE_SIZE + i + 1;
        return `${MEDALS[position - 1] ?? `**${position}.**`} <@${entry.user_id}> — ${formatValue(type, entry.value)}`;
    });
    const own = await rankingOf(guild.id, type, viewerId);
    const ownLine = own ? t("A tua posição: #{position} ({value})", { position: own.position, value: formatValue(type, own.value) }) : t("Ainda não estás neste ranking.");

    const typeSelect = new StringSelectMenuBuilder()
        .setCustomId(buildCustomId("rank", "type"))
        .setPlaceholder(t("Escolher ranking…"))
        .addOptions(RANKING_TYPES.map((key) => ({ label: t(RANKING_LABELS[key].label), value: key, emoji: ei(RANKING_LABELS[key].icon), default: key === type })));

    return buildContainer({
        color: COLORS.primary,
        title: `${e(meta.icon)} ${t("Ranking — {type}", { type: t(meta.label) })}`,
        description: lines.length ? lines.join("\n") : t(meta.empty),
        footerText: `${t("Página {page} de {pages}", { page: current + 1, pages })} · ${ownLine}`,
        rows: [
            row(typeSelect),
            ...(pages > 1 ? [row(
                new ButtonBuilder().setCustomId(buildCustomId("rank", "page", type, current - 1)).setEmoji(ei("arrowLeft")).setStyle(ButtonStyle.Secondary).setDisabled(current <= 0),
                new ButtonBuilder().setCustomId(buildCustomId("rank", "page", type, current + 1)).setEmoji(ei("arrowRight")).setStyle(ButtonStyle.Secondary).setDisabled(current >= pages - 1),
            )] : []),
        ],
    });
}
