import { ButtonBuilder, ButtonStyle, ChannelType, LabelBuilder, ModalBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row, type Row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { intlLocale, t, tk } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRoles, textField, toggleButton } from "../config/panelKit.js";
import { getLevelsSettings, MAX_MULTIPLIERS, MAX_REWARDS, type AnnounceMode, type LevelsSettings } from "./levelSettings.js";

export const LEVELS_NS = "lvlcfg";
const cid = (...parts: string[]) => buildCustomId(LEVELS_NS, ...parts);

const MODE_LABELS: Record<AnnounceMode, string> = {
    same: tk("No canal onde escreveu"),
    channel: tk("Num canal fixo"),
    dm: tk("Por mensagem privada"),
    off: tk("Não anunciar"),
};

function multiplierText(value: number): string {
    return `×${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(value)}`;
}

export async function buildLevelsContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getLevelsSettings(guildId);
    const removable = [
        ...s.rewards.map((r) => ({ label: t("Recompensa do nível {level}", { level: r.level }), value: `r:${r.role_id}`, description: t("Tirar esta recompensa") })),
        ...s.multipliers.map((m) => ({ label: t("Multiplicador {value}", { value: multiplierText(m.multiplier) }), value: `m:${m.role_id}`, description: t("Tirar este multiplicador") })),
    ].slice(0, 25);

    const rows: Row[] = [
        row(
            toggleButton(cid("toggle"), s.enabled),
            new ButtonBuilder().setCustomId(cid("xp")).setLabel(t("XP e mensagem")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
            optionButton(cid("stack"), s.stack_rewards, { enable: t("Acumular recompensas"), disable: t("Só a recompensa mais alta") }),
        ),
        row(new StringSelectMenuBuilder()
            .setCustomId(cid("mode"))
            .setPlaceholder(t("Onde anunciar a subida de nível"))
            .addOptions((Object.keys(MODE_LABELS) as AnnounceMode[]).map((mode) => ({ label: t(MODE_LABELS[mode]), value: mode, default: s.announce_mode === mode })))),
    ];
    if (s.announce_mode === "channel") rows.push(channelSelect(cid("channel"), t("Canal dos anúncios de nível"), s.announce_channel));
    rows.push(row(
        new ButtonBuilder().setCustomId(cid("reward")).setLabel(t("Adicionar recompensa")).setEmoji(emoji.gift).setStyle(ButtonStyle.Success).setDisabled(s.rewards.length >= MAX_REWARDS),
        new ButtonBuilder().setCustomId(cid("mult")).setLabel(t("Adicionar multiplicador")).setEmoji(emoji.plus).setStyle(ButtonStyle.Secondary).setDisabled(s.multipliers.length >= MAX_MULTIPLIERS),
    ));
    if (removable.length) {
        rows.push(row(new StringSelectMenuBuilder().setCustomId(cid("remove")).setPlaceholder(t("Tirar uma recompensa ou multiplicador…")).addOptions(removable)));
    }
    rows.push(
        channelSelect(cid("ignchan"), t("Canais que não dão XP"), s.ignored_channels, [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice], 25),
        roleSelect(cid("ignrole"), t("Cargos que não ganham XP"), s.ignored_roles, 25),
        backToHubRow(),
    );

    return buildContainer({
        color: s.enabled ? COLORS.success : COLORS.neutral,
        title: `${emoji.trophy} ${t("Níveis e XP")}`,
        description: t("Cada mensagem e cada minuto em voz com outros membros dão XP. Ao subir de nível, o bot anuncia e dá os cargos de recompensa. Os membros veem o progresso com /nivel, /perfil e /ranking."),
        fields: [
            { name: t("Estado"), value: onOff(s.enabled) },
            { name: t("XP por mensagem"), value: t("{min}–{max} XP, no máximo uma vez a cada {seconds} s", { min: s.xp_min, max: s.xp_max, seconds: s.cooldown_seconds }) },
            { name: t("XP em voz"), value: s.voice_xp_per_minute > 0 ? t("{xp} XP por minuto com mais alguém no canal", { xp: s.voice_xp_per_minute }) : t("Desligado (o tempo em voz conta na mesma para o ranking)") },
            { name: t("Anúncio"), value: `${t(MODE_LABELS[s.announce_mode])}${s.announce_mode === "channel" ? ` — ${showChannel(s.announce_channel)}` : ""}` },
            {
                name: t("Recompensas ({mode})", { mode: s.stack_rewards ? t("acumulam") : t("só a mais alta") }),
                value: s.rewards.length ? s.rewards.map((r) => t("Nível {level} → {role}", { level: r.level, role: `<@&${r.role_id}>` })).join("\n") : t("*Nenhuma*"),
            },
            { name: t("Multiplicadores"), value: s.multipliers.length ? s.multipliers.map((m) => `<@&${m.role_id}> ${multiplierText(m.multiplier)}`).join("\n") : t("*Nenhum*") },
            {
                name: t("Fora do XP"),
                value: [
                    t("Canais: {list}", { list: s.ignored_channels.length ? s.ignored_channels.map((id) => `<#${id}>`).join(", ") : t("*nenhum*") }),
                    t("Cargos: {list}", { list: showRoles(s.ignored_roles) }),
                ].join("\n"),
            },
        ],
        rows,
    });
}

export function buildLevelsXpModal(s: LevelsSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("xp")).setTitle(t("XP e mensagem")).addLabelComponents(
        textField("min", t("XP mínimo por mensagem"), String(s.xp_min), { required: true, max: 3 }),
        textField("max", t("XP máximo por mensagem"), String(s.xp_max), { required: true, max: 3 }),
        textField("cooldown", t("Segundos entre mensagens que contam"), String(s.cooldown_seconds), { required: true, max: 4 }),
        textField("voice", t("XP por minuto em voz (0 = desligado)"), String(s.voice_xp_per_minute), { required: true, max: 3 }),
        textField("message", t("Mensagem de subida de nível"), s.announce_message ?? "", {
            paragraph: true,
            max: 500,
            placeholder: t("🎉 {user} subiu para o **nível {level}**!"),
            description: t("{user} menciona, {name} é o nome, {level} o nível. Vazio = mensagem por omissão."),
        }),
    );
}

function roleField(label: string): LabelBuilder {
    return new LabelBuilder().setLabel(label).setRoleSelectMenuComponent(new RoleSelectMenuBuilder().setCustomId("role").setMinValues(1).setMaxValues(1));
}

export function buildRewardModal(): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("reward")).setTitle(t("Adicionar recompensa")).addLabelComponents(
        textField("level", t("Nível"), "", { required: true, max: 3, placeholder: "10" }),
        roleField(t("Cargo a dar nesse nível")),
    );
}

export function buildMultiplierModal(): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("mult")).setTitle(t("Adicionar multiplicador")).addLabelComponents(
        roleField(t("Cargo com XP extra")),
        textField("value", t("Multiplicador"), "", { required: true, max: 4, placeholder: "1.5", description: t("Entre 1.1 e 5 (1.5 = mais 50% de XP).") }),
    );
}
