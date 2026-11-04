import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, type Client } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, textField, toggleButton } from "../config/panelKit.js";
import { addBotUrl } from "./appealGuild.js";
import { getAppealSettings, type AppealSettings } from "./appealSettings.js";

export const APPEAL_NS = "appcfg";
const cid = (...parts: string[]) => buildCustomId(APPEAL_NS, ...parts);

function appealGuildField(s: AppealSettings, client: Client): string {
    if (!s.appeal_guild) {
        return [
            `${emoji.warn} ${t("**Nenhum.** Sem ele, quem é banido não consegue pedir revisão: o Discord não entrega ao bot os cliques nem os comandos de quem já não partilha nenhum servidor com ele.")}`,
            t("Cria um servidor pequeno (ex.: \"EPA — Apelos\"), adiciona o bot com o botão abaixo e indica aqui o ID desse servidor."),
        ].join("\n");
    }
    const guild = client.guilds.cache.get(s.appeal_guild);
    if (!guild) return `${emoji.warn} ${t("O bot não está no servidor `{id}` — adiciona-o com o botão **Adicionar o bot**.", { id: s.appeal_guild })}`;
    return [
        `**${guild.name}** (\`${guild.id}\`) · ${t("{n} membros", { n: guild.memberCount })}`,
        s.appeal_invite ? t("Convite: {url}", { url: s.appeal_invite }) : t("O convite é criado no próximo ban (ou ao publicar o painel)."),
        t("Quem é banido recebe este convite por DM; ao entrar, o bot manda-lhe o formulário. Ao ser aprovado, sai do servidor de apelos."),
    ].join("\n");
}

export async function buildAppealContainer(guildId: string, client: Client): Promise<ContainerPlusBuilder> {
    const s = await getAppealSettings(guildId);
    const ready = Boolean(s.channel);
    const appealGuildReady = Boolean(s.appeal_guild && client.guilds.cache.has(s.appeal_guild));
    return buildContainer({
        color: s.enabled ? COLORS.success : COLORS.neutral,
        title: `${emoji.receipt} ${t("Revisão de bans")}`,
        description: [
            t("Quem é banido com `/mod banir` recebe por DM o convite para o **servidor de apelos**. Lá, o bot manda-lhe o formulário (também há um painel e o `/apelo`). O pedido chega ao canal da equipa com as respostas, o motivo do ban e o histórico de moderação."),
            t("A equipa discute numa thread, vota 👍/👎, pode fazer perguntas ao membro (que responde por DM) e decide: **aprovar** desbane e envia um convite de uso único; **recusar** avisa o membro e põe-no à espera."),
        ].join("\n"),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)}${s.enabled && !ready ? ` — ${t("falta escolher o canal dos pedidos")}` : ""}${s.enabled && !appealGuildReady ? ` — ${t("falta o servidor de apelos")}` : ""}` },
            { name: t("Servidor de apelos"), value: appealGuildField(s, client) },
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
            row(
                new ButtonBuilder().setCustomId(cid("appealguild")).setLabel(t("Servidor de apelos")).setEmoji(emoji.edit).setStyle(appealGuildReady ? ButtonStyle.Secondary : ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("panel")).setLabel(t("Publicar painel lá")).setEmoji(emoji.receipt).setStyle(ButtonStyle.Secondary).setDisabled(!appealGuildReady),
                new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(addBotUrl(client)).setLabel(t("Adicionar o bot a um servidor")),
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

export function buildAppealGuildModal(s: AppealSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("appealguild")).setTitle(t("Servidor de apelos")).addLabelComponents(
        textField("guild", t("ID do servidor de apelos"), s.appeal_guild ?? "", {
            required: false,
            max: 25,
            description: t("O bot tem de lá estar. Vazio = desligar. Botão direito no servidor → Copiar ID do servidor."),
        }),
    );
}

export function buildAppealQuestionsModal(s: AppealSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("questions")).setTitle(t("Perguntas do pedido")).addLabelComponents(
        textField("q1", t("Pergunta 1 (obrigatória)"), s.questions[0], { required: true, max: 45 }),
        textField("q2", t("Pergunta 2 (obrigatória)"), s.questions[1], { required: true, max: 45 }),
        textField("q3", t("Pergunta 3 (opcional para o membro)"), s.questions[2], { required: true, max: 45 }),
    );
}
