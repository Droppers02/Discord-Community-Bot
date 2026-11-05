import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { e, emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { backToHubRow, channelField, channelSelect, onOff, optionButton, roleSelect, selectField, showRoles, textField, toggleButton } from "../config/panelKit.js";
import { describeDays, getLockdownSettings, MAX_QUIET_RULES, QUIET_MODE_LABELS, type QuietRule } from "./lockdownSettings.js";

// /config → Trancas e horário de silêncio.

export const LOCKDOWN_NS = "lockcfg";
const cid = (...parts: string[]) => buildCustomId(LOCKDOWN_NS, ...parts);

export const QUIET_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildForum];

/** Modo + slowmode numa só escolha (os modais só levam 5 campos). */
export const QUIET_MODE_CHOICES: Array<{ value: string; label: string; mode: QuietRule["mode"]; slowmode: number }> = [
    { value: "lock", label: "Trancar (ninguém escreve)", mode: "lock", slowmode: 30 },
    { value: "slow10", label: "Slowmode de 10 segundos", mode: "slowmode", slowmode: 10 },
    { value: "slow30", label: "Slowmode de 30 segundos", mode: "slowmode", slowmode: 30 },
    { value: "slow60", label: "Slowmode de 1 minuto", mode: "slowmode", slowmode: 60 },
    { value: "slow300", label: "Slowmode de 5 minutos", mode: "slowmode", slowmode: 300 },
    { value: "slow900", label: "Slowmode de 15 minutos", mode: "slowmode", slowmode: 900 },
];

function modeChoice(rule: QuietRule | null): string {
    if (!rule || rule.mode === "lock") return "lock";
    return QUIET_MODE_CHOICES.find((choice) => choice.mode === "slowmode" && choice.slowmode === rule.slowmode)?.value ?? "slow30";
}

export function ruleLine(rule: QuietRule): string {
    const mode = rule.mode === "lock" ? t(QUIET_MODE_LABELS.lock) : t("Slowmode {s} s", { s: rule.slowmode });
    const channels = rule.channels.length ? rule.channels.slice(0, 6).map((id) => `<#${id}>`).join(" ") + (rule.channels.length > 6 ? ` +${rule.channels.length - 6}` : "") : t("*sem canais*");
    return `${rule.enabled ? "🌙" : "⏸️"} **${rule.name}** · ${rule.start}–${rule.end} · ${describeDays(rule.days)} · ${mode}\n-# ${channels}`;
}

