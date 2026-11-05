import type { Client, Message } from "discord.js";
import { query } from "#database";
import { logger } from "../../lib/logger.js";
import { lisbonParts, monthOf } from "./wrappedStats.js";

// EPA Wrapped — contagens finas para a retrospetiva: a que horas e em que dias cada um escreve,
// em que canais, que emojis usa, a quem responde/menciona e com quem passa tempo em voz.
// Ficam num buffer em memória e vão para a BD de minuto a minuto (sem uma escrita por mensagem).

const SEP = "\u0001";
const counts = new Map<string, number>();
const pairs = new Map<string, number>();
const MAX_EMOJIS_PER_MESSAGE = 5;
const MAX_VOICE_GROUP = 15;

function bump(guildId: string, userId: string, month: string, kind: string, key: string, amount = 1): void {
    const id = [guildId, userId, month, kind, key.slice(0, 80)].join(SEP);
    counts.set(id, (counts.get(id) ?? 0) + amount);
}

const CUSTOM_EMOJI = /<a?:(\w{2,32}):(\d{15,25})>/g;
const UNICODE_EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

/** Os emojis de uma mensagem (os do servidor como "<:nome:id>", os normais tal como são). */
export function emojisIn(content: string): string[] {
    const found: string[] = [];
    for (const match of content.matchAll(CUSTOM_EMOJI)) found.push(`<:${match[1]}:${match[2]}>`);
    const withoutCustom = content.replace(CUSTOM_EMOJI, " ");
    for (const match of withoutCustom.matchAll(UNICODE_EMOJI)) found.push(match[0]);
    return found.slice(0, MAX_EMOJIS_PER_MESSAGE);
}

export function recordWrappedMessage(message: Message<true>): void {
    if (message.author.bot || message.webhookId || message.system) return;
    const at = message.createdTimestamp;
    const month = monthOf(at);
    const { hour, weekday } = lisbonParts(at);
    const guildId = message.guildId;
    const userId = message.author.id;
    bump(guildId, userId, month, "hour", String(hour));
    bump(guildId, userId, month, "weekday", String(weekday));
    bump(guildId, userId, month, "channel", message.channel.isThread() ? message.channel.parentId ?? message.channelId : message.channelId);
    for (const emoji of emojisIn(message.content)) bump(guildId, userId, month, "emoji", emoji);
    const replied = message.mentions.repliedUser;
    if (replied && !replied.bot && replied.id !== userId) bump(guildId, userId, month, "talk", replied.id, 2);
    const mentioned = message.mentions.users.find((user) => !user.bot && user.id !== userId && user.id !== replied?.id);
    if (mentioned) bump(guildId, userId, month, "talk", mentioned.id);
}

/** Um minuto juntos em voz (chamado pelo contador de voz, por canal). */
export function recordVoicePairs(guildId: string, userIds: string[], seconds: number, now = Date.now()): void {
    const ids = [...new Set(userIds)].sort().slice(0, MAX_VOICE_GROUP);
    if (ids.length < 2) return;
    const month = monthOf(now);
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const id = [guildId, ids[i], ids[j], month].join(SEP);
            pairs.set(id, (pairs.get(id) ?? 0) + seconds);
        }
    }
}

export async function flushWrapped(): Promise<void> {
    if (counts.size) {
        const rows = [...counts.entries()];
        counts.clear();
        for (let i = 0; i < rows.length; i += 150) {
            const chunk = rows.slice(i, i + 150);
            const values: unknown[] = [];
            const placeholders = chunk.map(([id, amount], index) => {
                values.push(...id.split(SEP), amount);
                const base = index * 6;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
            });
            await query(
                `INSERT INTO wrapped_counts (guild_id, user_id, month, kind, key, count) VALUES ${placeholders.join(", ")}
                 ON CONFLICT (guild_id, user_id, month, kind, key) DO UPDATE SET count = wrapped_counts.count + EXCLUDED.count`,
                values,
            );
        }
    }
    if (pairs.size) {
        const rows = [...pairs.entries()];
        pairs.clear();
        for (let i = 0; i < rows.length; i += 150) {
            const chunk = rows.slice(i, i + 150);
            const values: unknown[] = [];
            const placeholders = chunk.map(([id, seconds], index) => {
                values.push(...id.split(SEP), seconds);
                const base = index * 5;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
            });
            await query(
                `INSERT INTO voice_pairs (guild_id, user_a, user_b, month, seconds) VALUES ${placeholders.join(", ")}
                 ON CONFLICT (guild_id, user_a, user_b, month) DO UPDATE SET seconds = voice_pairs.seconds + EXCLUDED.seconds`,
                values,
            );
        }
    }
}

let timer: NodeJS.Timeout | null = null;

export function startWrappedTracker(_client: Client<true>): void {
    if (timer) return;
    timer = setInterval(() => void flushWrapped().catch((error) => logger.warn("Wrapped: falha a gravar contagens:", error)), 60_000);
    timer.unref?.();
}

/** Para o desligar ordeiro (não perder o último minuto). */
export function pendingWrappedCounts(): number {
    return counts.size + pairs.size;
}
