import { createEvent } from "#base";
import { COLORS } from "../../../lib/branding.js";
import { emoji } from "../../../lib/emojis.js";
import { logContainer, sendServerLog } from "../../../modules/logs/eventLogger.js";
import { t } from "../../../lib/i18n.js";

createEvent({
    name: "Log voice state changes",
    event: "voiceStateUpdate",
    async run(oldState, newState) {
        const guildId = newState.guild.id;
        const userId = newState.id;
        const roleIds = newState.member?.roles.cache.map((role) => role.id);

        if (!oldState.channelId && newState.channelId) {
            await sendServerLog(newState.client, guildId, "voice", logContainer({
                color: COLORS.success,
                title: `${emoji.voice} ${t("Entrou em voz")}`,
                description: t("{user} entrou em {channel}", { user: `<@${userId}>`, channel: `<#${newState.channelId}>` }),
            }), { ignoreChannelId: newState.channelId, memberRoleIds: roleIds });
            return;
        }
        if (oldState.channelId && !newState.channelId) {
            await sendServerLog(newState.client, guildId, "voice", logContainer({
                color: COLORS.danger,
                title: `${emoji.voice} ${t("Saiu de voz")}`,
                description: t("{user} saiu de {channel}", { user: `<@${userId}>`, channel: `<#${oldState.channelId}>` }),
            }), { ignoreChannelId: oldState.channelId, memberRoleIds: roleIds });
            return;
        }
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            await sendServerLog(newState.client, guildId, "voice", logContainer({
                color: COLORS.info,
                title: `${emoji.voice} ${t("Mudou de canal de voz")}`,
                description: `<@${userId}>: <#${oldState.channelId}> → <#${newState.channelId}>`,
            }), { ignoreChannelId: newState.channelId, memberRoleIds: roleIds });
        }
    },
});
