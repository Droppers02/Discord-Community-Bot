import { createEvent } from "#base";
import { AuditLogEvent, ChannelType, type GuildChannel, type NonThreadGuildBasedChannel } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { emoji } from "../../../lib/emojis.js";
import { executorField, fetchAuditExecutor, logContainer, sendServerLog } from "../../../modules/logs/eventLogger.js";
import { t, tk } from "../../../lib/i18n.js";

// Nome "leigo" do tipo de canal (em vez do identificador técnico GuildText/GuildVoice…).
const CHANNEL_KIND_LABELS: Partial<Record<ChannelType, string>> = {
    [ChannelType.GuildText]: tk("Canal de texto"),
    [ChannelType.GuildVoice]: tk("Canal de voz"),
    [ChannelType.GuildCategory]: tk("Categoria"),
    [ChannelType.GuildAnnouncement]: tk("Canal de anúncios"),
    [ChannelType.GuildStageVoice]: tk("Palco"),
    [ChannelType.GuildForum]: tk("Fórum"),
    [ChannelType.GuildMedia]: tk("Canal de média"),
    [ChannelType.PublicThread]: tk("Thread pública"),
    [ChannelType.PrivateThread]: tk("Thread privada"),
    [ChannelType.AnnouncementThread]: tk("Thread de anúncios"),
};

function channelKind(channel: GuildChannel): string {
    return t(CHANNEL_KIND_LABELS[channel.type] ?? tk("Canal"));
}

function isGuildChannel(channel: unknown): channel is NonThreadGuildBasedChannel {
    return typeof channel === "object" && channel !== null && "guild" in channel;
}

createEvent({
    name: "Log channel creation",
    event: "channelCreate",
    async run(channel) {
        const executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
        await sendServerLog(channel.client, channel.guild.id, "channels", logContainer({
            color: COLORS.success,
            title: `${emoji.channel} ${t("Canal criado")}`,
            description: `${channel} (\`${channel.name}\`)`,
            fields: [{ name: t("Tipo"), value: channelKind(channel) }, executorField(executor)],
        }));
    },
});

createEvent({
    name: "Log channel deletion",
    event: "channelDelete",
    async run(channel) {
        if (!isGuildChannel(channel)) return;
        const executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
        await sendServerLog(channel.client, channel.guild.id, "channels", logContainer({
            color: COLORS.danger,
            title: `${emoji.trash} ${t("Canal apagado")}`,
            description: `\`${channel.name}\``,
            fields: [{ name: t("Tipo"), value: channelKind(channel) }, executorField(executor)],
        }));
    },
});

createEvent({
    name: "Log channel renames",
    event: "channelUpdate",
    async run(oldChannel, newChannel) {
        if (!isGuildChannel(oldChannel) || !isGuildChannel(newChannel)) return;
        if (oldChannel.name === newChannel.name) return;
        const executor = await fetchAuditExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
        await sendServerLog(newChannel.client, newChannel.guild.id, "channels", logContainer({
            color: COLORS.info,
            title: `${emoji.rename} ${t("Canal renomeado")}`,
            description: `${newChannel}`,
            fields: [
                { name: t("Antes"), value: `\`${oldChannel.name}\`` },
                { name: t("Depois"), value: `\`${newChannel.name}\`` },
                executorField(executor),
            ],
        }));
    },
});
