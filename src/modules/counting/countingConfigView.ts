import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, textField, toggleButton } from "../config/panelKit.js";
import { getCountingSettings, type CountingSettings } from "./countingSettings.js";

// /config → Contagem.

export const COUNTING_NS = "countcfg";
const cid = (...parts: string[]) => buildCustomId(COUNTING_NS, ...parts);

export async function buildCountingContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getCountingSettings(guildId);
    return buildContainer({
        color: s.enabled ? COLORS.primary : COLORS.neutral,
        title: `🔢 ${t("Canal de contagem")}`,
        description: t("Os membros contam à vez (1, 2, 3…). O bot confirma cada número, guarda o recorde, celebra os marcos e castiga com humor quem estraga. `/contagem` mostra o estado e vende vidas."),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)} · ${t("Canal: {channel}", { channel: showChannel(s.channel) })}` },
            {
                name: t("Regras"),
                value: [
                    t("Contas (6*7): {state}", { state: onOff(s.math) }),
                    t("Ninguém conta duas seguidas: {state}", { state: onOff(s.no_double) }),
                    t("Errar recomeça do 1: {state}", { state: onOff(s.reset_on_fail) }),
                    t("Apagar conversa no canal: {state}", { state: onOff(s.delete_chat) }),
                ].join("\n"),
            },
            {
                name: t("Prémios e vidas"),
                value: [
                    s.reward_every && s.reward_coins ? t("**{coins}** moedas para quem acertar de {n} em {n}", { coins: formatNumber(s.reward_coins), n: s.reward_every }) : t("Sem prémios"),
                    s.milestone_every ? t("Festa a cada **{n}**", { n: formatNumber(s.milestone_every) }) : t("Sem marcos"),
                    s.max_saves ? t("Vidas: até **{max}**, a **{price}** moedas cada", { max: s.max_saves, price: formatNumber(s.save_price) }) : t("Vidas desligadas"),
                    t("Cargo da vergonha: {role}{hours}", { role: showRole(s.shame_role), hours: s.shame_role ? ` · ${s.shame_hours} h` : "" }),
                ].join("\n"),
            },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("rewards")).setLabel(t("Prémios e marcos")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("lives")).setLabel(t("Vidas e vergonha")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
            ),
            row(
                optionButton(cid("math"), s.math, { enable: t("Aceitar contas"), disable: t("Só números") }),
                optionButton(cid("double"), s.no_double, { enable: t("Proibir duas seguidas"), disable: t("Permitir duas seguidas") }),
                optionButton(cid("reset"), s.reset_on_fail, { enable: t("Errar recomeça"), disable: t("Errar não recomeça") }),
                optionButton(cid("chat"), s.delete_chat, { enable: t("Apagar conversa"), disable: t("Deixar conversa") }),
            ),
            channelSelect(cid("channel"), t("Canal da contagem"), s.channel, [ChannelType.GuildText]),
            roleSelect(cid("shame"), t("Cargo da vergonha (opcional)"), s.shame_role ? [s.shame_role] : []),
            backToHubRow(),
        ],
    });
}

export function buildCountingRewardsModal(s: CountingSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("rewardssave")).setTitle(t("Prémios e marcos")).addLabelComponents(
        textField("every", t("Dar moedas de N em N números"), String(s.reward_every), { required: true, max: 5, description: t("0 = sem prémios.") }),
        textField("coins", t("Moedas por prémio"), String(s.reward_coins), { required: true, max: 6 }),
        textField("milestone", t("Festa a cada N números"), String(s.milestone_every), { required: true, max: 6, description: t("0 = sem festas.") }),
    );
}

export function buildCountingLivesModal(s: CountingSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("livessave")).setTitle(t("Vidas e vergonha")).addLabelComponents(
        textField("price", t("Preço de uma vida (moedas)"), String(s.save_price), { required: true, max: 8 }),
        textField("max", t("Máximo de vidas guardadas"), String(s.max_saves), { required: true, max: 2, description: t("0 = sem vidas. Cada vida salva a contagem de um erro.") }),
        textField("hours", t("Horas com o cargo da vergonha"), String(s.shame_hours), { required: true, max: 3 }),
    );
}
