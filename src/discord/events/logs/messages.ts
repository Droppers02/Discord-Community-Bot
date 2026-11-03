import { createEvent } from "#base";
import { ButtonBuilder, ButtonStyle } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { row } from "../../../lib/containers.js";
import { emoji } from "../../../lib/emojis.js";
import { logContainer, sendServerLog } from "../../../modules/logs/eventLogger.js";
import { t } from "../../../lib/i18n.js";

function truncate(value: string | null | undefined, max = 1000): string {
    const text = (value ?? "").trim();
    if (!text) return t("*Sem conteúdo de texto*");
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function goToMessageRow(url: string) {
    return row(new ButtonBuilder().setLabel(t("Ir para a mensagem")).setEmoji(emoji.link).setStyle(ButtonStyle.Link).setURL(url));
}

createEvent({
    name: "Log message deletions",
    event: "messageDelete",
    async run(message) {
        if (!message.guildId || message.author?.bot) return;
        await sendServerLog(message.client, message.guildId, "messages", logContainer({
            color: COLORS.danger,
            title: `${emoji.trash} ${t("Mensagem apagada")}`,
            description: `${t("Em {channel}", { channel: `<#${message.channelId}>` })}${message.author ? ` • ${t("por {user}", { user: `<@${message.author.id}>` })}` : ""}`,
            fields: [{ name: t("Conteúdo"), value: truncate(message.content) }],
        }), { ignoreChannelId: message.channelId, memberRoleIds: message.member?.roles.cache.map((role) => role.id) });
    },
});

createEvent({
    name: "Log message edits",
    event: "messageUpdate",
    async run(oldMessage, newMessage) {
        if (!newMessage.guildId || newMessage.author?.bot) return;
        if ((oldMessage.content ?? "") === (newMessage.content ?? "")) return;
        const url = `https://discord.com/channels/${newMessage.guildId}/${newMessage.channelId}/${newMessage.id}`;
        await sendServerLog(newMessage.client, newMessage.guildId, "messages", logContainer({
            color: COLORS.warning,
            title: `${emoji.edit} ${t("Mensagem editada")}`,
            description: `${t("Em {channel}", { channel: `<#${newMessage.channelId}>` })}${newMessage.author ? ` • ${t("por {user}", { user: `<@${newMessage.author.id}>` })}` : ""}`,
            fields: [
                { name: t("Antes"), value: truncate(oldMessage.content) },
                { name: t("Depois"), value: truncate(newMessage.content) },
            ],
            rows: [goToMessageRow(url)],
        }), { ignoreChannelId: newMessage.channelId, memberRoleIds: newMessage.member?.roles.cache.map((role) => role.id) });
    },
});

createEvent({
    name: "Log bulk message deletions",
    event: "messageDeleteBulk",
    async run(messages, channel) {
        if (!channel || channel.isDMBased()) return;
        const first = messages.first();
        const guildId = first?.guildId ?? ("guild" in channel && channel.guild ? channel.guild.id : null);
        if (!guildId) return;
        await sendServerLog(channel.client, guildId, "messages", logContainer({
            color: COLORS.danger,
            title: `${emoji.trash} ${t("Limpeza de mensagens")}`,
            description: t("{count, plural, one {**#** mensagem apagada} other {**#** mensagens apagadas}} em {channel}.", { count: messages.size, channel: `<#${channel.id}>` }),
        }), { ignoreChannelId: channel.id });
    },
});
