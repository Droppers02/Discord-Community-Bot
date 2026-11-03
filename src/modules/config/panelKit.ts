import {
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    GuildMember,
    LabelBuilder,
    RoleSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    type RepliableInteraction,
} from "discord.js";
import { errorContainer, row, type Row } from "../../lib/containers.js";
import { hasSuperAdminAccess, replyContainer } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";

// Peças comuns das secções do /config que vivem em módulo próprio (SLA, modmail, verificação,
// níveis): cada uma tem o seu responder, mas todas se parecem e voltam ao mesmo menu.

export function onOff(value: boolean): string {
    return value ? `${emoji.success} ${t("Ligado")}` : `${emoji.error} ${t("Desligado")}`;
}

export function showChannel(id: string | null | undefined): string {
    return id ? `<#${id}>` : t("*Nenhum*");
}

export function showRole(id: string | null | undefined): string {
    return id ? `<@&${id}>` : t("*Nenhum*");
}

export function showRoles(ids: string[]): string {
    return ids.length ? ids.map((id) => `<@&${id}>`).join(", ") : t("*Nenhum*");
}

/**
 * Liga/desliga a secção. O botão mostra o que VAI acontecer, como no resto do /config e no
 * PixelFx: verde com ✓ para ligar, vermelho com ✗ para desligar. O estado atual está no texto.
 */
export function toggleButton(customId: string, on: boolean): ButtonBuilder {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(on ? t("Desligar") : t("Ligar"))
        .setEmoji(on ? emoji.error : emoji.success)
        .setStyle(on ? ButtonStyle.Danger : ButtonStyle.Success);
}

/**
 * Opção secundária: cinzenta, com o texto da ação que o clique faz (ex.: "Avisar a qualquer
 * hora" quando hoje só avisa no horário) — o mesmo padrão dos botões do antispam.
 */
export function optionButton(customId: string, on: boolean, labels: { enable: string; disable: string }): ButtonBuilder {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(on ? labels.disable : labels.enable)
        .setStyle(ButtonStyle.Secondary);
}

export function channelSelect(customId: string, placeholder: string, selected: string | string[] | null, kinds: ChannelType[] = [ChannelType.GuildText, ChannelType.GuildAnnouncement], max = 1): Row {
    const select = new ChannelSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder.slice(0, 150))
        .addChannelTypes(...kinds)
        .setMinValues(0)
        .setMaxValues(max);
    const defaults = (Array.isArray(selected) ? selected : selected ? [selected] : []).slice(0, max);
    if (defaults.length) select.setDefaultChannels(...defaults);
    return row(select);
}

export function roleSelect(customId: string, placeholder: string, selected: string[], max = 1): Row {
    const select = new RoleSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder.slice(0, 150))
        .setMinValues(0)
        .setMaxValues(max);
    if (selected.length) select.setDefaultRoles(...selected.slice(0, max));
    return row(select);
}

export function textField(id: string, label: string, value: string, opts?: { required?: boolean; paragraph?: boolean; max?: number; placeholder?: string; description?: string }): LabelBuilder {
    const input = new TextInputBuilder()
        .setCustomId(id)
        .setStyle(opts?.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(opts?.required ?? false)
        .setMaxLength(opts?.max ?? 100);
    if (opts?.placeholder) input.setPlaceholder(opts.placeholder);
    if (value) input.setValue(value);
    const built = new LabelBuilder().setLabel(label).setTextInputComponent(input);
    if (opts?.description) built.setDescription(opts.description);
    return built;
}

/** Volta ao menu do /config (tratado pelo responder principal, `cfg/back`). */
export function backToHubRow(extra: ButtonBuilder[] = []): Row {
    return row(
        new ButtonBuilder().setCustomId("cfg/back").setLabel(t("Voltar ao menu")).setEmoji(emoji.arrowLeft).setStyle(ButtonStyle.Secondary),
        ...extra,
    );
}

/** Inteiro dentro de limites; texto vazio ou inválido devolve `fallback`. */
export function clampInt(value: string, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

/** Só administração (ou super-admin) mexe na configuração — igual ao resto do /config. */
export async function gateConfig(interaction: RepliableInteraction): Promise<boolean> {
    if (!interaction.inCachedGuild()) return false;
    const config = await ensureGuildConfig(interaction.guildId);
    if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role)) {
        await replyContainer(interaction, errorContainer(t("Apenas super-admin ou `Administrator` pode usar este painel.")));
        return false;
    }
    return true;
}
