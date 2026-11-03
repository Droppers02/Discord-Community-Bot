import { ButtonBuilder, ButtonStyle, ModalBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { humanizeDuration } from "../../lib/time.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import type { GuildConfig, TicketPriority } from "../../types.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, textField, toggleButton } from "../config/panelKit.js";
import { PRIORITY_ORDER, priorityLabel } from "../tickets/priorities.js";
import { firstResponseTarget } from "./slaService.js";
import { getSlaSettings, type SlaSettings } from "./slaSettings.js";

export const SLA_NS = "slacfg";
const cid = (...parts: string[]) => buildCustomId(SLA_NS, ...parts);

export async function buildSlaContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const [settings, config] = await Promise.all([getSlaSettings(guildId), ensureGuildConfig(guildId)]);
    const targets = PRIORITY_ORDER
        .map((p) => `${priorityLabel(p)}: **${humanizeDuration(firstResponseTarget(p, settings, config) * 60_000)}**${settings.priority_minutes[p] === null ? ` ${t("(meta base)")}` : ""}`)
        .join("\n");
    return buildContainer({
        color: settings.enabled ? COLORS.warning : COLORS.neutral,
        title: `${emoji.hourglass} ${t("Avisos de SLA")}`,
        description: t("Quando um ticket passa a meta de primeira resposta sem ninguém da equipa o assumir, o bot avisa. Se continuar sem resposta, pode escalar para outro cargo."),
        fields: [
            { name: t("Estado"), value: onOff(settings.enabled) },
            { name: t("Metas de primeira resposta"), value: targets },
            {
                name: t("Onde avisa"),
                value: [
                    t("Canal da equipa: {channel}", { channel: showChannel(settings.alert_channel) }),
                    t("Dentro do ticket: {state}", { state: onOff(settings.alert_in_ticket || !settings.alert_channel) }),
                    t("Menciona: {role}", { role: showRole(settings.mention_role ?? config.staff_role) }),
                ].join("\n"),
            },
            {
                name: t("Escalamento"),
                value: settings.escalate_after_minutes > 0
                    ? t("Mais {time} sem resposta → avisa {role}", { time: humanizeDuration(settings.escalate_after_minutes * 60_000), role: showRole(settings.escalate_role ?? config.admin_role) })
                    : t("*Desligado*"),
            },
            {
                name: t("Outras regras"),
                value: [
                    t("Aviso de resolução ({hours} h): {state}", { hours: config.sla_resolution_hours ?? 24, state: onOff(settings.resolution_alert) }),
                    t("Só dentro do horário de atendimento: {state}", { state: onOff(settings.office_hours_only) }),
                ].join("\n"),
            },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), settings.enabled),
                new ButtonBuilder().setCustomId(cid("targets")).setLabel(t("Metas e escalamento")).setEmoji(emoji.clock).setStyle(ButtonStyle.Primary),
            ),
            row(
                optionButton(cid("inticket"), settings.alert_in_ticket, { enable: t("Avisar também no ticket"), disable: t("Não avisar no ticket") }),
                optionButton(cid("resolution"), settings.resolution_alert, { enable: t("Ligar aviso de resolução"), disable: t("Desligar aviso de resolução") }),
                optionButton(cid("hours"), settings.office_hours_only, { enable: t("Só dentro do horário"), disable: t("Avisar a qualquer hora") }),
            ),
            channelSelect(cid("channel"), t("Canal da equipa para os avisos (opcional)"), settings.alert_channel),
            roleSelect(cid("mention"), t("Cargo a mencionar (vazio = cargo da equipa)"), settings.mention_role ? [settings.mention_role] : []),
            roleSelect(cid("escrole"), t("Cargo do escalamento (vazio = administração)"), settings.escalate_role ? [settings.escalate_role] : []),
            backToHubRow(),
        ],
    });
}

const PRIORITY_FIELD: Record<TicketPriority, string> = { urgent: "p_urgent", high: "p_high", normal: "p_normal", low: "p_low" };

export function slaPriorityField(priority: TicketPriority): string {
    return PRIORITY_FIELD[priority];
}

export function buildSlaTargetsModal(settings: SlaSettings, config: Pick<GuildConfig, "sla_first_response_minutes">): ModalBuilder {
    const base = config.sla_first_response_minutes ?? 15;
    return new ModalBuilder()
        .setCustomId(cid("targets"))
        .setTitle(t("Metas e escalamento"))
        .addLabelComponents(
            ...PRIORITY_ORDER.map((p) => textField(PRIORITY_FIELD[p], t("Meta {priority} (minutos)", { priority: priorityLabel(p) }), settings.priority_minutes[p] ? String(settings.priority_minutes[p]) : "", {
                max: 5,
                placeholder: String(base),
                description: t("Vazio = a meta base do servidor ({minutes} min).", { minutes: base }),
            })),
            textField("escalate", t("Escalar depois de mais (minutos)"), settings.escalate_after_minutes ? String(settings.escalate_after_minutes) : "", {
                max: 5,
                placeholder: "0",
                description: t("0 ou vazio = não escala."),
            }),
        );
}
