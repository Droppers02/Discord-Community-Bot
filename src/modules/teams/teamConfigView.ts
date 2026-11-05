import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { queryOne } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, textField, toggleButton } from "../config/panelKit.js";
import { getTeamSettings, type TeamSettings } from "./teamSettings.js";

// /config → Equipas.

export const TEAM_CFG_NS = "teamcfg";
const cid = (...parts: string[]) => buildCustomId(TEAM_CFG_NS, ...parts);

export async function buildTeamsContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getTeamSettings(guildId);
    const stats = await queryOne<{ teams: string; members: string }>("SELECT (SELECT COUNT(*) FROM teams WHERE guild_id = $1) AS teams, (SELECT COUNT(*) FROM team_members WHERE guild_id = $1) AS members", [guildId]).catch(() => null);
    return buildContainer({
        color: s.enabled ? COLORS.primary : COLORS.neutral,
        title: `🛡️ ${t("Equipas")}`,
        description: t("Os membros criam equipas (`/equipa criar`) com nome, tag, cor e cargo próprio. O XP de cada membro soma pontos para a equipa; à segunda, a equipa com mais pontos na semana ganha moedas. Cada equipa tem banco, oficiais e convites."),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)} · ${t("{teams} equipas · {members} membros", { teams: Number(stats?.teams ?? 0), members: Number(stats?.members ?? 0) })}` },
            {
                name: t("Regras"),
                value: [
                    t("Criar custa **{n}** moedas · até **{max}** membros · até **{teams}** equipas", { n: formatNumber(s.create_cost), max: s.max_members, teams: s.max_teams }),
                    t("Cargo com a cor da equipa: {state}{anchor}", { state: onOff(s.create_roles), anchor: s.create_roles && s.role_anchor ? ` · ${t("acima de {role}", { role: showRole(s.role_anchor) })}` : "" }),
                    t("Canais privados: {category}", { category: s.channel_category ? `<#${s.channel_category}>` : t("*desligados*") }),
                    t("Guerra semanal: {state} · prémio **{n}** moedas por membro · anúncio em {channel}", { state: onOff(s.weekly_war), n: formatNumber(s.weekly_reward), channel: s.announce_channel ? showChannel(s.announce_channel) : t("canal de sistema") }),
                ].join("\n"),
            },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("limits")).setLabel(t("Preço e limites")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
                optionButton(cid("roles"), s.create_roles, { enable: t("Criar cargos"), disable: t("Sem cargos") }),
                optionButton(cid("war"), s.weekly_war, { enable: t("Ligar guerra semanal"), disable: t("Desligar guerra semanal") }),
            ),
            roleSelect(cid("anchor"), t("Os cargos das equipas ficam acima de… (opcional)"), s.role_anchor ? [s.role_anchor] : []),
            channelSelect(cid("category"), t("Categoria dos canais das equipas (vazio = sem canais)"), s.channel_category, [ChannelType.GuildCategory]),
            channelSelect(cid("announce"), t("Canal do anúncio da guerra semanal"), s.announce_channel, [ChannelType.GuildText, ChannelType.GuildAnnouncement]),
            backToHubRow(),
        ],
    });
}

export function buildTeamLimitsModal(s: TeamSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("limitssave")).setTitle(t("Equipas")).addLabelComponents(
        textField("cost", t("Preço para criar uma equipa"), String(s.create_cost), { required: true, max: 9 }),
        textField("members", t("Máximo de membros por equipa"), String(s.max_members), { required: true, max: 2 }),
        textField("teams", t("Máximo de equipas no servidor"), String(s.max_teams), { required: true, max: 3 }),
        textField("reward", t("Prémio semanal por membro da vencedora"), String(s.weekly_reward), { required: true, max: 8 }),
    );
}
