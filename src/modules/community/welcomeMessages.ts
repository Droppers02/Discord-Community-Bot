import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, type GuildMember, type PartialGuildMember, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG, hasPowerPermissions } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { backToHubRow, channelSelect, onOff, roleSelect, showChannel, showRoles, textField, toggleButton } from "../config/panelKit.js";

// Boas-vindas e despedidas com texto próprio (do bot antigo): mensagem pública no canal, DM
// opcional a quem entra e cargos automáticos. Os cartões de log de entradas/saídas continuam
// à parte (/config → Entradas e saídas).

export interface WelcomeSettings {
    welcome_enabled: boolean;
    welcome_channel: string | null;
    welcome_title: string;
    welcome_message: string;
    goodbye_enabled: boolean;
    goodbye_channel: string | null;
    goodbye_message: string;
    dm_enabled: boolean;
    dm_message: string;
    auto_roles: string[];
}

export const DEFAULT_WELCOME = "Olá {user}, bem-vindo(a) ao **{server}**! És o membro nº **{count}**. 🎉";
export const DEFAULT_GOODBYE = "**{name}** saiu do servidor. Até à próxima! 👋";
export const DEFAULT_DM = "Bem-vindo(a) ao **{server}**! Lê as regras e diverte-te.";

export function buildWelcomeDefaults(): WelcomeSettings {
    return {
        welcome_enabled: false,
        welcome_channel: null,
        welcome_title: "Bem-vindo(a)!",
        welcome_message: DEFAULT_WELCOME,
        goodbye_enabled: false,
        goodbye_channel: null,
        goodbye_message: DEFAULT_GOODBYE,
        dm_enabled: false,
        dm_message: DEFAULT_DM,
        auto_roles: [],
    };
}

const idOrNull = (value: unknown) => (typeof value === "string" && /^\d{5,25}$/.test(value) ? value : null);
const text = (value: unknown, fallback: string, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback);

export function normalizeWelcome(value: WelcomeSettings): WelcomeSettings {
    return {
        welcome_enabled: value.welcome_enabled === true,
        welcome_channel: idOrNull(value.welcome_channel),
        welcome_title: text(value.welcome_title, "Bem-vindo(a)!", 100),
        welcome_message: text(value.welcome_message, DEFAULT_WELCOME, 1500),
        goodbye_enabled: value.goodbye_enabled === true,
        goodbye_channel: idOrNull(value.goodbye_channel),
        goodbye_message: text(value.goodbye_message, DEFAULT_GOODBYE, 1500),
        dm_enabled: value.dm_enabled === true,
        dm_message: text(value.dm_message, DEFAULT_DM, 1500),
        auto_roles: Array.isArray(value.auto_roles) ? value.auto_roles.filter((id): id is string => Boolean(idOrNull(id))).slice(0, 10) : [],
    };
}

export const getWelcomeSettings = (guildId: string) => getSettings("welcome_settings", guildId, buildWelcomeDefaults(), normalizeWelcome);
export const saveWelcomeSettings = (guildId: string, patch: Partial<WelcomeSettings>) => saveSettings("welcome_settings", guildId, patch, buildWelcomeDefaults(), normalizeWelcome);

export function fillTemplate(template: string, member: GuildMember | PartialGuildMember): string {
    return template
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{name}", member.displayName ?? member.user?.username ?? "")
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{count}", formatNumber(member.guild.memberCount));
}

async function send(member: GuildMember | PartialGuildMember, channelId: string, container: ContainerPlusBuilder, mention: boolean): Promise<void> {
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    await (channel as TextChannel).send({ components: [container], flags: CV2_FLAG, allowedMentions: mention ? { users: [member.id] } : { parse: [] } })
        .catch((error) => logger.warn("Boas-vindas: falha a enviar:", error));
}

