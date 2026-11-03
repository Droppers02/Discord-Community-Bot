import { query, queryOne } from "#database";

// Perfil (bio, cor, aniversário, jogo favorito), amizades e casamentos.

export interface MemberProfile {
    bio: string | null;
    color: string | null;
    birthday: string | null;
    favorite_game: string | null;
}

export async function getProfile(guildId: string, userId: string): Promise<MemberProfile> {
    const row = await queryOne<Record<string, unknown>>("SELECT bio, color, birthday, favorite_game FROM member_profiles WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    return {
        bio: (row?.bio as string | null) ?? null,
        color: (row?.color as string | null) ?? null,
        birthday: (row?.birthday as string | null) ?? null,
        favorite_game: (row?.favorite_game as string | null) ?? null,
    };
}

export async function saveProfile(guildId: string, userId: string, profile: MemberProfile): Promise<void> {
    await query(
        `INSERT INTO member_profiles (guild_id, user_id, bio, color, birthday, favorite_game, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET bio = $3, color = $4, birthday = $5, favorite_game = $6, updated_at = $7`,
        [guildId, userId, profile.bio, profile.color, profile.birthday, profile.favorite_game, Date.now()],
    );
}

/** Membros que fazem anos neste dia ("DD/MM"). */
export async function birthdaysOn(guildId: string, dayMonth: string): Promise<string[]> {
    const result = await query<{ user_id: string }>("SELECT user_id FROM member_profiles WHERE guild_id = $1 AND birthday = $2", [guildId, dayMonth]);
    return result.rows.map((row) => row.user_id);
}

// ─── Amizades ────────────────────────────────────────────────────────────────

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export interface Friendship { other: string; status: "pending" | "accepted"; requester_id: string; created_at: number }

export async function friendshipsOf(guildId: string, userId: string): Promise<Friendship[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT user_a, user_b, status, requester_id, created_at FROM friendships WHERE guild_id = $1 AND (user_a = $2 OR user_b = $2) ORDER BY created_at DESC",
        [guildId, userId],
    );
    return result.rows.map((row) => ({
        other: row.user_a === userId ? String(row.user_b) : String(row.user_a),
        status: row.status === "accepted" ? "accepted" : "pending",
        requester_id: String(row.requester_id),
        created_at: Number(row.created_at),
    }));
}

export async function getFriendship(guildId: string, a: string, b: string): Promise<{ status: string; requester_id: string } | null> {
    const [x, y] = pair(a, b);
    return queryOne<{ status: string; requester_id: string }>("SELECT status, requester_id FROM friendships WHERE guild_id = $1 AND user_a = $2 AND user_b = $3", [guildId, x, y]);
}

export async function requestFriend(guildId: string, from: string, to: string): Promise<void> {
    const [x, y] = pair(from, to);
    await query(
        "INSERT INTO friendships (guild_id, user_a, user_b, requester_id, status, created_at) VALUES ($1, $2, $3, $4, 'pending', $5) ON CONFLICT DO NOTHING",
        [guildId, x, y, from, Date.now()],
    );
}

export async function acceptFriend(guildId: string, a: string, b: string): Promise<boolean> {
    const [x, y] = pair(a, b);
    const result = await query("UPDATE friendships SET status = 'accepted', created_at = $4 WHERE guild_id = $1 AND user_a = $2 AND user_b = $3 AND status = 'pending'", [guildId, x, y, Date.now()]);
    return (result.rowCount ?? 0) > 0;
}

export async function removeFriend(guildId: string, a: string, b: string): Promise<boolean> {
    const [x, y] = pair(a, b);
    const result = await query("DELETE FROM friendships WHERE guild_id = $1 AND user_a = $2 AND user_b = $3", [guildId, x, y]);
    return (result.rowCount ?? 0) > 0;
}

// ─── Casamentos ──────────────────────────────────────────────────────────────

export interface Marriage { partner: string; ring_tier: number; married_at: number }

export async function marriageOf(guildId: string, userId: string): Promise<Marriage | null> {
    const row = await queryOne<Record<string, unknown>>(
        "SELECT user_a, user_b, ring_tier, married_at FROM marriages WHERE guild_id = $1 AND (user_a = $2 OR user_b = $2)",
        [guildId, userId],
    );
    if (!row) return null;
    return { partner: row.user_a === userId ? String(row.user_b) : String(row.user_a), ring_tier: Number(row.ring_tier), married_at: Number(row.married_at) };
}

export async function marry(guildId: string, a: string, b: string): Promise<void> {
    const [x, y] = pair(a, b);
    await query("INSERT INTO marriages (guild_id, user_a, user_b, ring_tier, married_at) VALUES ($1, $2, $3, 1, $4)", [guildId, x, y, Date.now()]);
}

export async function divorce(guildId: string, userId: string): Promise<boolean> {
    const result = await query("DELETE FROM marriages WHERE guild_id = $1 AND (user_a = $2 OR user_b = $2)", [guildId, userId]);
    return (result.rowCount ?? 0) > 0;
}

export async function setRingTier(guildId: string, userId: string, tier: number): Promise<void> {
    await query("UPDATE marriages SET ring_tier = $3 WHERE guild_id = $1 AND (user_a = $2 OR user_b = $2)", [guildId, userId, tier]);
}

/** Casamentos que fazem "mesversário" hoje e ainda não foram celebrados. */
export async function dueAnniversaries(now: number): Promise<Array<{ guild_id: string; user_a: string; user_b: string; married_at: number; ring_tier: number }>> {
    const result = await query<Record<string, unknown>>("SELECT guild_id, user_a, user_b, married_at, ring_tier, last_anniversary_at FROM marriages");
    return result.rows
        .map((row) => ({ guild_id: String(row.guild_id), user_a: String(row.user_a), user_b: String(row.user_b), married_at: Number(row.married_at), ring_tier: Number(row.ring_tier), last: Number(row.last_anniversary_at) }))
        .filter((row) => {
            const married = new Date(row.married_at);
            const today = new Date(now);
            const months = (today.getUTCFullYear() - married.getUTCFullYear()) * 12 + today.getUTCMonth() - married.getUTCMonth();
            return months >= 1 && today.getUTCDate() === married.getUTCDate() && now - row.last > 20 * 86_400_000;
        });
}

export async function markAnniversary(guildId: string, a: string, b: string, now: number): Promise<void> {
    await query("UPDATE marriages SET last_anniversary_at = $4 WHERE guild_id = $1 AND user_a = $2 AND user_b = $3", [guildId, a, b, now]);
}
