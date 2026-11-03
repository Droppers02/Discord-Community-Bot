import { ButtonBuilder, ButtonStyle, ChannelType, MediaGalleryBuilder, MediaGalleryItemBuilder, ModalBuilder, type Message, type MessageReaction, type PartialMessageReaction, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { getSettings, saveSettings } from "../../repositories/systemSettingsRepository.js";
import { backToHubRow, channelSelect, onOff, optionButton, showChannel, textField, toggleButton } from "../config/panelKit.js";

// Starboard (do bot antigo): mensagens com X reações ⭐ (ou outro emoji) vão para um canal de
// destaque, com a contagem sempre atualizada. Se baixar do mínimo, sai do quadro.

export interface StarboardSettings {
    enabled: boolean;
    channel: string | null;
    threshold: number;
    /** Emoji unicode ("⭐") ou id de um emoji do servidor. */
    emoji: string;
    self_star: boolean;
    ignored_channels: string[];
}

export function buildStarboardDefaults(): StarboardSettings {
    return { enabled: false, channel: null, threshold: 3, emoji: "⭐", self_star: false, ignored_channels: [] };
}

export function normalizeStarboard(value: StarboardSettings): StarboardSettings {
    const threshold = Number(value.threshold);
    return {
        enabled: value.enabled === true,
        channel: typeof value.channel === "string" && /^\d{5,25}$/.test(value.channel) ? value.channel : null,
        threshold: Number.isFinite(threshold) ? Math.max(1, Math.min(100, Math.round(threshold))) : 3,
        emoji: typeof value.emoji === "string" && value.emoji.trim() ? value.emoji.trim().slice(0, 64) : "⭐",
        self_star: value.self_star === true,
        ignored_channels: Array.isArray(value.ignored_channels) ? value.ignored_channels.filter((id) => typeof id === "string" && /^\d{5,25}$/.test(id)).slice(0, 25) : [],
    };
}

export const getStarboardSettings = (guildId: string) => getSettings("starboard_settings", guildId, buildStarboardDefaults(), normalizeStarboard);
export const saveStarboardSettings = (guildId: string, patch: Partial<StarboardSettings>) => saveSettings("starboard_settings", guildId, patch, buildStarboardDefaults(), normalizeStarboard);

function matches(reaction: MessageReaction | PartialMessageReaction, configured: string): boolean {
    const custom = configured.match(/(\d{15,25})>?$/);
    if (custom) return reaction.emoji.id === custom[1];
    return reaction.emoji.name === configured;
}

function emojiLabel(configured: string): string {
    return /^\d{15,25}$/.test(configured) ? `<:e:${configured}>` : configured;
}

function card(message: Message<true>, stars: number, settings: StarboardSettings): ContainerPlusBuilder {
    const image = message.attachments.find((attachment) => attachment.contentType?.startsWith("image/"))?.url
        ?? message.embeds.find((embed) => embed.image?.url)?.image?.url
        ?? null;
    const container = buildContainer({
        color: COLORS.gold,
        title: `${emojiLabel(settings.emoji)} **${stars}** · <#${message.channelId}>`,
        thumbnailUrl: message.author.displayAvatarURL({ size: 128 }),
        description: [`**${message.member?.displayName ?? message.author.username}**`, message.content?.slice(0, 1500) || (image ? "" : t("*[sem texto]*"))].filter(Boolean).join("\n"),
        rows: [row(new ButtonBuilder().setLabel(t("Ir para a mensagem")).setStyle(ButtonStyle.Link).setURL(message.url))],
    });
    if (image) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
    return container;
}

export async function handleStarReaction(reaction: MessageReaction | PartialMessageReaction): Promise<void> {
    const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
    if (!message?.inGuild()) return;
    const settings = await getStarboardSettings(message.guildId);
    if (!settings.enabled || !settings.channel || message.channelId === settings.channel || settings.ignored_channels.includes(message.channelId)) return;
    if (!matches(reaction, settings.emoji)) return;
    const full = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
    if (!full) return;
    const users = await full.users.fetch().catch(() => null);
    const stars = users ? users.filter((user) => !user.bot && (settings.self_star || user.id !== message.author.id)).size : full.count ?? 0;

    const board = message.guild.channels.cache.get(settings.channel);
    if (!board?.isTextBased()) return;
    const existing = await queryOne<{ starboard_message_id: string | null }>("SELECT starboard_message_id FROM starboard_posts WHERE guild_id = $1 AND message_id = $2", [message.guildId, message.id]);
    const posted = existing?.starboard_message_id ? await (board as TextChannel).messages.fetch(existing.starboard_message_id).catch(() => null) : null;

    try {
        if (stars < settings.threshold) {
            if (posted) await posted.delete().catch(() => null);
            if (existing) await query("DELETE FROM starboard_posts WHERE guild_id = $1 AND message_id = $2", [message.guildId, message.id]);
            return;
        }
        if (posted) {
            await posted.edit({ components: [card(message, stars, settings)], allowedMentions: { parse: [] } });
            await query("UPDATE starboard_posts SET stars = $3 WHERE guild_id = $1 AND message_id = $2", [message.guildId, message.id, stars]);
            return;
        }
        const sent = await (board as TextChannel).send({ components: [card(message, stars, settings)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        await query(
            `INSERT INTO starboard_posts (guild_id, message_id, channel_id, author_id, starboard_message_id, stars, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (guild_id, message_id) DO UPDATE SET starboard_message_id = $5, stars = $6`,
            [message.guildId, message.id, message.channelId, message.author.id, sent.id, stars, Date.now()],
        );
    } catch (error) {
        logger.warn("Starboard: falha a atualizar:", error);
    }
}

// ─── /config → Starboard ─────────────────────────────────────────────────────

export const STARBOARD_NS = "starcfg";
const cid = (...parts: string[]) => buildCustomId(STARBOARD_NS, ...parts);

export async function buildStarboardContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getStarboardSettings(guildId);
    return buildContainer({
        color: s.enabled ? COLORS.gold : COLORS.neutral,
        title: `${emoji.star} ${t("Starboard")}`,
        description: t("As mensagens que juntarem reações suficientes vão para o canal de destaque, com a contagem sempre atualizada."),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)}${s.enabled && !s.channel ? ` — ${t("falta escolher o canal")}` : ""}` },
            { name: t("Regras"), value: [t("Canal: {channel}", { channel: showChannel(s.channel) }), t("Emoji: {emoji} · mínimo **{n}** reações", { emoji: emojiLabel(s.emoji), n: s.threshold }), t("Reagir à própria mensagem conta: {state}", { state: onOff(s.self_star) })].join("\n") },
            { name: t("Canais ignorados"), value: s.ignored_channels.length ? s.ignored_channels.map((id) => `<#${id}>`).join(", ") : t("*Nenhum*") },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("rules")).setLabel(t("Emoji e mínimo")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
                optionButton(cid("self"), s.self_star, { enable: t("Contar a própria reação"), disable: t("Não contar a própria reação") }),
            ),
            channelSelect(cid("channel"), t("Canal do starboard"), s.channel, [ChannelType.GuildText]),
            channelSelect(cid("ignore"), t("Canais ignorados (opcional)"), s.ignored_channels, [ChannelType.GuildText, ChannelType.GuildAnnouncement], 25),
            backToHubRow(),
        ],
    });
}

export function buildStarboardRulesModal(s: StarboardSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("rules")).setTitle(t("Starboard")).addLabelComponents(
        textField("emoji", t("Emoji (⭐ ou um emoji do servidor)"), s.emoji, { required: true, max: 64 }),
        textField("threshold", t("Reações mínimas"), String(s.threshold), { required: true, max: 3 }),
    );
}
