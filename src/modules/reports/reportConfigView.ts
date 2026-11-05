import { ButtonBuilder, ButtonStyle, ModalBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { queryOne } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { e, emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, textField, toggleButton } from "../config/panelKit.js";
import { getReportSettings, type ReportSettings } from "./reportSettings.js";

// /config → Denúncias.

export const REPORT_CFG_NS = "reportcfg";
const cid = (...parts: string[]) => buildCustomId(REPORT_CFG_NS, ...parts);

export async function buildReportsContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getReportSettings(guildId);
    const stats = await queryOne<{ total: string; open: string; resolved: string }>(
        "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status IN ('open', 'claimed')) AS open, COUNT(*) FILTER (WHERE status = 'resolved') AS resolved FROM message_reports WHERE guild_id = $1",
        [guildId],
    ).catch(() => null);
    return buildContainer({
        color: s.enabled ? COLORS.danger : COLORS.neutral,
        title: `${e("report")} ${t("Denúncias")}`,
        description: t("Qualquer membro denuncia uma mensagem: botão direito → **Apps** → **Reportar mensagem**. A equipa recebe um cartão com a cópia da mensagem, as provas, o histórico do autor e um menu para resolver."),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)}${s.enabled && !s.channel ? ` — ${t("falta o canal da equipa")}` : ""}` },
            {
                name: t("Regras"),
                value: [
                    t("Canal da equipa: {channel}", { channel: showChannel(s.channel) }),
                    t("Cargo avisado: {role}", { role: showRole(s.ping_role) }),
                    t("Avisar quem denunciou quando for tratado: {state}", { state: onOff(s.notify_reporter) }),
                    t("Esconder de quem denunciou da equipa: {state}", { state: onOff(s.anonymous) }),
                    t("Intervalo entre denúncias: **{n} min**", { n: s.cooldown_minutes }),
                    s.auto_hide ? t("Esconder a mensagem com **{n}** denúncias de pessoas diferentes", { n: s.auto_hide }) : t("Esconder automaticamente: {state}", { state: onOff(false) }),
                ].join("\n"),
            },
            { name: t("Números"), value: t("{total} denúncias · {open} por tratar · {resolved} com medidas", { total: Number(stats?.total ?? 0), open: Number(stats?.open ?? 0), resolved: Number(stats?.resolved ?? 0) }) },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("limits")).setLabel(t("Intervalo e auto-esconder")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
                optionButton(cid("notify"), s.notify_reporter, { enable: t("Avisar quem denunciou"), disable: t("Não avisar quem denunciou") }),
                optionButton(cid("anon"), s.anonymous, { enable: t("Esconder quem denunciou"), disable: t("Mostrar quem denunciou") }),
            ),
            channelSelect(cid("channel"), t("Canal da equipa onde chegam as denúncias"), s.channel),
            roleSelect(cid("role"), t("Cargo a avisar em cada denúncia (opcional)"), s.ping_role ? [s.ping_role] : []),
            backToHubRow(),
        ],
    });
}

export function buildReportLimitsModal(s: ReportSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("limitssave")).setTitle(t("Denúncias")).addLabelComponents(
        textField("cooldown", t("Minutos entre denúncias da mesma pessoa"), String(s.cooldown_minutes), { required: true, max: 4, description: t("0 = sem limite.") }),
        textField("autohide", t("Esconder a mensagem com N denúncias"), String(s.auto_hide), { required: true, max: 2, description: t("Pessoas diferentes. 0 = nunca esconder sozinho.") }),
    );
}
