import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, textField, toggleButton } from "../config/panelKit.js";
import { getVerifySettings, type VerifySettings } from "./verifySettings.js";

export const VERIFY_NS = "vercfg";
const cid = (...parts: string[]) => buildCustomId(VERIFY_NS, ...parts);

export async function buildVerifyContainer(guildId: string, notice: string | null = null): Promise<ContainerPlusBuilder> {
    const s = await getVerifySettings(guildId);
    const ready = Boolean(s.channel && s.verified_role);
    return buildContainer({
        color: s.enabled ? COLORS.success : COLORS.neutral,
        title: `${emoji.shield} ${t("Verificação à entrada")}`,
        description: [
            t("Quem entra carrega em **Verificar** no painel e toca nas figuras pela ordem da imagem — um captcha visual, rápido para pessoas e difícil para bots. Quem acerta recebe o cargo de verificado."),
            notice ? `\n${notice}` : null,
        ].filter(Boolean).join("\n"),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)}${s.enabled && !ready ? ` — ${t("falta escolher o canal e o cargo de verificado")}` : ""}` },
            {
                name: t("Painel e cargos"),
                value: [
                    t("Canal do painel: {channel}", { channel: showChannel(s.channel) }),
                    t("Cargo de verificado: {role}", { role: showRole(s.verified_role) }),
                    t("Cargo ao entrar (tirado ao verificar): {role}", { role: showRole(s.unverified_role) }),
                    t("Registo: {channel}", { channel: showChannel(s.log_channel) }),
                ].join("\n"),
            },
            {
                name: t("Regras"),
                value: [
                    t("Dificuldade: {value}", { value: s.difficulty === "normal" ? t("4 formas") : t("3 formas") }),
                    t("Erros antes de esperar 5 min: {count}", { count: s.max_attempts }),
                    t("Expulsar quem não se verifica: {value}", { value: s.kick_after_minutes > 0 ? t("ao fim de {minutes} min", { minutes: s.kick_after_minutes }) : t("nunca") }),
                    t("Contas recentes: {value}", {
                        value: s.min_account_age_days > 0
                            ? t("menos de {days} dias → {action}", { days: s.min_account_age_days, action: s.young_account_action === "kick" ? t("expulsar") : t("só registar") })
                            : t("sem regra"),
                    }),
                    t("Mensagem privada a quem entra: {state}", { state: onOff(s.dm_on_join) }),
                ].join("\n"),
            },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("publish")).setLabel(s.panel_message_id ? t("Atualizar painel") : t("Publicar painel")).setEmoji(emoji.megaphone).setStyle(ButtonStyle.Primary).setDisabled(!ready),
                new ButtonBuilder().setCustomId(cid("texts")).setLabel(t("Textos do painel")).setEmoji(emoji.edit).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(cid("rules")).setLabel(t("Regras")).setEmoji(emoji.settings).setStyle(ButtonStyle.Secondary),
                optionButton(cid("dm"), s.dm_on_join, { enable: t("Enviar DM ao entrar"), disable: t("Não enviar DM ao entrar") }),
            ),
            channelSelect(cid("channel"), t("Canal do painel de verificação"), s.channel),
            roleSelect(cid("verified"), t("Cargo de verificado"), s.verified_role ? [s.verified_role] : []),
            roleSelect(cid("unverified"), t("Cargo ao entrar (opcional)"), s.unverified_role ? [s.unverified_role] : []),
            channelSelect(cid("log"), t("Canal de registo (opcional)"), s.log_channel),
            backToHubRow(),
        ],
    });
}

export function buildVerifyTextsModal(s: VerifySettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("texts")).setTitle(t("Textos do painel")).addLabelComponents(
        textField("title", t("Título"), s.panel_title ?? "", { max: 100, placeholder: t("Verificação") }),
        textField("description", t("Texto"), s.panel_description ?? "", { paragraph: true, max: 1500, placeholder: t("Carrega em Verificar para entrares no servidor."), description: t("Vazio = texto por omissão.") }),
    );
}

function selectField(id: string, label: string, options: Array<{ label: string; value: string }>, current: string): LabelBuilder {
    return new LabelBuilder().setLabel(label).setStringSelectMenuComponent(new StringSelectMenuBuilder()
        .setCustomId(id)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options.map((o) => ({ ...o, default: o.value === current }))));
}

export function buildVerifyRulesModal(s: VerifySettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("rules")).setTitle(t("Regras da verificação")).addLabelComponents(
        selectField("difficulty", t("Dificuldade"), [
            { label: t("Fácil — 3 formas"), value: "easy" },
            { label: t("Normal — 4 formas"), value: "normal" },
        ], s.difficulty),
        textField("attempts", t("Erros antes de esperar 5 minutos"), String(s.max_attempts), { required: true, max: 2 }),
        textField("kick", t("Expulsar quem não se verifica (minutos)"), s.kick_after_minutes ? String(s.kick_after_minutes) : "", { max: 5, placeholder: "0", description: t("0 ou vazio = nunca expulsa.") }),
        textField("age", t("Idade mínima da conta (dias)"), s.min_account_age_days ? String(s.min_account_age_days) : "", { max: 3, placeholder: "0", description: t("0 ou vazio = sem regra.") }),
        selectField("young", t("Conta mais recente do que isso"), [
            { label: t("Só registar no canal de registo"), value: "log" },
            { label: t("Expulsar"), value: "kick" },
        ], s.young_account_action),
    );
}
