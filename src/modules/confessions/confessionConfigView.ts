import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { queryOne } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, showChannel, textField, toggleButton } from "../config/panelKit.js";
import { getConfessionSettings, type ConfessionSettings } from "./confessionSettings.js";

// /config → Confissões.

export const CONFESS_CFG_NS = "confesscfg";
const cid = (...parts: string[]) => buildCustomId(CONFESS_CFG_NS, ...parts);

export async function buildConfessionsContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getConfessionSettings(guildId);
    const stats = await queryOne<{ total: string; pending: string }>(
        "SELECT COUNT(*) FILTER (WHERE status = 'approved') AS total, COUNT(*) FILTER (WHERE status = 'pending') AS pending FROM confessions WHERE guild_id = $1",
        [guildId],
    ).catch(() => null);
    return buildContainer({
        color: s.enabled ? COLORS.primary : COLORS.neutral,
        title: `💬 ${t("Confissões anónimas")}`,
        description: t("`/confissao` abre um formulário (texto e imagem). Com revisão, a equipa aprova sem saber quem escreveu; sem revisão, publica logo. Respostas anónimas vão num fio. Só a administração pode revelar um autor, e fica registado."),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)}${s.enabled && !s.channel ? ` — ${t("falta o canal")}` : ""}` },
            {
                name: t("Regras"),
                value: [
                    t("Canal: {channel}", { channel: showChannel(s.channel) }),
                    t("Revisão pela equipa: {channel}", { channel: s.review_channel ? `<#${s.review_channel}>` : t("*desligada — publica logo*") }),
                    t("Imagens: {state} · respostas anónimas: {replies}", { state: onOff(s.allow_images), replies: onOff(s.allow_replies) }),
                    t("Filtro de palavras da Proteção: {state}", { state: onOff(s.use_word_filter) }),
                    t("Intervalo por pessoa: **{n} min**", { n: s.cooldown_minutes }),
                    t("Autores bloqueados: **{n}**", { n: s.blocked.length }),
                ].join("\n"),
            },
            { name: t("Números"), value: t("{total} publicadas · {pending} à espera", { total: Number(stats?.total ?? 0), pending: Number(stats?.pending ?? 0) }) },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("cooldown")).setLabel(t("Intervalo")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
                optionButton(cid("images"), s.allow_images, { enable: t("Aceitar imagens"), disable: t("Sem imagens") }),
                optionButton(cid("replies"), s.allow_replies, { enable: t("Aceitar respostas"), disable: t("Sem respostas") }),
                optionButton(cid("filter"), s.use_word_filter, { enable: t("Usar filtro de palavras"), disable: t("Sem filtro") }),
            ),
            channelSelect(cid("channel"), t("Canal onde aparecem as confissões"), s.channel, [ChannelType.GuildText]),
            channelSelect(cid("review"), t("Canal da equipa para aprovar (vazio = sem revisão)"), s.review_channel, [ChannelType.GuildText]),
            backToHubRow(s.blocked.length ? [new ButtonBuilder().setCustomId(cid("unblock")).setLabel(t("Desbloquear todos ({n})", { n: s.blocked.length })).setStyle(ButtonStyle.Danger)] : []),
        ],
    });
}

export function buildConfessionCooldownModal(s: ConfessionSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("cooldownsave")).setTitle(t("Confissões")).addLabelComponents(
        textField("minutes", t("Minutos entre confissões da mesma pessoa"), String(s.cooldown_minutes), { required: true, max: 4, description: t("0 = sem limite.") }),
    );
}
