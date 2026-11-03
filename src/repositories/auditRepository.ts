import { query } from "#database";

export interface AuditLogInput {
    guildId: string | null;
    actorId: string | null;
    action: string;
    details?: unknown;
}

export interface AuditLogRecord {
    id: string;
    guildId: string | null;
    actorId: string | null;
    action: string;
    details: unknown;
    createdAt: number;
}

export async function insertAuditLog(entry: AuditLogInput, createdAt: number): Promise<void> {
    await query(
        "INSERT INTO audit_log (guild_id, actor_id, action, details, created_at) VALUES ($1, $2, $3, $4, $5)",
        [entry.guildId, entry.actorId, entry.action, entry.details === undefined ? null : JSON.stringify(entry.details), createdAt],
    );
}

export async function listAuditLog(guildId: string, limit = 50): Promise<AuditLogRecord[]> {
    const result = await query<{ id: string; guild_id: string | null; actor_id: string | null; action: string; details: unknown; created_at: string }>(
        "SELECT * FROM audit_log WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2",
        [guildId, limit],
    );
    return result.rows.map((row) => ({
        id: String(row.id),
        guildId: row.guild_id,
        actorId: row.actor_id,
        action: row.action,
        details: row.details,
        createdAt: Number(row.created_at),
    }));
}
