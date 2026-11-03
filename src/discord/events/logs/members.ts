import { createEvent } from "#base";
import { AuditLogEvent } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { emoji } from "../../../lib/emojis.js";
import { executorField, fetchAuditExecutor, logContainer, sendServerLog } from "../../../modules/logs/eventLogger.js";
import { t } from "../../../lib/i18n.js";

// Note: member join/leave are handled by the dedicated Entrada/Saída system
// (src/discord/events/joinLeaveLog.ts), not the MEE6-style "members" category.

createEvent({
    name: "Log member updates",
    event: "guildMemberUpdate",
    async run(oldMember, newMember) {
        const guildId = newMember.guild.id;
        const roleIds = newMember.roles.cache.map((role) => role.id);

        // Nickname change
        if (oldMember.nickname !== newMember.nickname) {
            await sendServerLog(newMember.client, guildId, "members", logContainer({
                color: COLORS.info,
                title: `${emoji.rename} ${t("Nickname alterado")}`,
                description: `<@${newMember.id}>`,
                fields: [
                    { name: t("Antes"), value: oldMember.nickname ?? t("*Nenhum*") },
                    { name: t("Depois"), value: newMember.nickname ?? t("*Nenhum*") },
                ],
            }), { memberRoleIds: roleIds });
        }

        // Role changes
        const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
        const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
        if (added.size || removed.size) {
            const fields = [];
            if (added.size) fields.push({ name: t("Cargos adicionados"), value: added.map((role) => `<@&${role.id}>`).join(", ").slice(0, 1024) });
            if (removed.size) fields.push({ name: t("Cargos removidos"), value: removed.map((role) => `<@&${role.id}>`).join(", ").slice(0, 1024) });
            await sendServerLog(newMember.client, guildId, "members", logContainer({
                color: COLORS.info,
                title: `${emoji.role} ${t("Cargos atualizados")}`,
                description: `<@${newMember.id}>`,
                fields,
            }), { memberRoleIds: roleIds });
        }

        // Timeout (communication disabled) → moderation category
        const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? 0;
        const newTimeout = newMember.communicationDisabledUntilTimestamp ?? 0;
        if (oldTimeout !== newTimeout) {
            const active = newTimeout > Date.now();
            const executor = await fetchAuditExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
            await sendServerLog(newMember.client, guildId, "moderation", logContainer({
                color: active ? COLORS.warning : COLORS.success,
                title: `${emoji.timeout} ${active ? t("Timeout aplicado") : t("Timeout removido")}`,
                description: `<@${newMember.id}> (\`${newMember.user.tag}\`)`,
                fields: [
                    ...(active ? [{ name: t("Termina"), value: `<t:${Math.floor(newTimeout / 1000)}:R>` }] : []),
                    executorField(executor),
                ],
            }), { memberRoleIds: roleIds });
        }
    },
});
