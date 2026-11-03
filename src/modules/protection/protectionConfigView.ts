import { ButtonBuilder, ButtonStyle, ChannelType, LabelBuilder, ModalBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t, tk } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, roleSelect, showRoles, textField } from "../config/panelKit.js";
import { FILTER_ACTIONS, getProtectionSettings, MAX_WORDS, RAID_ACTIONS, type FilterAction, type ProtectionSettings, type RaidAction } from "./protectionSettings.js";

export const PROTECTION_NS = "protcfg";
const cid = (...parts: string[]) => buildCustomId(PROTECTION_NS, ...parts);

const FILTER_ACTION_LABELS: Record<FilterAction, string> = { delete: tk("Só apagar"), warn: tk("Apagar e dar aviso"), timeout: tk("Apagar e castigar") };
const RAID_ACTION_LABELS: Record<RaidAction, string> = { alert: tk("Só alertar"), pause: tk("Pausar os convites"), kick: tk("Expulsar quem entrou") };

function small(on: boolean, id: string, label: string): ButtonBuilder {
    return new ButtonBuilder().setCustomId(cid(id)).setLabel(on ? t("Desligar {name}", { name: label }) : t("Ligar {name}", { name: label })).setStyle(on ? ButtonStyle.Danger : ButtonStyle.Success);
}

export async function buildProtectionContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getProtectionSettings(guildId);
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.shield} ${t("Proteção")}`,
        description: t("Filtros automáticos de mensagens, anti-raid e slowmode quando o chat dispara. Os registos vão para o canal da Moderação. Quem pode gerir mensagens nunca é filtrado."),
        fields: [
            {
                name: t("Filtros"),
                value: [
                    t("Palavras proibidas: {state} ({count} palavras)", { state: onOff(s.word_filter_enabled), count: s.words.length }),
                    t("Links de conteúdo adulto (fora dos canais NSFW): {state}", { state: onOff(s.adult_filter_enabled) }),
                    t("Ação: {action}", { action: s.filter_action === "timeout" ? `${t(FILTER_ACTION_LABELS.timeout)} (${s.filter_timeout_minutes} min)` : t(FILTER_ACTION_LABELS[s.filter_action]) }),
                    t("Isentos: {roles} · {channels}", { roles: showRoles(s.exempt_roles), channels: s.exempt_channels.length ? s.exempt_channels.map((id) => `<#${id}>`).join(", ") : t("*nenhum canal*") }),
                ].join("\n"),
            },
            { name: t("Anti-raid"), value: `${onOff(s.raid_enabled)} — ${t("{joins} entradas em {seconds} s → {action}", { joins: s.raid_joins, seconds: s.raid_seconds, action: s.raid_action === "pause" ? `${t(RAID_ACTION_LABELS.pause)} (${s.raid_pause_minutes} min)` : t(RAID_ACTION_LABELS[s.raid_action]) })}` },
            { name: t("Slowmode automático"), value: `${onOff(s.slowmode_enabled)} — ${t("{messages} mensagens em {window} s → {seconds} s durante {minutes} min", { messages: s.slowmode_messages, window: s.slowmode_window_seconds, seconds: s.slowmode_seconds, minutes: s.slowmode_duration_minutes })}${s.slowmode_channels.length ? `\n${s.slowmode_channels.map((id) => `<#${id}>`).join(", ")}` : `\n${t("Em todos os canais de texto")}`}` },
        ],
        rows: [
            row(
                small(s.word_filter_enabled, "words", t("palavras")),
                small(s.adult_filter_enabled, "adult", t("filtro adulto")),
                new ButtonBuilder().setCustomId(cid("wordsedit")).setLabel(t("Palavras e ação")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
            ),
            row(
                small(s.raid_enabled, "raid", t("anti-raid")),
                new ButtonBuilder().setCustomId(cid("raidedit")).setLabel(t("Regras do anti-raid")).setEmoji(emoji.settings).setStyle(ButtonStyle.Secondary),
                small(s.slowmode_enabled, "slow", t("slowmode")),
                new ButtonBuilder().setCustomId(cid("slowedit")).setLabel(t("Regras do slowmode")).setEmoji(emoji.settings).setStyle(ButtonStyle.Secondary),
            ),
            channelSelect(cid("exemptch"), t("Canais isentos dos filtros"), s.exempt_channels, [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice], 25),
            roleSelect(cid("exemptrole"), t("Cargos isentos dos filtros"), s.exempt_roles, 25),
            channelSelect(cid("slowch"), t("Canais do slowmode automático (vazio = todos)"), s.slowmode_channels, [ChannelType.GuildText], 25),
            backToHubRow(),
        ],
    });
}

function select(id: string, label: string, options: Array<{ label: string; value: string }>, current: string): LabelBuilder {
    return new LabelBuilder().setLabel(label).setStringSelectMenuComponent(new StringSelectMenuBuilder()
        .setCustomId(id).setMinValues(1).setMaxValues(1)
        .addOptions(options.map((option) => ({ ...option, default: option.value === current }))));
}

export function buildWordsModal(s: ProtectionSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("wordsedit")).setTitle(t("Filtro de palavras")).addLabelComponents(
        textField("words", t("Palavras proibidas (uma por linha)"), s.words.join("\n"), {
            paragraph: true,
            max: 4000,
            description: t("Até {max}. Acentos e maiúsculas não contam; acaba com * para apanhar o que começa pela palavra.", { max: MAX_WORDS }),
        }),
        select("action", t("O que fazer"), FILTER_ACTIONS.map((value) => ({ label: t(FILTER_ACTION_LABELS[value]), value })), s.filter_action),
        textField("minutes", t("Minutos de castigo (se for castigar)"), String(s.filter_timeout_minutes), { required: true, max: 5 }),
    );
}

export function buildRaidModal(s: ProtectionSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("raidedit")).setTitle(t("Anti-raid")).addLabelComponents(
        textField("joins", t("Entradas que contam como raid"), String(s.raid_joins), { required: true, max: 3 }),
        textField("seconds", t("Em quantos segundos"), String(s.raid_seconds), { required: true, max: 4 }),
        select("action", t("O que fazer"), RAID_ACTIONS.map((value) => ({ label: t(RAID_ACTION_LABELS[value]), value })), s.raid_action),
        textField("pause", t("Minutos de pausa dos convites (máx. 1440)"), String(s.raid_pause_minutes), { required: true, max: 4 }),
    );
}

export function buildSlowmodeModal(s: ProtectionSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("slowedit")).setTitle(t("Slowmode automático")).addLabelComponents(
        textField("messages", t("Mensagens que disparam o slowmode"), String(s.slowmode_messages), { required: true, max: 3 }),
        textField("window", t("Em quantos segundos"), String(s.slowmode_window_seconds), { required: true, max: 3 }),
        textField("seconds", t("Segundos de slowmode a aplicar"), String(s.slowmode_seconds), { required: true, max: 5 }),
        textField("minutes", t("Durante quantos minutos"), String(s.slowmode_duration_minutes), { required: true, max: 4 }),
    );
}