export async function handleWelcome(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    const s = await getWelcomeSettings(member.guild.id);
    if (s.auto_roles.length) {
        const roles = s.auto_roles.filter((id) => {
            const role = member.guild.roles.cache.get(id);
            return Boolean(role?.editable && !hasPowerPermissions(role));
        });
        if (roles.length) await member.roles.add(roles, t("Cargos automáticos de entrada")).catch((error) => logger.warn("Boas-vindas: cargos automáticos:", error));
    }
    if (s.welcome_enabled && s.welcome_channel) {
        await send(member, s.welcome_channel, buildContainer({
            color: COLORS.success,
            title: `👋 ${fillTemplate(s.welcome_title, member)}`,
            thumbnailUrl: member.displayAvatarURL({ size: 256 }),
            description: fillTemplate(s.welcome_message, member),
        }), true);
    }
    if (s.dm_enabled) {
        await member.send({ components: [buildContainer({ color: COLORS.primary, title: `👋 ${member.guild.name}`, description: fillTemplate(s.dm_message, member) })], flags: CV2_FLAG }).catch(() => null);
    }
}

export async function handleGoodbye(member: GuildMember | PartialGuildMember): Promise<void> {
    if (member.user?.bot) return;
    const s = await getWelcomeSettings(member.guild.id);
    if (!s.goodbye_enabled || !s.goodbye_channel) return;
    await send(member, s.goodbye_channel, buildContainer({
        color: COLORS.neutral,
        thumbnailUrl: member.displayAvatarURL?.({ size: 256 }) ?? null,
        description: fillTemplate(s.goodbye_message, member),
    }), false);
}

// ─── /config → Boas-vindas ───────────────────────────────────────────────────

export const WELCOME_NS = "wlcfg";
const cid = (...parts: string[]) => buildCustomId(WELCOME_NS, ...parts);

export async function buildWelcomeMessagesContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getWelcomeSettings(guildId);
    return buildContainer({
        color: COLORS.success,
        title: `👋 ${t("Boas-vindas e despedidas")}`,
        description: t("Mensagens públicas quando alguém entra ou sai, DM de boas-vindas e cargos automáticos. Variáveis: `{user}` (menção), `{name}`, `{server}`, `{count}` (nº de membros)."),
        fields: [
            { name: t("Boas-vindas"), value: `${onOff(s.welcome_enabled)} · ${showChannel(s.welcome_channel)}\n**${s.welcome_title}** — ${s.welcome_message.slice(0, 200)}` },
            { name: t("Despedidas"), value: `${onOff(s.goodbye_enabled)} · ${showChannel(s.goodbye_channel)}\n${s.goodbye_message.slice(0, 200)}` },
            { name: t("Mensagem privada"), value: `${onOff(s.dm_enabled)}\n${s.dm_message.slice(0, 200)}` },
            { name: t("Cargos automáticos"), value: showRoles(s.auto_roles) },
        ],
        rows: [
            row(
                toggleButton(cid("welcome"), s.welcome_enabled).setLabel(s.welcome_enabled ? t("Desligar boas-vindas") : t("Ligar boas-vindas")),
                toggleButton(cid("goodbye"), s.goodbye_enabled).setLabel(s.goodbye_enabled ? t("Desligar despedidas") : t("Ligar despedidas")),
                toggleButton(cid("dm"), s.dm_enabled).setLabel(s.dm_enabled ? t("Desligar DM") : t("Ligar DM")),
                new ButtonBuilder().setCustomId(cid("texts")).setLabel(t("Textos")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
            ),
            channelSelect(cid("welcomech"), t("Canal das boas-vindas"), s.welcome_channel, [ChannelType.GuildText]),
            channelSelect(cid("goodbyech"), t("Canal das despedidas"), s.goodbye_channel, [ChannelType.GuildText]),
            roleSelect(cid("roles"), t("Cargos dados a quem entra (opcional)"), s.auto_roles, 10),
            backToHubRow(),
        ],
    });
}

export function buildWelcomeTextsModal(s: WelcomeSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("texts")).setTitle(t("Textos de boas-vindas")).addLabelComponents(
        textField("title", t("Título das boas-vindas"), s.welcome_title, { required: true, max: 100 }),
        textField("welcome", t("Mensagem de boas-vindas"), s.welcome_message, { required: true, paragraph: true, max: 1500 }),
        textField("goodbye", t("Mensagem de despedida"), s.goodbye_message, { required: true, paragraph: true, max: 1500 }),
        textField("dm", t("Mensagem privada a quem entra"), s.dm_message, { required: true, paragraph: true, max: 1500 }),
    );
}
