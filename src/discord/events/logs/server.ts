import { createEvent } from "#base";
import { COLORS } from "../../../lib/branding.js";
import { emoji } from "../../../lib/emojis.js";
import { logContainer, sendServerLog } from "../../../modules/logs/eventLogger.js";
import { t } from "../../../lib/i18n.js";

createEvent({
    name: "Log server updates",
    event: "guildUpdate",
    async run(oldGuild, newGuild) {
        const changes: string[] = [];
        if (oldGuild.name !== newGuild.name) changes.push(`${t("Nome:")} \`${oldGuild.name}\` → \`${newGuild.name}\``);
        if (oldGuild.iconURL() !== newGuild.iconURL()) changes.push(t("Ícone alterado"));
        if (oldGuild.ownerId !== newGuild.ownerId) changes.push(`${t("Dono:")} <@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`);
        if (changes.length === 0) return;
        await sendServerLog(newGuild.client, newGuild.id, "server", logContainer({
            color: COLORS.info,
            title: `${emoji.settings} ${t("Servidor atualizado")}`,
            fields: [{ name: t("Alterações"), value: changes.join("\n").slice(0, 1024) }],
        }));
    },
});

createEvent({
    name: "Log invite creation",
    event: "inviteCreate",
    async run(invite) {
        if (!invite.guild) return;
        await sendServerLog(invite.client, invite.guild.id, "server", logContainer({
            color: COLORS.success,
            title: `${emoji.add} ${t("Convite criado")}`,
            description: `\`${invite.code}\`${invite.inviter ? ` • por <@${invite.inviter.id}>` : ""}`,
            fields: [
                { name: t("Canal"), value: invite.channelId ? `<#${invite.channelId}>` : "—" },
                { name: t("Expira"), value: invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : "Nunca" },
            ],
        }));
    },
});

createEvent({
    name: "Log invite deletion",
    event: "inviteDelete",
    async run(invite) {
        if (!invite.guild) return;
        await sendServerLog(invite.client, invite.guild.id, "server", logContainer({
            color: COLORS.danger,
            title: `${emoji.close} ${t("Convite apagado")}`,
            description: `\`${invite.code}\``,
        }));
    },
});

createEvent({
    name: "Log emoji creation",
    event: "emojiCreate",
    async run(emojiCreated) {
        await sendServerLog(emojiCreated.client, emojiCreated.guild.id, "server", logContainer({
            color: COLORS.success,
            title: `${emoji.star} ${t("Emoji criado")}`,
            description: `${emojiCreated} \`:${emojiCreated.name}:\``,
            thumbnailUrl: emojiCreated.imageURL(),
        }));
    },
});

createEvent({
    name: "Log emoji deletion",
    event: "emojiDelete",
    async run(emojiDeleted) {
        await sendServerLog(emojiDeleted.client, emojiDeleted.guild.id, "server", logContainer({
            color: COLORS.danger,
            title: `${emoji.close} ${t("Emoji apagado")}`,
            description: `\`:${emojiDeleted.name}:\``,
        }));
    },
});

createEvent({
    name: "Log emoji renames",
    event: "emojiUpdate",
    async run(oldEmoji, newEmoji) {
        if (oldEmoji.name === newEmoji.name) return;
        await sendServerLog(newEmoji.client, newEmoji.guild.id, "server", logContainer({
            color: COLORS.info,
            title: `${emoji.rename} ${t("Emoji renomeado")}`,
            description: `${newEmoji} \`:${oldEmoji.name}:\` → \`:${newEmoji.name}:\``,
        }));
    },
});
