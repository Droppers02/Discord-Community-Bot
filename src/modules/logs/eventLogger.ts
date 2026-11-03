import { type AuditLogEvent, type Client, type Guild, type TextChannel, type User } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { buildContainer, type ContainerField, type Row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { logger } from "../../lib/logger.js";
import type { LogCategory } from "../../types.js";
import { getLogSettings } from "./logSettings.js";
import { t } from "../../lib/i18n.js";

/**
 * Best-effort lookup of who performed a moderation/channel/role action via the audit log.
 * Needs the View Audit Log permission; returns null if unavailable or no recent match.
 * A short delay lets Discord finish writing the audit entry before we read it.
 */
export async function fetchAuditExecutor(
    guild: Guild,
    type: AuditLogEvent,
    targetId: string | null,
    withinMs = 10_000,
): Promise<User | null> {
    try {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const logs = await guild.fetchAuditLogs({ type, limit: 6 });
        const entry = logs.entries.find((candidate) => {
            const tid = (candidate.target as { id?: string } | null)?.id;
            return (!targetId || tid === targetId) && (Date.now() - candidate.createdTimestamp) < withinMs;
        });
        return (entry?.executor as User | null) ?? null;
    } catch {
        return null;
    }
}

/** "<@id> (`tag`)" for an executor, or a neutral fallback. */
export function executorField(user: User | null): ContainerField {
    return { name: t("Responsável"), value: user ? `<@${user.id}> (\`${user.tag}\`)` : t("*Desconhecido*") };
}

export interface LogContext {
    /** If this channel is in the guild's ignore list, the event is dropped. */
    ignoreChannelId?: string | null;
    /** If any of these roles is ignored, the event is dropped. */
    memberRoleIds?: string[] | null;
}

export interface LogContainerInput {
    color: number;
    title: string;
    description?: string | null;
    fields?: ContainerField[];
    thumbnailUrl?: string | null;
    rows?: Row[];
}

/** Consistent CV2 log card with a relative-time footer. */
export function logContainer(input: LogContainerInput): ContainerPlusBuilder {
    return buildContainer({
        color: input.color,
        title: input.title,
        description: input.description ?? null,
        fields: input.fields,
        thumbnailUrl: input.thumbnailUrl ?? null,
        footerText: `<t:${Math.floor(Date.now() / 1000)}:f>`,
        rows: input.rows,
    });
}

export async function sendServerLog(
    client: Client,
    guildId: string,
    category: LogCategory,
    container: ContainerPlusBuilder,
    ctx: LogContext = {},
): Promise<void> {
    const settings = await getLogSettings(guildId);
    const conf = settings.categories[category];
    if (!conf.enabled || !conf.channel_id) return;

    if (ctx.ignoreChannelId && settings.ignored_channels.includes(ctx.ignoreChannelId)) return;
    if (ctx.memberRoleIds?.some((roleId) => settings.ignored_roles.includes(roleId))) return;

    try {
        const channel = await client.channels.fetch(conf.channel_id);
        if (!channel?.isTextBased() || channel.isDMBased()) return;
        await (channel as TextChannel).send({ components: [container], flags: CV2_FLAG });
    } catch (error) {
        logger.error(`Falha ao enviar log de servidor (${category}):`, error);
    }
}
