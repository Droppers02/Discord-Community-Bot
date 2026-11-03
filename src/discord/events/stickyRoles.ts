import { createEvent } from "#base";
import { logger } from "../../lib/logger.js";
import { COLORS } from "../../lib/branding.js";
import { e } from "../../lib/emojis.js";
import { getRoleSettings } from "../../modules/roles/roleSettings.js";
import { logContainer, sendServerLog } from "../../modules/logs/eventLogger.js";
import { deleteMemberRolesBackup, findMemberRolesBackup, saveMemberRolesBackup } from "../../repositories/roleRepository.js";
import { t } from "../../lib/i18n.js";

// Sticky roles: quando um membro sai, guardamos os cargos dele que o servidor marcou
// como persistentes; quando volta, devolvemos-lhos automaticamente. A lista de cargos
// a persistir é escolhida explicitamente pelo servidor (nunca "todos os cargos").

createEvent({
    name: "Sticky roles: snapshot à saída",
    event: "guildMemberRemove",
    async run(member) {
        try {
            const settings = await getRoleSettings(member.guild.id);
            if (!settings.sticky_enabled || settings.sticky_roles.length === 0) return;

            const kept = member.roles.cache
                .filter((role) => settings.sticky_roles.includes(role.id))
                .map((role) => role.id);
            if (kept.length === 0) return;

            await saveMemberRolesBackup({
                guild_id: member.guild.id,
                user_id: member.id,
                role_ids: kept,
                left_at: Date.now(),
            });
        } catch (error) {
            logger.warn("Sticky roles: falha ao guardar snapshot:", error);
        }
    },
});

createEvent({
    name: "Sticky roles: repor ao regressar",
    event: "guildMemberAdd",
    async run(member) {
        try {
            const settings = await getRoleSettings(member.guild.id);
            if (!settings.sticky_enabled) return;

            const backup = await findMemberRolesBackup(member.guild.id, member.id);
            if (!backup || backup.role_ids.length === 0) return;

            // Só devolve cargos que continuam marcados como sticky E ainda existem —
            // a config pode ter mudado enquanto o membro esteve fora.
            const toRestore = backup.role_ids.filter(
                (roleId) => settings.sticky_roles.includes(roleId) && member.guild.roles.cache.has(roleId),
            );
            await deleteMemberRolesBackup(member.guild.id, member.id);
            if (toRestore.length === 0) return;

            await member.roles.add(toRestore, t("Sticky roles: cargos repostos ao regressar"));
            await sendServerLog(member.client, member.guild.id, "members", logContainer({
                color: COLORS.success,
                title: `${e("role")} ${t("Cargos repostos")}`,
                description: t("{user} voltou ao servidor e recuperou {count, plural, one {# cargo} other {# cargos}}: {roles}", { user: `<@${member.id}>`, count: toRestore.length, roles: toRestore.map((id) => `<@&${id}>`).join(" ") }),
            }));
        } catch (error) {
            logger.warn("Sticky roles: falha ao repor cargos:", error);
        }
    },
});
