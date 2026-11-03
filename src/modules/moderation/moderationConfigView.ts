import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row, type Row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t, tk } from "../../lib/i18n.js";
import { humanizeDuration } from "../../lib/time.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, textField } from "../config/panelKit.js";
import { ESCALATION_ACTIONS, getModerationSettings, MAX_THRESHOLDS, type EscalationAction, type WarnThreshold } from "./moderationSettings.js";

export const MODERATION_NS = "modcfg";
const cid = (...parts: string[]) => buildCustomId(MODERATION_NS, ...parts);

const ACTION_NAMES: Record<EscalationAction, string> = { timeout: tk("Castigo"), kick: tk("Expulsar"), ban: tk("Banir") };

function thresholdText(entry: WarnThreshold): string {
    const action = entry.action === "timeout" ? `${t(ACTION_NAMES.timeout)} ${humanizeDuration(entry.minutes * 60_000)}` : t(ACTION_NAMES[entry.action]);
    return t("{count} avisos → {action}", { count: entry.count, action });
}

export async function buildModerationContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getModerationSettings(guildId);
    const rows: Row[] = [
        row(
            new ButtonBuilder().setCustomId(cid("addrule")).setLabel(t("Adicionar castigo automático")).setEmoji(emoji.add).setStyle(ButtonStyle.Success).setDisabled(s.thresholds.length >= MAX_THRESHOLDS),
            new ButtonBuilder().setCustomId(cid("expiry")).setLabel(t("Validade dos avisos")).setEmoji(emoji.clock).setStyle(ButtonStyle.Secondary),
            optionButton(cid("dm"), s.dm_on_action, { enable: t("Avisar o membro por DM"), disable: t("Não avisar por DM") }),
        ),
    ];
    if (s.thresholds.length) {
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId(cid("delrule"))
            .setPlaceholder(t("Tirar um castigo automático…"))
            .addOptions(s.thresholds.map((entry) => ({ label: thresholdText(entry).slice(0, 100), value: String(entry.count), emoji: emoji.trash })))));
    }
    rows.push(
        channelSelect(cid("log"), t("Canal de registo dos casos"), s.log_channel),
        roleSelect(cid("role"), t("Cargo de moderação (opcional)"), s.mod_role ? [s.mod_role] : []),
        backToHubRow(),
    );
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.hammer} ${t("Moderação")}`,
        description: t("Com `/mod` a equipa avisa, castiga, expulsa, bane e limpa mensagens. Cada ação fica como um caso numerado no registo, e os avisos acumulados podem castigar automaticamente."),
        fields: [
            { name: t("Registo"), value: showChannel(s.log_channel) },
            { name: t("Cargo de moderação"), value: `${showRole(s.mod_role)}\n-# ${t("Quem o tiver pode usar /mod mesmo sem as permissões do Discord.")}` },
            { name: t("Mensagem privada ao membro"), value: onOff(s.dm_on_action) },
            { name: t("Validade dos avisos"), value: s.warn_expiry_days > 0 ? t("{days} dias (depois deixam de contar para os castigos)", { days: s.warn_expiry_days }) : t("Para sempre") },
            { name: t("Castigos automáticos"), value: s.thresholds.length ? s.thresholds.map(thresholdText).join("\n") : t("*Nenhum*") },
        ],
        rows,
    });
}

export function buildThresholdModal(): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("addrule")).setTitle(t("Castigo automático")).addLabelComponents(
        textField("count", t("Ao chegar a quantos avisos?"), "", { required: true, max: 2, placeholder: "3" }),
        new LabelBuilder().setLabel(t("O que fazer")).setStringSelectMenuComponent(new StringSelectMenuBuilder()
            .setCustomId("action")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(ESCALATION_ACTIONS.map((action) => ({ label: t(ACTION_NAMES[action]), value: action, default: action === "timeout" })))),
        textField("minutes", t("Duração do castigo em minutos"), "60", { required: false, max: 5, description: t("Só para o castigo. 1440 = 1 dia.") }),
    );
}

export function buildExpiryModal(days: number): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("expiry")).setTitle(t("Validade dos avisos")).addLabelComponents(
        textField("days", t("Dias até um aviso deixar de contar (0 = nunca)"), String(days), { required: true, max: 3 }),
    );
}