export async function buildLockdownContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getLockdownSettings(guildId);
    const manage = new StringSelectMenuBuilder().setCustomId(cid("rule")).setPlaceholder(t("Editar, pausar ou remover um horário…"));
    for (const rule of s.quiet_rules) {
        manage.addOptions(
            { label: t("Editar: {name}", { name: rule.name }).slice(0, 100), value: `edit:${rule.id}`, emoji: "✏️" },
            { label: (rule.enabled ? t("Pausar: {name}", { name: rule.name }) : t("Retomar: {name}", { name: rule.name })).slice(0, 100), value: `toggle:${rule.id}`, emoji: rule.enabled ? "⏸️" : "▶️" },
            { label: t("Remover: {name}", { name: rule.name }).slice(0, 100), value: `delete:${rule.id}`, emoji: "🗑️" },
        );
    }
    return buildContainer({
        color: COLORS.warning,
        title: `${e("lock")} ${t("Trancas e horário de silêncio")}`,
        description: t("`/trancar canal` fecha um canal, `/trancar servidor` fecha tudo de uma vez (raids, dramas), e o horário de silêncio fecha ou abranda canais a certas horas. Ao destrancar, as permissões voltam exatamente ao que eram."),
        fields: [
            {
                name: t("Ao trancar"),
                value: [
                    t("Cargos trancados: {roles}", { roles: s.roles.length ? showRoles(s.roles) : "@everyone" }),
                    t("Aviso no canal: {state}", { state: onOff(s.announce) }),
                    t("Pausar convites ao trancar o servidor: {state}", { state: onOff(s.pause_invites) }),
                    t("Canais que o servidor não fecha: {list}", { list: s.excluded_channels.length ? s.excluded_channels.map((id) => `<#${id}>`).join(", ") : t("*nenhum*") }),
                ].join("\n"),
            },
            { name: t("Anti-raid"), value: s.raid_lockdown ? t("{state} — tranca o servidor durante **{n} min** quando deteta um raid.", { state: onOff(true), n: s.raid_lockdown_minutes }) : `${onOff(false)} — ${t("liga a deteção em /config → Proteção.")}` },
            { name: t("Horário de silêncio ({n}/{max})", { n: s.quiet_rules.length, max: MAX_QUIET_RULES }), value: `${onOff(s.quiet_enabled)}\n${s.quiet_rules.length ? s.quiet_rules.map(ruleLine).join("\n") : t("*Sem horários — ex.: fechar o #geral das 3h às 8h.*")}` },
        ],
        rows: [
            row(
                toggleButton(cid("quiet"), s.quiet_enabled).setLabel(s.quiet_enabled ? t("Desligar horário") : t("Ligar horário")),
                new ButtonBuilder().setCustomId(cid("addrule")).setLabel(t("Novo horário")).setEmoji(emoji.add).setStyle(ButtonStyle.Primary).setDisabled(s.quiet_rules.length >= MAX_QUIET_RULES),
                optionButton(cid("announce"), s.announce, { enable: t("Avisar nos canais"), disable: t("Não avisar nos canais") }),
                optionButton(cid("invites"), s.pause_invites, { enable: t("Pausar convites"), disable: t("Não pausar convites") }),
                optionButton(cid("raid"), s.raid_lockdown, { enable: t("Trancar em raids"), disable: t("Não trancar em raids") }),
            ),
            ...(s.quiet_rules.length ? [row(manage)] : []),
            roleSelect(cid("roles"), t("Cargos a trancar (vazio = @everyone)"), s.roles, 10),
            channelSelect(cid("exclude"), t("Canais que o «trancar servidor» não mexe"), s.excluded_channels, [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildForum], 25),
            backToHubRow([new ButtonBuilder().setCustomId(cid("raidmin")).setLabel(t("Minutos do anti-raid")).setEmoji(emoji.edit).setStyle(ButtonStyle.Secondary)]),
        ],
    });
}

export function buildQuietRuleModal(rule: QuietRule | null): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("rulesave", rule?.id ?? "new")).setTitle(rule ? t("Editar horário") : t("Novo horário de silêncio")).addLabelComponents(
        textField("name", t("Nome"), rule?.name ?? t("Noite"), { required: true, max: 40 }),
        textField("hours", t("Horas (Lisboa)"), rule ? `${rule.start}-${rule.end}` : "03:00-08:00", { required: true, max: 20, description: t("Início-fim. Se o fim for mais cedo, atravessa a meia-noite (ex.: 23:30-07:00).") }),
        textField("days", t("Dias"), rule ? describeDays(rule.days) : t("todos"), { max: 60, description: t("todos · úteis · fds · seg,qua,sex · seg-sex") }),
        selectField("mode", t("O que fazer"), QUIET_MODE_CHOICES.map((choice) => ({ label: t(choice.label), value: choice.value })), modeChoice(rule)),
        channelField("channels", t("Canais"), rule?.channels ?? [], QUIET_CHANNEL_TYPES, { min: 1, max: 25 }),
    );
}

export function buildRaidMinutesModal(minutes: number): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("raidminsave")).setTitle(t("Anti-raid")).addLabelComponents(
        textField("minutes", t("Minutos que o servidor fica trancado"), String(minutes), { required: true, max: 4, description: t("De 5 a 1440. A equipa pode destrancar antes com /destrancar servidor.") }),
    );
}

/** "03:00-08:00", "3h-8h", "23:30 às 7:00" → [início, fim] ou null. */
export function parseHours(input: string): [string, string] | null {
    const times = [...input.toLowerCase().matchAll(/(\d{1,2})(?:[:h](\d{2}))?\s*h?/g)].map((match) => {
        const hour = Number(match[1]);
        const minute = Number(match[2] ?? 0);
        return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : null;
    });
    if (times.length !== 2 || times.some((time) => !time) || times[0] === times[1]) return null;
    return [times[0]!, times[1]!];
}
