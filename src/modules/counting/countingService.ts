import { ButtonBuilder, ButtonStyle, type Guild, type GuildMember, type Message, type PartialMessage, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import { grantCoins, spendCoins } from "../economy/economyService.js";
import { applyTempRole } from "../roles/tempRoleManager.js";
import { judgeCount, parseCount, reactionFor, type CountOutcome } from "./countingMath.js";
import { getCountingSettings, type CountingSettings } from "./countingSettings.js";

// Canal de contagem: cada mensagem é o número seguinte. Uma mensagem de cada vez por servidor
// (cadeia de promessas), estado na BD (counting_state) e estatísticas por membro.

export interface CountingState {
    current: number;
    last_user_id: string | null;
    last_message_id: string | null;
    record: number;
    record_at: number;
    run_record: number;
    saves: number;
    total_counts: number;
    fails: number;
}

const EMPTY: CountingState = { current: 0, last_user_id: null, last_message_id: null, record: 0, record_at: 0, run_record: 0, saves: 0, total_counts: 0, fails: 0 };

export async function getCountingState(guildId: string): Promise<CountingState> {
    const row = await queryOne<Record<string, unknown>>("SELECT * FROM counting_state WHERE guild_id = $1", [guildId]);
    if (!row) return { ...EMPTY };
    return {
        current: Number(row.current),
        last_user_id: (row.last_user_id as string | null) ?? null,
        last_message_id: (row.last_message_id as string | null) ?? null,
        record: Number(row.record),
        record_at: Number(row.record_at),
        run_record: Number(row.run_record ?? 0),
        saves: Number(row.saves),
        total_counts: Number(row.total_counts),
        fails: Number(row.fails),
    };
}

async function saveCountingState(guildId: string, state: CountingState): Promise<void> {
    await query(
        `INSERT INTO counting_state (guild_id, current, last_user_id, last_message_id, record, record_at, saves, total_counts, fails, updated_at, run_record)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (guild_id) DO UPDATE SET current = $2, last_user_id = $3, last_message_id = $4, record = $5, record_at = $6, saves = $7, total_counts = $8, fails = $9, updated_at = $10, run_record = $11`,
        [guildId, state.current, state.last_user_id, state.last_message_id, state.record, state.record_at, state.saves, state.total_counts, state.fails, Date.now(), state.run_record],
    );
}

async function recordMember(guildId: string, userId: string, ok: boolean, value: number): Promise<void> {
    await query(
        `INSERT INTO counting_members (guild_id, user_id, counts, fails, best_number, last_at) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET counts = counting_members.counts + $3, fails = counting_members.fails + $4,
            best_number = GREATEST(counting_members.best_number, $5), last_at = $6`,
        [guildId, userId, ok ? 1 : 0, ok ? 0 : 1, ok ? value : 0, Date.now()],
    );
}

export async function topCounters(guildId: string, limit = 10): Promise<Array<{ user_id: string; counts: number; fails: number; best_number: number }>> {
    const { rows } = await query("SELECT user_id, counts, fails, best_number FROM counting_members WHERE guild_id = $1 ORDER BY counts DESC LIMIT $2", [guildId, limit]);
    return rows.map((row) => ({ user_id: String(row.user_id), counts: Number(row.counts), fails: Number(row.fails), best_number: Number(row.best_number) }));
}

export async function setCountingNumber(guildId: string, value: number): Promise<void> {
    const state = await getCountingState(guildId);
    await saveCountingState(guildId, { ...state, current: value, run_record: state.record, last_user_id: null, last_message_id: null });
}

// Uma contagem de cada vez por servidor: duas mensagens quase ao mesmo tempo não podem ler o
// mesmo estado.
const chains = new Map<string, Promise<void>>();

function serialize(guildId: string, task: () => Promise<void>): Promise<void> {
    const next = (chains.get(guildId) ?? Promise.resolve()).then(task).catch((error) => logger.warn("Contagem: falha:", error));
    chains.set(guildId, next);
    void next.finally(() => { if (chains.get(guildId) === next) chains.delete(guildId); });
    return next;
}

async function say(channel: TextChannel, text: string, color: number, mentions: string[] = []): Promise<void> {
    await channel.send({ components: [buildContainer({ color, description: text })], flags: CV2_FLAG, allowedMentions: { users: mentions } }).catch(() => null);
}

async function applyOutcome(message: Message<true>, settings: CountingSettings, state: CountingState, outcome: CountOutcome): Promise<void> {
    const guildId = message.guildId;
    const channel = message.channel as TextChannel;
    const user = `<@${message.author.id}>`;

    if (outcome.kind === "ok") {
        state.current = outcome.value;
        state.last_user_id = message.author.id;
        state.last_message_id = message.id;
        state.total_counts++;
        if (outcome.record) { state.record = outcome.value; state.record_at = Date.now(); }
        await saveCountingState(guildId, state);
        await recordMember(guildId, message.author.id, true, outcome.value);
        await message.react(reactionFor(outcome.value, outcome.milestone, outcome.beatRecord)).catch(() => null);
        if (outcome.reward && settings.reward_coins > 0) {
            await grantCoins(guildId, message.author.id, settings.reward_coins, "counting", t("Contagem: {n}", { n: outcome.value })).catch(() => null);
            await message.react("🪙").catch(() => null);
        }
        if (outcome.milestone) {
            await say(channel, `🎉 **${formatNumber(outcome.value)}**! ${t("Que contagem, malta! Próximo marco: **{next}**.", { next: formatNumber(outcome.value + settings.milestone_every) })}`, COLORS.gold);
        } else if (outcome.beatRecord) {
            await say(channel, `⭐ ${t("Novo recorde do servidor! Já vamos no **{n}** — continuem!", { n: formatNumber(outcome.value) })}`, COLORS.gold);
        }
        return;
    }

    const why = outcome.double
        ? t("{user} contou duas vezes seguidas", { user })
        : t("{user} escreveu **{got}**, mas era **{expected}**", { user, got: formatNumber(outcome.got), expected: formatNumber(outcome.expected) });

    if (outcome.kind === "wrong") {
        await message.react("❌").catch(() => null);
        setTimeout(() => void message.delete().catch(() => null), 4_000).unref?.();
        return;
    }

    state.fails++;
    await recordMember(guildId, message.author.id, false, 0);
    if (outcome.kind === "saved") {
        state.saves--;
        await saveCountingState(guildId, state);
        await message.react("⚠️").catch(() => null);
        await say(channel, `💾 ${why} — ${t("uma vida salvou a contagem! Restam **{n}**. Continuem no **{expected}**.", { n: state.saves, expected: formatNumber(outcome.expected) })}`, COLORS.warning);
        return;
    }

    const reached = outcome.reached;
    state.current = 0;
    state.run_record = state.record;
    state.last_user_id = null;
    state.last_message_id = null;
    await saveCountingState(guildId, state);
    await message.react("❌").catch(() => null);
    let shame = "";
    if (settings.shame_role) {
        const ok = await applyTempRole(message.guild, {
            guildId, userId: message.author.id, roleId: settings.shame_role, grantedBy: message.client.user.id,
            reason: t("Estragou a contagem no {n}", { n: reached }), durationMs: settings.shame_hours * 3_600_000,
        }).then(() => true).catch(() => false);
        if (ok) shame = `\n-# ${t("{user} fica com {role} durante {h} h. 🫣", { user, role: `<@&${settings.shame_role}>`, h: settings.shame_hours })}`;
    }
    await say(channel, `💥 ${why} — ${t("a contagem foi ao ar no **{n}**!", { n: formatNumber(reached) })}\n${t("Recorde: **{record}**. Recomecem do **1**.", { record: formatNumber(state.record) })}${shame}`, COLORS.danger, [message.author.id]);
}

export async function handleCountingMessage(message: Message<true>): Promise<void> {
    if (message.author.bot || message.system) return;
    const settings = await getCountingSettings(message.guildId);
    if (!settings.enabled || message.channelId !== settings.channel) return;
    const value = parseCount(message.content, settings.math);
    if (value === null) {
        if (settings.delete_chat) await message.delete().catch(() => null);
        return;
    }
    await serialize(message.guildId, async () => {
        const state = await getCountingState(message.guildId);
        const outcome = judgeCount(
            { current: state.current, lastUserId: state.last_user_id, record: state.record, runRecord: state.run_record, saves: state.saves },
            value,
            message.author.id,
            { noDouble: settings.no_double, resetOnFail: settings.reset_on_fail, milestoneEvery: settings.milestone_every, rewardEvery: settings.reward_every },
        );
        await applyOutcome(message, settings, state, outcome);
    });
}

/** A última contagem foi apagada ou editada: avisa qual é o número seguinte (anti-troll). */
export async function handleCountingTamper(message: Message | PartialMessage, edited: boolean): Promise<void> {
    if (!message.guildId) return;
    const settings = await getCountingSettings(message.guildId);
    if (!settings.enabled || message.channelId !== settings.channel) return;
    await serialize(message.guildId, async () => {
        const state = await getCountingState(message.guildId!);
        if (state.last_message_id !== message.id || state.current === 0) return;
        if (edited && message.content && parseCount(message.content, settings.math) === state.current) return;
        const channel = message.guild?.channels.cache.get(message.channelId);
        if (!channel?.isTextBased()) return;
        const who = state.last_user_id ? `<@${state.last_user_id}>` : t("Alguém");
        await say(channel as TextChannel, `${edited ? "✏️" : "⚠️"} ${edited ? t("{user} editou o número **{n}**.", { user: who, n: formatNumber(state.current) }) : t("{user} apagou o número **{n}**.", { user: who, n: formatNumber(state.current) })} ${t("O próximo é **{next}**.", { next: formatNumber(state.current + 1) })}`, COLORS.warning);
    });
}

/** Compra uma vida para a contagem (qualquer membro, com moedas). */
export async function buyCountingSave(member: GuildMember): Promise<{ ok: true; saves: number } | { ok: false; reason: string }> {
    const settings = await getCountingSettings(member.guild.id);
    if (!settings.enabled) return { ok: false, reason: t("A contagem não está ligada.") };
    if (settings.max_saves === 0) return { ok: false, reason: t("As vidas estão desligadas neste servidor.") };
    let result: { ok: true; saves: number } | { ok: false; reason: string } = { ok: false, reason: t("Tenta outra vez.") };
    await serialize(member.guild.id, async () => {
        const state = await getCountingState(member.guild.id);
        if (state.saves >= settings.max_saves) { result = { ok: false, reason: t("A contagem já tem o máximo de vidas ({max}).", { max: settings.max_saves }) }; return; }
        const balance = await spendCoins(member.guild.id, member.id, settings.save_price, "counting-save", t("Vida da contagem"));
        if (balance === null) { result = { ok: false, reason: t("Não tens moedas suficientes ({price}).", { price: formatNumber(settings.save_price) }) }; return; }
        state.saves++;
        await saveCountingState(member.guild.id, state);
        result = { ok: true, saves: state.saves };
    });
    return result;
}

export async function countingStatusView(guild: Guild): Promise<ContainerPlusBuilder> {
    const [settings, state, top] = await Promise.all([getCountingSettings(guild.id), getCountingState(guild.id), topCounters(guild.id, 5)]);
    const medals = ["🥇", "🥈", "🥉", "4.", "5."];
    return buildContainer({
        color: COLORS.primary,
        title: `🔢 ${t("Contagem")}`,
        description: settings.enabled && settings.channel
            ? t("Em {channel} · próximo número: **{next}**", { channel: `<#${settings.channel}>`, next: formatNumber(state.current + 1) })
            : t("A contagem está desligada — liga-a em /config → Contagem."),
        fields: [
            { name: t("Recorde"), value: state.record ? t("**{n}** · {when}", { n: formatNumber(state.record), when: timestamp(state.record_at, "R") }) : t("*Ainda nenhum*") },
            { name: t("Vidas"), value: settings.max_saves ? `${"💾".repeat(state.saves)}${"▫️".repeat(Math.max(0, settings.max_saves - state.saves))} (${state.saves}/${settings.max_saves}) · ${t("{price} moedas cada", { price: formatNumber(settings.save_price) })}` : t("*Desligadas*") },
            { name: t("Números"), value: t("{total} contagens certas · {fails} erros", { total: formatNumber(state.total_counts), fails: formatNumber(state.fails) }) },
            { name: t("Quem mais conta"), value: top.length ? top.map((entry, index) => `${medals[index]} <@${entry.user_id}> — **${formatNumber(entry.counts)}** (${t("{n} erros", { n: entry.fails })})`).join("\n") : t("*Ninguém ainda*") },
        ],
        footerText: [
            settings.math ? t("Aceita contas (6*7)") : null,
            settings.no_double ? t("ninguém conta duas seguidas") : null,
            settings.reward_every && settings.reward_coins ? t("{coins} moedas de {n} em {n}", { coins: settings.reward_coins, n: settings.reward_every }) : null,
        ].filter(Boolean).join(" · ") || null,
        rows: settings.enabled && settings.max_saves
            ? [row(new ButtonBuilder().setCustomId(buildCustomId("count", "buy")).setLabel(t("Comprar vida ({price})", { price: formatNumber(settings.save_price) })).setEmoji("💾").setStyle(ButtonStyle.Success).setDisabled(state.saves >= settings.max_saves))]
            : [],
    });
}

export async function countingRankingView(guild: Guild): Promise<ContainerPlusBuilder> {
    const top = await topCounters(guild.id, 15);
    return buildContainer({
        color: COLORS.gold,
        title: `${e("trophy")} ${t("Ranking da contagem")}`,
        description: top.length
            ? top.map((entry, index) => `**${index + 1}.** <@${entry.user_id}> — **${formatNumber(entry.counts)}** ${t("certas")} · ${entry.fails} ${t("erros")} · ${t("melhor {n}", { n: formatNumber(entry.best_number) })}`).join("\n")
            : t("Ninguém contou ainda."),
    });
}

