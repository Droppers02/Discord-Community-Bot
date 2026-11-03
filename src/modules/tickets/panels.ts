import { randomUUID } from "node:crypto";
import { ButtonBuilder, StringSelectMenuBuilder, type Client } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { getEmbedColor, getFooterText, TICKET_BUTTON_STYLES } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import type { GuildConfig, TicketButtonStyle, TicketCategoryConfig, TicketPanelConfig } from "../../types.js";
import { getTicketCategories } from "./categories.js";
import {
    DEFAULT_TICKET_BUTTON_LABEL,
    DEFAULT_TICKET_PANEL_DESCRIPTION,
    DEFAULT_TICKET_PANEL_TITLE,
    buildTicketPanelContainer,
    getTicketButtonLabel,
    getTicketPanelDescription,
    getTicketPanelTitle,
    resolveButtonStyle,
} from "./ticketPanel.js";
import { isDefaultText, t } from "../../lib/i18n.js";

export const MAX_PANELS = 10;
const MAX_NAME = 60;

type PanelConfigInput = Pick<GuildConfig, "ticket_panels_json"> | { ticket_panels_json?: string | null };

function normalizeButtonStyle(value: unknown): TicketButtonStyle {
    return (TICKET_BUTTON_STYLES as readonly string[]).includes(value as string) ? (value as TicketButtonStyle) : "primary";
}

function normalizePanels(input: unknown): TicketPanelConfig[] {
    if (!Array.isArray(input)) return [];
    const usedIds = new Set<string>();
    return input
        .slice(0, MAX_PANELS)
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const record = entry as Record<string, unknown>;
            const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Painel";
            let id = typeof record.id === "string" && record.id.trim() ? record.id : randomUUID();
            while (usedIds.has(id)) id = randomUUID();
            usedIds.add(id);
            const categoryIds = Array.isArray(record.category_ids) ? record.category_ids.filter((value): value is string => typeof value === "string") : [];
            return {
                id,
                name: name.slice(0, MAX_NAME),
                channel_id: typeof record.channel_id === "string" && record.channel_id.trim() ? record.channel_id : null,
                message_id: typeof record.message_id === "string" && record.message_id.trim() ? record.message_id : null,
                title: typeof record.title === "string" && record.title.trim() ? record.title : null,
                description: typeof record.description === "string" && record.description.trim() ? record.description : null,
                button_label: typeof record.button_label === "string" && record.button_label.trim() ? record.button_label : null,
                button_emoji: typeof record.button_emoji === "string" && record.button_emoji.trim() ? record.button_emoji : null,
                button_style: normalizeButtonStyle(record.button_style),
                category_ids: categoryIds,
            } satisfies TicketPanelConfig;
        })
        .filter((entry): entry is TicketPanelConfig => Boolean(entry));
}

export function getTicketPanels(config?: PanelConfigInput | null): TicketPanelConfig[] {
    if (!config?.ticket_panels_json) return [];
    try {
        return normalizePanels(JSON.parse(config.ticket_panels_json));
    } catch {
        return [];
    }
}

export function serializeTicketPanels(panels: TicketPanelConfig[]): string {
    return JSON.stringify(panels.slice(0, MAX_PANELS));
}

export function findPanel(config: PanelConfigInput | null | undefined, panelId: string): TicketPanelConfig | null {
    return getTicketPanels(config).find((panel) => panel.id === panelId) ?? null;
}

export function findPanelByName(config: PanelConfigInput | null | undefined, name: string): TicketPanelConfig | null {
    const needle = name.trim().toLowerCase();
    return getTicketPanels(config).find((panel) => panel.name.trim().toLowerCase() === needle) ?? null;
}

export function createDefaultPanel(name: string): TicketPanelConfig {
    return {
        id: randomUUID(),
        name: name.trim().slice(0, MAX_NAME) || "Painel",
        channel_id: null,
        message_id: null,
        title: null,
        description: null,
        button_label: null,
        button_emoji: null,
        button_style: "primary",
        category_ids: [],
    };
}

export function upsertPanel(panels: TicketPanelConfig[], panel: TicketPanelConfig): TicketPanelConfig[] {
    const index = panels.findIndex((entry) => entry.id === panel.id);
    if (index >= 0) {
        const copy = [...panels];
        copy[index] = panel;
        return copy;
    }
    return [...panels, panel].slice(0, MAX_PANELS);
}

