import { query, queryOne } from "#database";
import type { MemberRolesBackup, TempRoleRecord } from "../types.js";

// ─── Cargos temporários ──────────────────────────────────────────────────────

function rowToTempRole(row: Record<string, unknown>): TempRoleRecord {
    return {
        id: row.id as string,
        guild_id: row.guild_id as string,
        user_id: row.user_id as string,
        role_id: row.role_id as string,
        granted_by: row.granted_by as string,
        reason: (row.reason as string) ?? null,
        expires_at: Number(row.expires_at),
        created_at: Number(row.created_at),
    };
}

export async function insertTempRole(record: TempRoleRecord): Promise<void> {
    await query(
        `INSERT INTO temp_roles (id, guild_id, user_id, role_id, granted_by, reason, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [record.id, record.guild_id, record.user_id, record.role_id, record.granted_by, record.reason, record.expires_at, record.created_at],
    );
}

export async function deleteTempRole(id: string): Promise<void> {
    await query("DELETE FROM temp_roles WHERE id = $1", [id]);
}

/** Remove a atribuição temporária de um cargo específico a um utilizador (se existir). */
export async function deleteTempRoleFor(guildId: string, userId: string, roleId: string): Promise<void> {
    await query("DELETE FROM temp_roles WHERE guild_id = $1 AND user_id = $2 AND role_id = $3", [guildId, userId, roleId]);
}

export async function findExpiredTempRoles(now: number, limit = 50): Promise<TempRoleRecord[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT * FROM temp_roles WHERE expires_at <= $1 ORDER BY expires_at ASC LIMIT $2",
        [now, limit],
    );
    return result.rows.map(rowToTempRole);
}

export async function listTempRolesByGuild(guildId: string): Promise<TempRoleRecord[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT * FROM temp_roles WHERE guild_id = $1 ORDER BY expires_at ASC LIMIT 100",
        [guildId],
    );
    return result.rows.map(rowToTempRole);
}

export async function listTempRolesByMember(guildId: string, userId: string): Promise<TempRoleRecord[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT * FROM temp_roles WHERE guild_id = $1 AND user_id = $2 ORDER BY expires_at ASC",
        [guildId, userId],
    );
    return result.rows.map(rowToTempRole);
}

// ─── Sticky roles (backup de cargos à saída) ─────────────────────────────────

export async function saveMemberRolesBackup(backup: MemberRolesBackup): Promise<void> {
    await query(
        `INSERT INTO member_role_backups (guild_id, user_id, role_ids, left_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET role_ids = $3, left_at = $4`,
        [backup.guild_id, backup.user_id, JSON.stringify(backup.role_ids), backup.left_at],
    );
}

export async function findMemberRolesBackup(guildId: string, userId: string): Promise<MemberRolesBackup | null> {
    const row = await queryOne<Record<string, unknown>>(
        "SELECT * FROM member_role_backups WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId],
    );
    if (!row) return null;
    const roleIds = Array.isArray(row.role_ids) ? (row.role_ids as string[]) : [];
    return { guild_id: row.guild_id as string, user_id: row.user_id as string, role_ids: roleIds, left_at: Number(row.left_at) };
}

export async function deleteMemberRolesBackup(guildId: string, userId: string): Promise<void> {
    await query("DELETE FROM member_role_backups WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
}
