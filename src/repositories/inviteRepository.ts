import { query, queryOne } from "#database";

export interface InviteJoin {
    inviter_id: string | null;
    code: string | null;
}

/** Record (or update) who invited a member when they join. */
export async function recordInvitedJoin(guildId: string, memberId: string, inviterId: string | null, code: string | null): Promise<void> {
    await query(
        `INSERT INTO invite_joins (guild_id, member_id, inviter_id, code, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, member_id) DO UPDATE SET inviter_id = $3, code = $4, created_at = $5`,
        [guildId, memberId, inviterId, code, Date.now()],
    );
}

/** Who invited a member (read before removing on leave). */
export async function getInvitedJoin(guildId: string, memberId: string): Promise<InviteJoin | null> {
    return queryOne<InviteJoin>("SELECT inviter_id, code FROM invite_joins WHERE guild_id = $1 AND member_id = $2", [guildId, memberId]);
}

/** Drop a member's attribution (on leave), so the inviter's count goes down. */
export async function removeInvitedJoin(guildId: string, memberId: string): Promise<void> {
    await query("DELETE FROM invite_joins WHERE guild_id = $1 AND member_id = $2", [guildId, memberId]);
}

/** How many still-present members a given inviter brought. */
export async function countInvitesBy(guildId: string, inviterId: string): Promise<number> {
    const row = await queryOne<{ cnt: string }>(
        "SELECT COUNT(*) AS cnt FROM invite_joins WHERE guild_id = $1 AND inviter_id = $2",
        [guildId, inviterId],
    );
    return Number(row?.cnt ?? 0);
}

export interface InviterRank {
    inviter_id: string;
    count: number;
}

/** Top inviters (by still-present invited members), highest first. */
export async function getInviteLeaderboard(guildId: string, limit = 15): Promise<InviterRank[]> {
    const result = await query<{ inviter_id: string; cnt: string }>(
        `SELECT inviter_id, COUNT(*) AS cnt FROM invite_joins
         WHERE guild_id = $1 AND inviter_id IS NOT NULL
         GROUP BY inviter_id ORDER BY cnt DESC, inviter_id ASC LIMIT $2`,
        [guildId, limit],
    );
    return result.rows.map((row) => ({ inviter_id: row.inviter_id, count: Number(row.cnt) }));
}
