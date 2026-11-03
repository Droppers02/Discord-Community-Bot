import { query, queryOne } from "#database";

// Anúncios agendados e lembretes — os dois "disparam" a uma hora e podem repetir.

export const ANNOUNCE_REPEATS = ["none", "daily", "weekly"] as const;
export type AnnounceRepeat = (typeof ANNOUNCE_REPEATS)[number];

export interface ScheduledAnnouncement {
    id: string;
    guild_id: string;
    channel_id: string;
    author_id: string;
    title: string | null;
    content: string;
    mention_role: string | null;
    image_url: string | null;
    send_at: number;
    repeat: AnnounceRepeat;
    created_at: number;
}

export interface Reminder {
    id: string;
    guild_id: string;
    channel_id: string;
    user_id: string;
    content: string;
    remind_at: number;
    repeat_ms: number;
    dm: boolean;
    created_at: number;
}

const toAnnouncement = (row: Record<string, unknown>): ScheduledAnnouncement => ({
    id: String(row.id),
    guild_id: String(row.guild_id),
    channel_id: String(row.channel_id),
    author_id: String(row.author_id),
    title: (row.title as string | null) ?? null,
    content: String(row.content),
    mention_role: (row.mention_role as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    send_at: Number(row.send_at),
    repeat: (row.repeat as AnnounceRepeat) ?? "none",
    created_at: Number(row.created_at),
});

const toReminder = (row: Record<string, unknown>): Reminder => ({
    id: String(row.id),
    guild_id: String(row.guild_id),
    channel_id: String(row.channel_id),
    user_id: String(row.user_id),
    content: String(row.content),
    remind_at: Number(row.remind_at),
    repeat_ms: Number(row.repeat_ms ?? 0),
    dm: Boolean(row.dm),
    created_at: Number(row.created_at),
});

// ─── Anúncios ────────────────────────────────────────────────────────────────

export async function insertAnnouncement(entry: ScheduledAnnouncement): Promise<void> {
    await query(
        `INSERT INTO scheduled_announcements (id, guild_id, channel_id, author_id, title, content, mention_role, image_url, send_at, repeat, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [entry.id, entry.guild_id, entry.channel_id, entry.author_id, entry.title, entry.content, entry.mention_role, entry.image_url, entry.send_at, entry.repeat, entry.created_at],
    );
}

export async function listAnnouncements(guildId: string): Promise<ScheduledAnnouncement[]> {
    const result = await query<Record<string, unknown>>("SELECT * FROM scheduled_announcements WHERE guild_id = $1 ORDER BY send_at ASC LIMIT 25", [guildId]);
    return result.rows.map(toAnnouncement);
}

export async function getAnnouncement(guildId: string, id: string): Promise<ScheduledAnnouncement | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT * FROM scheduled_announcements WHERE guild_id = $1 AND id = $2", [guildId, id]);
    return row ? toAnnouncement(row) : null;
}

export async function dueAnnouncements(now: number): Promise<ScheduledAnnouncement[]> {
    const result = await query<Record<string, unknown>>("SELECT * FROM scheduled_announcements WHERE send_at <= $1 ORDER BY send_at ASC LIMIT 25", [now]);
    return result.rows.map(toAnnouncement);
}

export async function rescheduleAnnouncement(id: string, sendAt: number): Promise<void> {
    await query("UPDATE scheduled_announcements SET send_at = $2 WHERE id = $1", [id, sendAt]);
}

export async function deleteAnnouncement(guildId: string, id: string): Promise<boolean> {
    const result = await query("DELETE FROM scheduled_announcements WHERE guild_id = $1 AND id = $2", [guildId, id]);
    return (result.rowCount ?? 0) > 0;
}

// ─── Lembretes ───────────────────────────────────────────────────────────────

export async function insertReminder(entry: Reminder): Promise<void> {
    await query(
        `INSERT INTO reminders (id, guild_id, channel_id, user_id, content, remind_at, repeat_ms, dm, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [entry.id, entry.guild_id, entry.channel_id, entry.user_id, entry.content, entry.remind_at, entry.repeat_ms, entry.dm, entry.created_at],
    );
}

export async function listReminders(guildId: string, userId: string): Promise<Reminder[]> {
    const result = await query<Record<string, unknown>>("SELECT * FROM reminders WHERE guild_id = $1 AND user_id = $2 ORDER BY remind_at ASC LIMIT 25", [guildId, userId]);
    return result.rows.map(toReminder);
}

export async function countReminders(guildId: string, userId: string): Promise<number> {
    const row = await queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM reminders WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    return Number(row?.n ?? 0);
}

export async function dueReminders(now: number): Promise<Reminder[]> {
    const result = await query<Record<string, unknown>>("SELECT * FROM reminders WHERE remind_at <= $1 ORDER BY remind_at ASC LIMIT 50", [now]);
    return result.rows.map(toReminder);
}

export async function rescheduleReminder(id: string, at: number): Promise<void> {
    await query("UPDATE reminders SET remind_at = $2 WHERE id = $1", [id, at]);
}

export async function deleteReminder(id: string, userId?: string): Promise<boolean> {
    const result = userId
        ? await query("DELETE FROM reminders WHERE id = $1 AND user_id = $2", [id, userId])
        : await query("DELETE FROM reminders WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
}
