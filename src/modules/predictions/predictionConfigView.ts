import { ButtonBuilder, ButtonStyle, ModalBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { backToHubRow, onOff, optionButton, roleSelect, showRole, textField, toggleButton } from "../config/panelKit.js";
import { getPredictionSettings, type PredictionSettings } from "./predictionSettings.js";

// /config → Previsões.

export const PRED_CFG_NS = "predcfg";
const cid = (...parts: string[]) => buildCustomId(PRED_CFG_NS, ...parts);

export async function buildPredictionsContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getPredictionSettings(guildId);
    return buildContainer({
        color: s.enabled ? COLORS.primary : COLORS.neutral,
        title: `🔮 ${t("Previsões com moedas")}`,
        description: t("Como as previsões da Twitch: `/previsao criar` lança uma pergunta com opções, os membros apostam EPA Coins e quem acerta divide o bolo (em proporção ao que apostou). Fecha sozinha à hora marcada; se ninguém acertar, toda a gente recebe de volta."),
        fields: [
            { name: t("Estado"), value: onOff(s.enabled) },
            {
                name: t("Regras"),
                value: [
                    t("Quem cria: {who}", { who: s.anyone_can_create ? t("qualquer membro") : t("equipa{role}", { role: s.creator_role ? ` + ${showRole(s.creator_role)}` : "" }) }),
                    t("Aposta: de **{min}** a **{max}** moedas por pessoa", { min: formatNumber(s.min_bet), max: formatNumber(s.max_bet) }),
                    t("Taxa da casa: **{n}%** · até **{open}** previsões abertas", { n: s.house_cut_pct, open: s.max_open }),
                ].join("\n"),
            },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("limits")).setLabel(t("Limites e taxa")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
                optionButton(cid("anyone"), s.anyone_can_create, { enable: t("Todos podem criar"), disable: t("Só a equipa cria") }),
            ),
            roleSelect(cid("role"), t("Cargo que também pode criar (opcional)"), s.creator_role ? [s.creator_role] : []),
            backToHubRow(),
        ],
    });
}

export function buildPredictionLimitsModal(s: PredictionSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("limitssave")).setTitle(t("Previsões")).addLabelComponents(
        textField("min", t("Aposta mínima"), String(s.min_bet), { required: true, max: 8 }),
        textField("max", t("Aposta máxima por pessoa"), String(s.max_bet), { required: true, max: 10 }),
        textField("cut", t("Taxa da casa (%)"), String(s.house_cut_pct), { required: true, max: 2, description: t("0 a 50. A taxa desaparece da economia (ajuda a travar a inflação).") }),
        textField("open", t("Previsões abertas ao mesmo tempo"), String(s.max_open), { required: true, max: 2 }),
    );
}
