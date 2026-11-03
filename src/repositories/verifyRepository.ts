import { query } from "#database";

// Quem entrou e ainda não se verificou — só é preciso quando há prazo para expulsar.

export async function addPendingVerification(guildId: string, userId: string, joinedAt = Date.now()): Promise<void> {
    await query(
        "INSERT INTO verify_pending (guild_id, user_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT (guild_id, user_id) DO UPDATE SET joined_at = $3",
        [guildId, userId, joinedAt],
    );
}

export async function removePendingVerification(guildId: string, userId: string): Promise<void> {
    await query("DELETE FROM verify_pending WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
}

export async function listPendingVerifications(): Promise<Array<{ guild_id: string; user_id: string; joined_at: number }>> {
    const result = await query<{ guild_id: string; user_id: string; joined_at: string }>("SELECT guild_id, user_id, joined_at FROM verify_pending");
    return result.rows.map((r) => ({ guild_id: r.guild_id, user_id: r.user_id, joined_at: Number(r.joined_at) }));
}
