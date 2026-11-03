import {
    createContainer,
    createRow,
    createSection,
    createThumbnail,
    Separator,
    type ContainerPlusBuilder,
} from "@magicyan/discord";
import type { ActionRowBuilder, MessageActionRowComponentBuilder } from "discord.js";
import { COLORS } from "./branding.js";
import { emoji } from "./emojis.js";
import { t } from "./i18n.js";

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

/** Build a CV2/action row of interactive components (buttons or any select menu). */
export function row(...components: MessageActionRowComponentBuilder[]): Row {
    return createRow<MessageActionRowComponentBuilder>(...components);
}

export interface ContainerField {
    name: string;
    value: string;
}

export interface BaseContainerOptions {
    color?: number;
    title?: string | null;
    description?: string | null;
    thumbnailUrl?: string | null;
    fields?: ContainerField[];
    footerText?: string | null;
    rows?: Row[];
}

function isHttpUrl(value?: string | null): value is string {
    if (!value) return false;
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

function renderFields(fields?: ContainerField[]): string | null {
    if (!fields?.length) return null;
    return fields
        .map((field) => `**${field.name}**\n${field.value || "-"}`)
        .join("\n\n");
}

/**
 * Generic CV2 container builder used by every ticket surface. Renders an optional
 * header (with thumbnail accessory), a body of markdown "fields", an optional
 * footer line, and any interactive rows.
 */
export function buildContainer(options: BaseContainerOptions): ContainerPlusBuilder {
    const color = options.color ?? COLORS.primary;
    const headerText = [
        options.title ? `## ${options.title}` : null,
        options.description ?? null,
    ].filter(Boolean).join("\n");

    const components: unknown[] = [];

    if (headerText) {
        components.push(
            isHttpUrl(options.thumbnailUrl)
                ? createSection(headerText, createThumbnail(options.thumbnailUrl))
                : headerText,
        );
    }

    const body = renderFields(options.fields);
    if (body) {
        if (headerText) components.push(Separator.Default);
        components.push(body);
    }

    if (options.footerText) {
        components.push(Separator.Default);
        components.push(`-# ${options.footerText}`);
    }

    if (options.rows?.length) {
        components.push(Separator.Default);
        components.push(...options.rows);
    }

    return createContainer(color, ...(components as never[]));
}

// ─── Simple ephemeral notices ────────────────────────────────────────────────
export function successContainer(message: string): ContainerPlusBuilder {
    return buildContainer({ color: COLORS.success, title: `${emoji.success} ${t("Operação concluída")}`, description: message });
}

export function errorContainer(message: string): ContainerPlusBuilder {
    return buildContainer({ color: COLORS.danger, title: `${emoji.error} ${t("Operação não concluída")}`, description: message });
}

export function noticeContainer(opts: { title?: string; description: string; color?: number; rows?: Row[] }): ContainerPlusBuilder {
    return buildContainer({
        color: opts.color ?? COLORS.neutral,
        title: opts.title ?? null,
        description: opts.description,
        rows: opts.rows,
    });
}
