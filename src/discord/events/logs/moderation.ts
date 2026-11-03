import { createEvent } from "#base";
import { AuditLogEvent } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { emoji } from "../../../lib/emojis.js";
import { executorField, fetchAuditExecutor, logContainer, sendServerLog } from "../../../modules/logs/eventLogger.js";
import { t } from "../../../lib/i18n.js";

createEvent({
    name: "Log bans",
    event: "guildBanAdd",
    async run(ban) {
        const executor = await fetchAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        await sendServerLog(ban.client, ban.guild.id, "moderation", logContainer({
            color: COLORS.danger,
            title: `${emoji.ban} ${t("Membro banido")}`,
            description: `<@${ban.user.id}> (\`${ban.user.tag}\`)`,
            thumbnailUrl: ban.user.displayAvatarURL(),
            fields: [
                executorField(executor),
                ...(ban.reason ? [{ name: t("Motivo"), value: ban.reason.slice(0, 1024) }] : []),
            ],
        }));
    },
});

createEvent({
    name: "Log unbans",
    event: "guildBanRemove",
    async run(ban) {
        const executor = await fetchAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
        await sendServerLog(ban.client, ban.guild.id, "moderation", logContainer({
            color: COLORS.success,
            title: `${emoji.unlock} ${t("Ban removido")}`,
            description: `<@${ban.user.id}> (\`${ban.user.tag}\`)`,
            thumbnailUrl: ban.user.displayAvatarURL(),
            fields: [executorField(executor)],
        }));
    },
});
