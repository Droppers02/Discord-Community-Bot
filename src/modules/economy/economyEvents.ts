import { randomInt, randomUUID } from "node:crypto";
import type { Message } from "discord.js";
import { query } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { formatNumber, t, tk } from "../../lib/i18n.js";

// Eventos especiais de economia (do bot antigo), criados pela administração com /evento:
//  • happy_hour  — diário, trabalho e prémios dos jogos multiplicados;
//  • lucky_time  — os lucros das apostas multiplicados;
//  • gold_rain   — chuva de ouro: quem fala no chat pode apanhar moedas;
//  • special_daily — só o diário multiplicado.

export const EVENT_TYPES = ["happy_hour", "lucky_time", "gold_rain", "special_daily"] as const;
export type EconomyEventType = (typeof EVENT_TYPES)[number];

export const EVENT_INFO: Record<EconomyEventType, { label: string; icon: string; description: string }> = {
    happy_hour: { label: tk("Happy Hour"), icon: "🎉", description: tk("Diário, trabalho e prémios dos jogos multiplicados.") },
    lucky_time: { label: tk("Super Sorte"), icon: "🍀", description: tk("Os lucros das apostas são multiplicados.") },
    gold_rain: { label: tk("Chuva de Ouro"), icon: "💰", description: tk("Quem fala no chat pode apanhar moedas caídas do céu.") },
    special_daily: { label: tk("Diário Especial"), icon: "🎁", description: tk("O diário vale mais.") },
};

export interface EconomyEvent {
    id: string;
    guild_id: string;
    type: EconomyEventType;
    multiplier: number;
    channel_id: string | null;
    created_by: string;
    starts_at: number;
    ends_at: number;
}

const cache = new Map<string, { events: EconomyEvent[]; until: number }>();

export async function activeEvents(guildId: string): Promise<EconomyEvent[]> {
    const now = Date.now();
    const cached = cache.get(guildId);
    if (cached && cached.until > now) return cached.events.filter((event) => event.ends_at > now);
    const result = await query<Record<string, unknown>>("SELECT * FROM economy_events WHERE guild_id = $1 AND ends_at > $2 ORDER BY ends_at ASC", [guildId, now]);
    const events = result.rows.map((row) => ({
        id: String(row.id),
        guild_id: String(row.guild_id),
        type: row.type as EconomyEventType,
        multiplier: Number(row.multiplier),
        channel_id: (row.channel_id as string | null) ?? null,
        created_by: String(row.created_by),
        starts_at: Number(row.starts_at),
        ends_at: Number(row.ends_at),
    }));
    cache.set(guildId, { events, until: now + 30_000 });
    return events;
}

export async function startEvent(guildId: string, type: EconomyEventType, multiplier: number, hours: number, createdBy: string, channelId: string | null): Promise<EconomyEvent> {
    const now = Date.now();
    const event: EconomyEvent = { id: randomUUID().slice(0, 8), guild_id: guildId, type, multiplier, channel_id: channelId, created_by: createdBy, starts_at: now, ends_at: now + hours * 3_600_000 };
    await query(
        "INSERT INTO economy_events (id, guild_id, type, multiplier, channel_id, created_by, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [event.id, guildId, type, multiplier, channelId, createdBy, event.starts_at, event.ends_at],
    );
    cache.delete(guildId);
    return event;
}

export async function endEvent(guildId: string, id: string): Promise<boolean> {
    const result = await query("UPDATE economy_events SET ends_at = $3 WHERE guild_id = $1 AND id = $2 AND ends_at > $3", [guildId, id, Date.now()]);
    cache.delete(guildId);
    return (result.rowCount ?? 0) > 0;
}

/** Multiplicador ativo para um tipo de ganho (1 = sem evento). */
export async function eventMultiplier(guildId: string, kind: string): Promise<number> {
    const events = await activeEvents(guildId);
    let multiplier = 1;
    for (const event of events) {
        if (event.type === "happy_hour" && ["daily", "work", "game_reward"].includes(kind)) multiplier = Math.max(multiplier, event.multiplier);
        if (event.type === "special_daily" && kind === "daily") multiplier = Math.max(multiplier, event.multiplier);
        if (event.type === "lucky_time" && kind === "bet_win") multiplier = Math.max(multiplier, event.multiplier);
    }
    return multiplier;
}

// ─── Chuva de ouro ───────────────────────────────────────────────────────────

const lastDrop = new Map<string, number>();

/** Durante a chuva de ouro, cada mensagem tem 4% de hipótese de "apanhar" moedas (1 por minuto por canal). */
export async function maybeGoldDrop(message: Message<true>, grant: (amount: number) => Promise<number>): Promise<void> {
    const rain = (await activeEvents(message.guildId)).find((event) => event.type === "gold_rain");
    if (!rain || (rain.channel_id && rain.channel_id !== message.channelId)) return;
    const now = Date.now();
    if ((lastDrop.get(message.channelId) ?? 0) > now - 60_000) return;
    if (randomInt(0, 100) >= 4) return;
    lastDrop.set(message.channelId, now);
    const amount = Math.round(randomInt(50, 301) * rain.multiplier);
    await grant(amount);
    await message.reply({
        components: [buildContainer({ color: COLORS.gold, description: `${e("moneybag")} ${t("**Chuva de ouro!** {user} apanhou **{amount}** moedas.", { user: `<@${message.author.id}>`, amount: formatNumber(amount) })}` })],
        flags: CV2_FLAG,
        allowedMentions: { parse: [] },
    }).catch(() => null);
}
