import { createEvent } from "#base";
import { AuditLogEvent } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { emoji } from "../../../lib/emojis.js";
import { executorField, fetchAuditExecutor, logContainer, sendServerLog } from "../../../modules/logs/eventLogger.js";
import { t } from "../../../lib/i18n.js";

createEvent({
    name: "Log role creation",
    event: "roleCreate",
    async run(role) {
        const executor = await fetchAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
        await sendServerLog(role.client, role.guild.id, "roles", logContainer({
            color: COLORS.success,
            title: `${emoji.role} ${t("Cargo criado")}`,
            description: `<@&${role.id}> (\`${role.name}\`)`,
            fields: [executorField(executor)],
        }));
    },
});

createEvent({
    name: "Log role deletion",
    event: "roleDelete",
    async run(role) {
        const executor = await fetchAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
        await sendServerLog(role.client, role.guild.id, "roles", logContainer({
            color: COLORS.danger,
            title: `${emoji.trash} ${t("Cargo apagado")}`,
            description: `\`${role.name}\``,
            fields: [executorField(executor)],
        }));
    },
});

createEvent({
    name: "Log role updates",
    event: "roleUpdate",
    async run(oldRole, newRole) {
        const changes: string[] = [];
        if (oldRole.name !== newRole.name) changes.push(`${t("Nome:")} \`${oldRole.name}\` → \`${newRole.name}\``);
        if (oldRole.hexColor !== newRole.hexColor) changes.push(`${t("Cor:")} \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
        if (oldRole.hoist !== newRole.hoist) changes.push(`${t("Mostrar separado:")} **${newRole.hoist ? t("Sim") : t("Não")}**`);
        if (oldRole.mentionable !== newRole.mentionable) changes.push(`${t("Mencionável:")} **${newRole.mentionable ? t("Sim") : t("Não")}**`);
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push(t("Permissões alteradas"));
        if (changes.length === 0) return;

        const executor = await fetchAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
        await sendServerLog(newRole.client, newRole.guild.id, "roles", logContainer({
            color: COLORS.info,
            title: `${emoji.settings} ${t("Cargo atualizado")}`,
            description: `<@&${newRole.id}>`,
            fields: [{ name: t("Alterações"), value: changes.join("\n").slice(0, 1024) }, executorField(executor)],
        }));
    },
});
