import { t, textOrDefault, tk } from "../../lib/i18n.js";
import { ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { getEmbedColor, getFooterText } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { emoji, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import type { GuildConfig } from "../../types.js";
import { getCategoryLines, getTicketCategories } from "./categories.js";

// Textos por defeito (em português, marcados com tk): traduzem-se ao mostrar, com textOrDefault.
export const DEFAULT_TICKET_PANEL_TITLE = tk("Suporte do servidor");
export const DEFAULT_TICKET_PANEL_DESCRIPTION = tk("Abre um ticket para receberes acompanhamento direto da nossa equipa. Escolhe a categoria que melhor se adequa ao teu pedido e explica a situação com o máximo de detalhe.");
export const DEFAULT_TICKET_BUTTON_LABEL = tk("Abrir ticket");
// Empty = use the bot's own "ticket" application emoji (resolved at render time).
export const DEFAULT_TICKET_BUTTON_EMOJI = "";

export function resolveButtonStyle(style: GuildConfig["ticket_button_style"]): ButtonStyle {
    if (style === "secondary") return ButtonStyle.Secondary;
    if (style === "success") return ButtonStyle.Success;
    if (style === "danger") return ButtonStyle.Danger;
    return ButtonStyle.Primary;
}

export function getTicketPanelTitle(config?: { ticket_panel_title?: string | null } | null) {
    return textOrDefault(config?.ticket_panel_title, DEFAULT_TICKET_PANEL_TITLE);
}

export function getTicketPanelDescription(config?: { ticket_panel_description?: string | null } | null) {
    return textOrDefault(config?.ticket_panel_description, DEFAULT_TICKET_PANEL_DESCRIPTION);
}

export function getTicketButtonLabel(config?: { ticket_button_label?: string | null } | null) {
    return textOrDefault(config?.ticket_button_label, DEFAULT_TICKET_BUTTON_LABEL);
}

export function getTicketButtonEmoji(config?: { ticket_button_emoji?: string | null } | null) {
    return config?.ticket_button_emoji?.trim() || DEFAULT_TICKET_BUTTON_EMOJI;
}

// Custom configured emoji (string) if set, otherwise the bot's own "ticket" emoji.
function resolveButtonEmoji(config: { ticket_button_emoji?: string | null }) {
    return config.ticket_button_emoji?.trim() || ei("ticket");
}

export function buildTicketPanelContainer(config: GuildConfig): ContainerPlusBuilder {
    return buildContainer({
        color: getEmbedColor(config),
        thumbnailUrl: config.branding_logo,
        title: `${emoji.ticket} ${getTicketPanelTitle(config)}`,
        description: getTicketPanelDescription(config),
        fields: [
            { name: t("Como abrir"), value: t("Escolhe a categoria e explica o motivo com contexto suficiente para acelerar a triagem.") },
            { name: t("Categorias disponíveis"), value: getCategoryLines(config) },
            { name: t("Limite"), value: t("Cada utilizador pode manter até {count, plural, one {# ticket aberto} other {# tickets abertos}} em simultâneo.", { count: Math.max(1, config.ticket_max_open ?? 3) }) },
        ],
        footerText: getFooterText(config),
        rows: [row(
            new ButtonBuilder()
                .setCustomId(buildCustomId("ticket", "open"))
                .setLabel(getTicketButtonLabel(config))
                .setEmoji(resolveButtonEmoji(config))
                .setStyle(resolveButtonStyle(config.ticket_button_style)),
        )],
    });
}

export function buildCategorySelectorContainer(config: GuildConfig): ContainerPlusBuilder {
    const options = getTicketCategories(config).map((category) => ({
        label: category.label,
        value: category.id,
        description: t("Abrir ticket em {category}", { category: category.label }).slice(0, 100),
    }));

    return buildContainer({
        color: getEmbedColor(config),
        title: `${emoji.open} ${t("Abrir ticket")}`,
        description: t("Escolhe primeiro a categoria do pedido para o bot abrir o formulário certo."),
        rows: [row(
            new StringSelectMenuBuilder()
                .setCustomId(buildCustomId("ticket", "open-category"))
                .setPlaceholder(t("Seleciona a categoria do ticket"))
                .addOptions(options),
        )],
    });
}

function buildTicketPanelPayload(config: GuildConfig) {
    return { components: [buildTicketPanelContainer(config)], flags: CV2_FLAG };
}

export async function upsertTicketPanel(channel: TextChannel, config: GuildConfig): Promise<string> {
    if (config.ticket_panel_message) {
        const existing = await channel.messages.fetch(config.ticket_panel_message).catch(() => null);
        if (existing) {
            await existing.edit({ components: [buildTicketPanelContainer(config)] });
            return existing.id;
        }
    }

    const message = await channel.send(buildTicketPanelPayload(config));
    return message.id;
}

export async function postTicketPanel(channel: TextChannel, config: GuildConfig): Promise<string> {
    const message = await channel.send(buildTicketPanelPayload(config));
    return message.id;
}
