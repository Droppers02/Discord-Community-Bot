import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, textField, toggleButton } from "../config/panelKit.js";
import { getGamesSettings, type GamesSettings } from "./gamesSettings.js";

export const GAMES_NS = "gamecfg";
const cid = (...parts: string[]) => buildCustomId(GAMES_NS, ...parts);

export async function buildGamesContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getGamesSettings(guildId);
    return buildContainer({
        color: s.enabled ? COLORS.success : COLORS.neutral,
        title: `${emoji.jigsaw} ${t("Mini-jogos")}`,
        description: t("Galo, 4 em linha, PPT, forca, quiz, termo, blackjack, minas e apostas rápidas. Os membros veem tudo em `/jogos`."),
        fields: [
            { name: t("Estado"), value: onOff(s.enabled) },
            { name: t("Onde se joga"), value: s.channels.length ? s.channels.map((id) => `<#${id}>`).join(", ") : t("Em qualquer canal") },
            { name: t("Apostas"), value: t("Mínimo **{min}** · máximo **{max}**", { min: formatNumber(s.min_bet), max: formatNumber(s.max_bet) }) },
            {
                name: t("Prémios (sem aposta)"),
                value: [
                    t("Vitória contra alguém: **{value}**", { value: formatNumber(s.win_reward) }),
                    t("Resposta certa no quiz: **{value}**", { value: formatNumber(s.quiz_reward) }),
                    t("Forca / termo livre: **{value}**", { value: formatNumber(s.word_reward) }),
                    t("Termo do dia: **{value}**", { value: formatNumber(s.daily_word_reward) }),
                ].join("\n"),
            },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("values")).setLabel(t("Apostas e prémios")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
            ),
            channelSelect(cid("channels"), t("Canais dos jogos (vazio = todos)"), s.channels, [ChannelType.GuildText, ChannelType.GuildVoice], 25),
            backToHubRow(),
        ],
    });
}

export function buildGamesValuesModal(s: GamesSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("values")).setTitle(t("Apostas e prémios")).addLabelComponents(
        textField("bets", t("Aposta mínima-máxima"), `${s.min_bet}-${s.max_bet}`, { required: true, max: 25, description: t("Ex.: 10-50000") }),
        textField("win", t("Prémio por vitória contra alguém"), String(s.win_reward), { required: true, max: 7 }),
        textField("quiz", t("Prémio por resposta certa no quiz"), String(s.quiz_reward), { required: true, max: 7 }),
        textField("word", t("Prémio da forca e do termo livre"), String(s.word_reward), { required: true, max: 7 }),
        textField("daily", t("Prémio do termo do dia"), String(s.daily_word_reward), { required: true, max: 7 }),
    );
}