export function removePanel(panels: TicketPanelConfig[], panelId: string): TicketPanelConfig[] {
    return panels.filter((panel) => panel.id !== panelId);
}

/** The categories exposed by a panel (empty selection = all configured categories). */
export function resolvePanelCategories(config: GuildConfig, panel: TicketPanelConfig): TicketCategoryConfig[] {
    const all = getTicketCategories(config);
    if (!panel.category_ids.length) return all;
    const set = new Set(panel.category_ids);
    const filtered = all.filter((category) => set.has(category.id));
    return filtered.length ? filtered : all;
}

function panelTitle(panel: TicketPanelConfig, config: GuildConfig): string {
    return panel.title?.trim() && !isDefaultText(panel.title, DEFAULT_TICKET_PANEL_TITLE) ? panel.title.trim() : getTicketPanelTitle(config);
}

function panelDescription(panel: TicketPanelConfig, config: GuildConfig): string {
    return panel.description?.trim() && !isDefaultText(panel.description, DEFAULT_TICKET_PANEL_DESCRIPTION) ? panel.description.trim() : getTicketPanelDescription(config);
}

function panelButtonLabel(panel: TicketPanelConfig, config: GuildConfig): string {
    return panel.button_label?.trim() && !isDefaultText(panel.button_label, DEFAULT_TICKET_BUTTON_LABEL) ? panel.button_label.trim() : getTicketButtonLabel(config);
}

/** Render a specific panel's public container (its button carries the panel id). */
export function buildPanelContainer(panel: TicketPanelConfig, config: GuildConfig): ContainerPlusBuilder {
    const categories = resolvePanelCategories(config, panel);
    return buildContainer({
        color: getEmbedColor(config),
        thumbnailUrl: config.branding_logo,
        title: `${emoji.ticket} ${panelTitle(panel, config)}`,
        description: panelDescription(panel, config),
        fields: [
            { name: t("Como abrir"), value: t("Escolhe a categoria e explica o motivo com contexto suficiente para acelerar a triagem.") },
            { name: t("Categorias disponíveis"), value: categories.map((category) => `• ${category.label}`).join("\n") || t("*Sem categorias configuradas.*") },
            { name: t("Limite"), value: t("Cada utilizador pode manter até {count, plural, one {# ticket aberto} other {# tickets abertos}} em simultâneo.", { count: Math.max(1, config.ticket_max_open ?? 3) }) },
        ],
        footerText: getFooterText(config),
        rows: [row(
            new ButtonBuilder()
                .setCustomId(buildCustomId("ticket", "open", panel.id))
                .setLabel(panelButtonLabel(panel, config))
                .setEmoji(panel.button_emoji?.trim() || ei("ticket"))
                .setStyle(resolveButtonStyle(panel.button_style)),
        )],
    });
}

/** The category selector for a panel — filtered to the panel's categories. */
export function buildPanelCategorySelector(panel: TicketPanelConfig, config: GuildConfig): ContainerPlusBuilder {
    const options = resolvePanelCategories(config, panel).map((category) => ({
        label: category.label,
        value: category.id,
        description: t("Abrir ticket em {category}", { category: category.label }).slice(0, 100),
        ...(category.emoji?.trim() ? { emoji: category.emoji } : {}),
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

/**
 * Atualiza no sítio as mensagens de painel já publicadas (o principal e os extra) — ex.:
 * depois de mudar a língua do bot. Nunca publica mensagens novas; um painel apagado fica
 * apagado. Corre na língua do contexto atual.
 */
export async function refreshPublishedPanels(client: Client, config: GuildConfig): Promise<number> {
    const targets: Array<{ channelId: string; messageId: string; build: () => ContainerPlusBuilder }> = [];
    if (config.ticket_channel && config.ticket_panel_message) {
        targets.push({ channelId: config.ticket_channel, messageId: config.ticket_panel_message, build: () => buildTicketPanelContainer(config) });
    }
    for (const panel of getTicketPanels(config)) {
        if (panel.channel_id && panel.message_id) targets.push({ channelId: panel.channel_id, messageId: panel.message_id, build: () => buildPanelContainer(panel, config) });
    }

    let refreshed = 0;
    for (const target of targets) {
        const channel = await client.channels.fetch(target.channelId).catch(() => null);
        if (!channel?.isTextBased() || !("messages" in channel)) continue;
        const edited = await channel.messages.edit(target.messageId, { components: [target.build()] }).catch(() => null);
        if (edited) refreshed++;
    }
    return refreshed;
}
