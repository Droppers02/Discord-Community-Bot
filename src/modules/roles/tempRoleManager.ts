import { randomUUID } from "node:crypto";
import type { Client, Guild } from "discord.js";
import { logger } from "../../lib/logger.js";
import { COLORS } from "../../lib/branding.js";
import { e } from "../../lib/emojis.js";
import { logContainer, sendServerLog } from "../logs/eventLogger.js";
import { deleteTempRole, deleteTempRoleFor, findExpiredTempRoles, insertTempRole, listTempRolesByGuild, listTempRolesByMember } from "../../repositories/roleRepository.js";
import type { TempRoleRecord } from "../../types.js";
import { t } from "../../lib/i18n.js";

// Cargos temporários: atribuição com prazo (warns temporários, VIP por tempo, castigos).
// Um sweep periódico único (não um timer por registo) remove os expirados — sobrevive a
// restarts porque a verdade está na tabela temp_roles, não em timers.

const SWEEP_INTERVAL_MS = 60_000;
let sweepTimer: NodeJS.Timeout | null = null;

export interface ApplyTempRoleInput {
    guildId: string;
    userId: string;
    roleId: string;
    grantedBy: string;
    reason: string | null;
    durationMs: number;
}

/** Atribui o cargo no Discord e regista a expiração. Substitui um registo anterior do mesmo cargo. */
export async function applyTempRole(guild: Guild, input: ApplyTempRoleInput): Promise<TempRoleRecord> {
    const member = await guild.members.fetch(input.userId);
    await member.roles.add(input.roleId, input.reason ?? t("Cargo temporário (por {user})", { user: input.grantedBy }));

    // Um só registo por (guild, user, role): renovar substitui o prazo anterior.
    await deleteTempRoleFor(input.guildId, input.userId, input.roleId);

    const record: TempRoleRecord = {
        id: randomUUID(),
        guild_id: input.guildId,
        user_id: input.userId,
        role_id: input.roleId,
        granted_by: input.grantedBy,
        reason: input.reason,
        expires_at: Date.now() + input.durationMs,
        created_at: Date.now(),
    };
    await insertTempRole(record);
    return record;
}

/** Remove o cargo e o registo antes do prazo (remoção manual pela staff). */
export async function removeTempRoleEarly(guild: Guild, record: TempRoleRecord): Promise<void> {
    await deleteTempRole(record.id);
    const member = await guild.members.fetch(record.user_id).catch(() => null);
    if (member?.roles.cache.has(record.role_id)) {
        await member.roles.remove(record.role_id, t("Cargo temporário removido pela staff")).catch(() => null);
    }
}

export { listTempRolesByGuild, listTempRolesByMember };

async function sweepExpired(client: Client<true>): Promise<void> {
    const expired = await findExpiredTempRoles(Date.now());
    for (const record of expired) {
        // O registo sai primeiro: se a remoção do cargo falhar (ex.: cargo apagado),
        // não fica um registo eternamente a re-falhar no sweep.
        await deleteTempRole(record.id);
        try {
            const guild = client.guilds.cache.get(record.guild_id);
            if (!guild) continue;
            const member = await guild.members.fetch(record.user_id).catch(() => null);
            if (member?.roles.cache.has(record.role_id)) {
                await member.roles.remove(record.role_id, t("Cargo temporário expirou"));
                await sendServerLog(client, record.guild_id, "moderation", logContainer({
                    color: COLORS.info,
                    title: `${e("timeout")} ${t("Cargo temporário expirou")}`,
                    description: t("{role} removido de {user}.", { role: `<@&${record.role_id}>`, user: `<@${record.user_id}>` }),
                    fields: record.reason ? [{ name: t("Motivo original"), value: record.reason }] : undefined,
                }));
            }
        } catch (error) {
            logger.warn(`Falha ao remover cargo temporário expirado (${record.guild_id}/${record.user_id}):`, error);
        }
    }
}

/** Arranca o sweep periódico de cargos expirados (idempotente). */
export function startTempRoleSweep(client: Client<true>): void {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => void sweepExpired(client).catch((error) => logger.error("Sweep de cargos temporários:", error)), SWEEP_INTERVAL_MS);
    void sweepExpired(client).catch((error) => logger.error("Sweep inicial de cargos temporários:", error));
}
