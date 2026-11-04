import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, type Client } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, textField, toggleButton } from "../config/panelKit.js";
import { userInstallEnabled } from "./appealAccess.js";
import { getAppealSettings, type AppealSettings } from "./appealSettings.js";

export const APPEAL_NS = "appcfg";
const cid = (...parts: string[]) => buildCustomId(APPEAL_NS, ...parts);

function userInstallField(enabled: boolean): string {
    if (enabled) return `${emoji.success} ${t("Ligada — quem é banido adiciona o bot à conta pelo link da DM e usa o `/apelo` na DM com o bot.")}`;
    return [
        `${emoji.warn} ${t("**Desligada.** Sem ela, quem é banido não consegue falar com o bot: o Discord não lhe entrega os cliques nem os comandos de quem já não está no servidor.")}`,
        t("Liga em **discord.com/developers** → a tua aplicação → **Installation** → **Installation Contexts** → marca **User Install** → guarda."),
    ].join("\n");
}

export async function buildAppealContainer(guildId: string, client: Client): Promise<ContainerPlusBuilder> {
    const [s, userInstall] = await Promise.all([getAppealSettings(guildId), userInstallEnabled(client)]);
    const ready = Boolean(s.channel);
    return buildContainer({
        color: s.enabled ? COLORS.success : COLORS.neutral,
        title: `${emoji.receipt} ${t("Revisão de bans")}`,
        description: [
            t("Quem é banido com `/mod banir` recebe por DM um link para **adicionar o bot à conta** e o botão do pedido; depois usa o `/apelo` na DM com o bot. O pedido chega ao canal da equipa com as respostas, o motivo do ban e o histórico de moderação."),
            t("A equipa discute numa thread, vota 👍/👎, pode fazer perguntas ao membro e decide: **aprovar** desbane e dá um convite de uso único; **recusar** põe-no à espera. O membro vê tudo no `/apelo` (perguntas, decisão e convite), mesmo que as DMs do bot não cheguem."),
        ].join("\n"),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)}${s.enabled && !ready ? ` — ${t("falta escolher o canal dos pedidos")}` : ""}${s.enabled && !userInstall ? ` — ${t("falta ligar a instalação na conta")}` : ""}` },
            { name: t("Instalação na conta (User Install)"), value: userInstallField(userInstall) },
            { name: t("Canais"), value: [t("Pedidos: {channel}", { channel: showChannel(s.channel) }), t("Menção: {role}", { role: showRole(s.ping_role) }), t("Convite de regresso: {channel}", { channel: s.invite_on_accept ? (s.invite_channel ? showChannel(s.invite_channel) : t("canal de sistema")) : t("desligado") })].join("\n") },
            {
                name: t("Regras"),
                value: [
                    t("Esperar depois do ban: {value}", { value: s.min_hours_after_ban ? t("{n} h", { n: s.min_hours_after_ban }) : t("nada") }),
                    t("Espera depois de uma recusa: {value}", { value: s.cooldown_days ? t("{n} dias", { n: s.cooldown_days }) : t("nenhuma") }),
                    t("Pedidos por pessoa: {value}", { value: s.max_appeals || t("sem limite") }),
                    t("Thread de discussão: {state}", { state: onOff(s.discussion_threads) }),
                ].join("\n"),
            },
            { name: t("Perguntas"), value: s.questions.map((question, i) => `${i + 1}. ${question}`).join("\n") },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("rules")).setLabel(t("Regras")).setEmoji(emoji.settings).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("questions")).setLabel(t("Perguntas")).setEmoji(emoji.edit).setStyle(ButtonStyle.Secondary),
                optionButton(cid("invite"), s.invite_on_accept, { enable: t("Enviar convite ao aprovar"), disable: t("Sem convite ao aprovar") }),
                optionButton(cid("threads"), s.discussion_threads, { enable: t("Abrir threads"), disable: t("Sem threads") }),
            ),
            channelSelect(cid("channel"), t("Canal onde a equipa recebe os pedidos"), s.channel),
            roleSelect(cid("ping"), t("Cargo a mencionar em cada pedido (opcional)"), s.ping_role ? [s.ping_role] : []),
            channelSelect(cid("invitech"), t("Canal do convite de regresso (opcional)"), s.invite_channel, [ChannelType.GuildText]),
            backToHubRow(),
        ],
    });
}

export function buildAppealRulesModal(s: AppealSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("rules")).setTitle(t("Regras dos pedidos")).addLabelComponents(
        textField("hours", t("Horas depois do ban antes de poder pedir"), String(s.min_hours_after_ban), { required: true, max: 3, description: t("0 = pode pedir logo.") }),
        textField("cooldown", t("Dias de espera depois de uma recusa"), String(s.cooldown_days), { required: true, max: 3 }),
        textField("max", t("Máximo de pedidos por pessoa (0 = sem limite)"), String(s.max_appeals), { required: true, max: 2 }),
    );
}

export function buildAppealQuestionsModal(s: AppealSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("questions")).setTitle(t("Perguntas do pedido")).addLabelComponents(
        textField("q1", t("Pergunta 1 (obrigatória)"), s.questions[0], { required: true, max: 45 }),
        textField("q2", t("Pergunta 2 (obrigatória)"), s.questions[1], { required: true, max: 45 }),
        textField("q3", t("Pergunta 3 (opcional para o membro)"), s.questions[2], { required: true, max: 45 }),
    );
}
