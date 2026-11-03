import { query } from "#database";
import { lisbonDay } from "../modules/economy/economyService.js";
import { logger } from "../lib/logger.js";

// Atividade diária por membro (mensagens, XP e voz por dia de Lisboa) — para o /atividade e as
// sequências. As contagens juntam-se em memória e vão para a base de dados de minuto a minuto.

interface Pending { messages: number; xp: number; voice: number }
const pending = new Map<string, Pending>();
let flushTimer: NodeJS.Timeout | null = null;

function bucket(guildId: string, userId: string): Pending {
    const key = `${guildId}|${userId}|${lisbonDay(Date.now())}`;
    let entry = pending.get(key);
    if (!entry) {
        entry = { messages: 0, xp: 0, voice: 0 };
        pending.set(key, entry);
    }
    ensureFlushing();
    return entry;
}

export function recordMessageActivity(guildId: string, userId: string): void {
    bucket(guildId, userId).messages += 1;
}

export function recordXpActivity(guildId: string, userId: string, xp: number): void {
    bucket(guildId, userId).xp += Math.max(0, Math.round(xp));
}

export function recordVoiceActivity(guildId: string, userId: string, seconds: number): void {
    bucket(guildId, userId).voice += Math.max(0, Math.round(seconds));
}

export async function flushActivity(): Promise<void> {
    const entries = [...pending.entries()];
    pending.clear();
    for (const [key, value] of entries) {
        const [guildId, userId, day] = key.split("|");
        await query(
            `INSERT INTO member_activity (guild_id, user_id, day, messages, xp, voice_seconds) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (guild_id, user_id, day) DO UPDATE SET
                messages = member_activity.messages + $4, xp = member_activity.xp + $5, voice_seconds = member_activity.voice_seconds + $6`,
            [guildId, userId, day, value.messages, value.xp, value.voice],
        ).catch((error) => logger.warn("Atividade: falha a gravar:", error));
    }
}

function ensureFlushing(): void {
    if (flushTimer) return;
    flushTimer = setInterval(() => void flushActivity(), 60_000);
    flushTimer.unref?.();
}

export interface ActivityDay { day: string; messages: number; xp: number; voice_seconds: number }

export async function activitySince(guildId: string, userId: string, sinceDay: string): Promise<ActivityDay[]> {
    await flushActivity();
    const result = await query<Record<string, unknown>>(
        "SELECT day, messages, xp, voice_seconds FROM member_activity WHERE guild_id = $1 AND user_id = $2 AND day >= $3 ORDER BY day ASC",
        [guildId, userId, sinceDay],
    );
    return result.rows.map((row) => ({ day: String(row.day), messages: Number(row.messages), xp: Number(row.xp), voice_seconds: Number(row.voice_seconds) }));
}

/** Dias (de Lisboa) com pelo menos uma mensagem, do mais recente para trás. */
export async function activeDays(guildId: string, userId: string, limit = 400): Promise<string[]> {
    await flushActivity();
    const result = await query<{ day: string }>(
        "SELECT day FROM member_activity WHERE guild_id = $1 AND user_id = $2 AND (messages > 0 OR voice_seconds > 0) ORDER BY day DESC LIMIT $3",
        [guildId, userId, limit],
    );
    return result.rows.map((row) => row.day);
}

export async function pruneActivity(beforeDay: string): Promise<void> {
    await query("DELETE FROM member_activity WHERE day < $1", [beforeDay]);
}
