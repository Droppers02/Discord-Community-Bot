import { query, queryOne } from "#database";

// Notas pessoais e AFK.

export interface PersonalNote {
    id: number;
    title: string;
    content: string;
    created_at: number;
}

export async function addNote(guildId: string, userId: string, title: string, content: string): Promise<number> {
    const row = await queryOne<{ id: string }>(
        "INSERT INTO personal_notes (guild_id, user_id, title, content, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [guildId, userId, title, content, Date.now()],
    );
    return Number(row?.id ?? 0);
}

export async function listNotes(guildId: string, userId: string): Promise<PersonalNote[]> {
    const result = await query<Record<string, unknown>>(
        "SELECT id, title, content, created_at FROM personal_notes WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 25",
        [guildId, userId],
    );
    return result.rows.map((row) => ({ id: Number(row.id), title: String(row.title), content: String(row.content), created_at: Number(row.created_at) }));
}

export async function countNotes(guildId: string, userId: string): Promise<number> {
    const row = await queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM personal_notes WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    return Number(row?.n ?? 0);
}

export async function deleteNote(guildId: string, userId: string, id: number): Promise<boolean> {
    const result = await query("DELETE FROM personal_notes WHERE guild_id = $1 AND user_id = $2 AND id = $3", [guildId, userId, id]);
    return (result.rowCount ?? 0) > 0;
}

// ─── AFK ─────────────────────────────────────────────────────────────────────

export interface AfkEntry {
    user_id: string;
    reason: string;
    since: number;
    mentions: number;
}

export async function setAfk(guildId: string, userId: string, reason: string): Promise<void> {
    await query(
        `INSERT INTO afk_status (guild_id, user_id, reason, since, mentions) VALUES ($1, $2, $3, $4, 0)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = $3, since = $4, mentions = 0`,
        [guildId, userId, reason, Date.now()],
    );
}

export async function getAfk(guildId: string, userIds: string[]): Promise<AfkEntry[]> {
    if (!userIds.length) return [];
    const result = await query<Record<string, unknown>>("SELECT user_id, reason, since, mentions FROM afk_status WHERE guild_id = $1 AND user_id = ANY($2)", [guildId, userIds]);
    return result.rows.map((row) => ({ user_id: String(row.user_id), reason: String(row.reason), since: Number(row.since), mentions: Number(row.mentions) }));
}

export async function bumpAfkMentions(guildId: string, userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    await query("UPDATE afk_status SET mentions = mentions + 1 WHERE guild_id = $1 AND user_id = ANY($2)", [guildId, userIds]);
}

export async function clearAfk(guildId: string, userId: string): Promise<AfkEntry | null> {
    const row = await queryOne<Record<string, unknown>>("DELETE FROM afk_status WHERE guild_id = $1 AND user_id = $2 RETURNING user_id, reason, since, mentions", [guildId, userId]);
    return row ? { user_id: String(row.user_id), reason: String(row.reason), since: Number(row.since), mentions: Number(row.mentions) } : null;
}
