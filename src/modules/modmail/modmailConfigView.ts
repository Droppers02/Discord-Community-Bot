import { ButtonBuilder, ButtonStyle, ModalBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { backToHubRow, onOff, optionButton, textField, toggleButton } from "../config/panelKit.js";
import { getTicketCategories } from "../tickets/categories.js";
import { getModmailSettings, type ModmailSettings } from "./modmailSettings.js";

export const MODMAIL_NS = "mmcfg";
const cid = (...parts: string[]) => buildCustomId(MODMAIL_NS, ...parts);

export async function buildModmailContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const [s, config] = await Promise.all([getModmailSettings(guildId), ensureGuildConfig(guildId)]);
    const categories = getTicketCategories(config);
    const current = categories.find((c) => c.id === s.category) ?? categories[0] ?? null;
    return buildContainer({
        color: s.enabled ? COLORS.success : COLORS.neutral,
        title: `${emoji.message} ${t("Modmail")}`,
        description: t("Os membros mandam mensagem privada ao bot e a conversa abre como ticket (que eles não veem). A equipa responde no canal e o bot entrega as respostas por mensagem privada. Fecho, transcrições, avaliações e avisos de SLA funcionam como nos tickets."),
        fields: [
            { name: t("Estado"), value: onOff(s.enabled) },
            { name: t("Categoria dos tickets"), value: current ? `**${current.label}**` : t("*Este servidor ainda não tem categorias de ticket.*") },
            { name: t("Respostas"), value: s.anonymous_replies ? t("Anónimas — chegam como «Equipa de {server}».", { server: config.server_name ?? "…" }) : t("Com o nome de quem respondeu.") },
            { name: t("Notas internas"), value: t("Mensagens começadas por `{prefix}` ficam só no canal.", { prefix: s.note_prefix }) },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                optionButton(cid("anon"), s.anonymous_replies, { enable: t("Tornar respostas anónimas"), disable: t("Mostrar quem responde") }),
                new ButtonBuilder().setCustomId(cid("texts")).setLabel(t("Mensagens e prefixo")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
            ),
            ...(categories.length ? [row(new StringSelectMenuBuilder()
                .setCustomId(cid("category"))
                .setPlaceholder(t("Categoria usada nas conversas"))
                .addOptions(categories.slice(0, 25).map((c) => ({ label: c.label.slice(0, 100), value: c.id, default: c.id === current?.id }))))] : []),
            backToHubRow(),
        ],
    });
}

export function buildModmailTextsModal(s: ModmailSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("texts")).setTitle(t("Mensagens e prefixo")).addLabelComponents(
        textField("greeting", t("Resposta quando a conversa abre"), s.greeting ?? "", { paragraph: true, max: 1000, placeholder: t("Vamos responder aqui, nesta conversa."), description: t("Vazio = texto por omissão.") }),
        textField("closing", t("Mensagem quando é fechada"), s.closing ?? "", { paragraph: true, max: 1000, placeholder: t("A conversa foi encerrada."), description: t("Vazio = texto por omissão.") }),
        textField("prefix", t("Prefixo das notas internas"), s.note_prefix, { required: true, max: 5, placeholder: "!" }),
    );
}
