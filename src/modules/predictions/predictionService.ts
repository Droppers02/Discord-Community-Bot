import { randomUUID } from "node:crypto";
import { ButtonBuilder, ButtonStyle, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, type Client, type Guild, type GuildMember, type GuildTextBasedChannel, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne } from "#database";
import { ourGuilds } from "../../config.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../lib/discord.js";
import { ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { appendAuditLog } from "../../services/auditService.js";
import { textField } from "../config/panelKit.js";
import { accountOf, grantCoins, spendCoins } from "../economy/economyService.js";
import { hasModAccess } from "../moderation/moderationService.js";
import { payoutMultiplier, settle, shareBar, totalsByOption, type Bet } from "./predictionLogic.js";
import { getPredictionSettings, type PredictionSettings } from "./predictionSettings.js";

// Previsões com moedas (/previsao): pergunta + opções, apostas em EPA Coins até fechar, e quem
// acerta divide o bolo. Tudo na BD (predictions, prediction_bets); fecha sozinha à hora marcada.

export const PRED_NS = "pred";
const cid = (...parts: Array<string | number>) => buildCustomId(PRED_NS, ...parts);
const LETTERS = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭"];
const TICK_MS = 30_000;

export type PredictionStatus = "open" | "locked" | "resolved" | "cancelled";

export interface Prediction {
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string | null;
    creator_id: string;
    question: string;
    options: string[];
    status: PredictionStatus;
    winner: number | null;
    house_cut_pct: number;
    locks_at: number | null;
    created_at: number;
    resolved_at: number | null;
}

function toPrediction(row: Record<string, unknown>): Prediction {
    const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
    return {
        id: String(row.id),
        guild_id: String(row.guild_id),
        channel_id: String(row.channel_id),
        message_id: (row.message_id as string | null) ?? null,
        creator_id: String(row.creator_id),
        question: String(row.question),
        options: Array.isArray(row.options) ? row.options as string[] : [],
        status: row.status as PredictionStatus,
        winner: num(row.winner),
        house_cut_pct: Number(row.house_cut_pct ?? 0),
        locks_at: num(row.locks_at),
        created_at: Number(row.created_at),
        resolved_at: num(row.resolved_at),
    };
}

export async function getPrediction(id: string): Promise<Prediction | null> {
    const row = await queryOne("SELECT * FROM predictions WHERE id = $1", [id]);
    return row ? toPrediction(row) : null;
}

async function betsOf(predictionId: string): Promise<Array<Bet & { payout: number }>> {
    const { rows } = await query("SELECT user_id, option, amount, payout FROM prediction_bets WHERE prediction_id = $1", [predictionId]);
    return rows.map((row) => ({ user_id: String(row.user_id), option: Number(row.option), amount: Number(row.amount), payout: Number(row.payout) }));
}

async function setStatus(prediction: Prediction): Promise<void> {
    await query("UPDATE predictions SET status = $2, winner = $3, resolved_at = $4, message_id = $5 WHERE id = $1", [prediction.id, prediction.status, prediction.winner, prediction.resolved_at, prediction.message_id]);
}

export async function openPredictions(guildId: string): Promise<Prediction[]> {
    const { rows } = await query("SELECT * FROM predictions WHERE guild_id = $1 AND status IN ('open', 'locked') ORDER BY created_at DESC", [guildId]);
    return rows.map(toPrediction);
}

// Uma operação de cada vez por previsão (apostas, fecho, resolução).
const chains = new Map<string, Promise<unknown>>();
function serialize<T>(id: string, task: () => Promise<T>): Promise<T> {
    const next = (chains.get(id) ?? Promise.resolve()).then(task, task);
    chains.set(id, next.catch(() => null));
    return next;
}

// ─── Cartão ──────────────────────────────────────────────────────────────────

export function predictionCard(prediction: Prediction, bets: Array<Bet & { payout?: number }>): ContainerPlusBuilder {
    const totals = totalsByOption(bets, prediction.options.length);
    const pool = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const status = {
        open: prediction.locks_at ? t("🟢 Apostas abertas · fecham {when}", { when: timestamp(prediction.locks_at, "R") }) : t("🟢 Apostas abertas"),
        locked: t("🔒 Apostas fechadas — à espera do resultado"),
        resolved: t("🏁 Resultado: **{option}**", { option: prediction.winner !== null ? prediction.options[prediction.winner] ?? "?" : "?" }),
        cancelled: t("↩️ Cancelada — as apostas foram devolvidas"),
    }[prediction.status];

    const fields = prediction.options.map((label, option) => {
        const total = totals[option]!;
        const multiplier = payoutMultiplier(bets, option, prediction.house_cut_pct);
        const winner = prediction.status === "resolved" && prediction.winner === option;
        return {
            name: `${LETTERS[option]} ${label}${winner ? " ✅" : ""}`,
            value: `${shareBar(total.total, pool)} **${pool ? Math.round((total.total / pool) * 100) : 0}%** · ${formatNumber(total.total)} ${t("moedas")} · ${t("{count, plural, one {# pessoa} other {# pessoas}}", { count: total.bettors })}${multiplier ? ` · ${t("paga x{m}", { m: multiplier.toFixed(2) })}` : ""}`,
        };
    });

    if (prediction.status === "resolved") {
        const top = bets.filter((bet) => (bet.payout ?? 0) > bet.amount).sort((a, b) => (b.payout ?? 0) - (a.payout ?? 0)).slice(0, 5);
        if (top.length) fields.push({ name: t("Quem mais ganhou"), value: top.map((bet) => `<@${bet.user_id}> +${formatNumber((bet.payout ?? 0) - bet.amount)}`).join(" · ") });
    }

    const container = buildContainer({
        color: prediction.status === "open" ? COLORS.primary : prediction.status === "locked" ? COLORS.warning : prediction.status === "resolved" ? COLORS.success : COLORS.neutral,
        title: `🔮 ${prediction.question}`,
        description: `${t("por {user}", { user: `<@${prediction.creator_id}>` })} · ${status}`,
        fields,
        footerText: t("Bolo: {pool} moedas · {count, plural, one {# aposta} other {# apostas}}{cut}", { pool: formatNumber(pool), count: bets.length, cut: prediction.house_cut_pct ? ` · ${t("taxa {n}%", { n: prediction.house_cut_pct })}` : "" }),
    });

    if (prediction.status === "open") {
        container.addActionRowComponents(row(new StringSelectMenuBuilder()
            .setCustomId(cid("bet", prediction.id))
            .setPlaceholder(t("Apostar em…"))
            .addOptions(prediction.options.map((label, option) => ({ label: label.slice(0, 100), value: String(option), emoji: LETTERS[option] })))));
    }
    if (prediction.status === "open" || prediction.status === "locked") {
        container.addActionRowComponents(row(
            new ButtonBuilder().setCustomId(cid("mine", prediction.id)).setLabel(t("A minha aposta")).setEmoji(ei("wallet")).setStyle(ButtonStyle.Secondary),
            ...(prediction.status === "open" ? [new ButtonBuilder().setCustomId(cid("lock", prediction.id)).setLabel(t("Fechar apostas")).setEmoji(ei("lock")).setStyle(ButtonStyle.Secondary)] : []),
            new ButtonBuilder().setCustomId(cid("resolve", prediction.id)).setLabel(t("Resolver")).setEmoji("🏁").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(cid("cancel", prediction.id)).setLabel(t("Cancelar")).setEmoji("↩️").setStyle(ButtonStyle.Danger),
        ));
    }
    return container;
}

async function refreshCard(guild: Guild, prediction: Prediction): Promise<void> {
    if (!prediction.message_id) return;
    const channel = guild.channels.cache.get(prediction.channel_id);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(prediction.message_id).catch(() => null);
    await message?.edit({ components: [predictionCard(prediction, await betsOf(prediction.id))], allowedMentions: { parse: [] } }).catch(() => null);
}

async function announce(guild: Guild, prediction: Prediction, text: string, users: string[] = []): Promise<void> {
    const channel = guild.channels.cache.get(prediction.channel_id);
    if (!channel?.isTextBased()) return;
    await (channel as TextChannel).send({ components: [buildContainer({ color: COLORS.primary, description: text })], flags: CV2_FLAG, allowedMentions: { users } }).catch(() => null);
}

// ─── Permissões ──────────────────────────────────────────────────────────────

export async function canCreate(member: GuildMember, settings: PredictionSettings): Promise<boolean> {
    if (settings.anyone_can_create) return true;
    if (settings.creator_role && member.roles.cache.has(settings.creator_role)) return true;
    return hasModAccess(member, PermissionFlagsBits.ManageEvents);
}

export async function canManage(member: GuildMember, prediction: Prediction): Promise<boolean> {
    if (member.id === prediction.creator_id) return true;
    const config = await ensureGuildConfig(member.guild.id);
    return hasSuperAdminAccess(member, config.admin_role) || hasModAccess(member, PermissionFlagsBits.ManageEvents);
}

// ─── Ações ───────────────────────────────────────────────────────────────────

export async function createPrediction(member: GuildMember, channel: GuildTextBasedChannel, question: string, options: string[], locksAt: number | null): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
    const settings = await getPredictionSettings(member.guild.id);
    if (!settings.enabled) return { ok: false, reason: t("As previsões estão desligadas neste servidor.") };
    if (!(await canCreate(member, settings))) return { ok: false, reason: t("Só a equipa pode criar previsões aqui.") };
    if ((await openPredictions(member.guild.id)).length >= settings.max_open) return { ok: false, reason: t("Já há {n} previsões abertas — resolve uma antes.", { n: settings.max_open }) };
    const prediction: Prediction = {
        id: randomUUID().slice(0, 8), guild_id: member.guild.id, channel_id: channel.id, message_id: null, creator_id: member.id,
        question: question.slice(0, 200), options, status: "open", winner: null, house_cut_pct: settings.house_cut_pct, locks_at: locksAt, created_at: Date.now(), resolved_at: null,
    };
    await query(
        `INSERT INTO predictions (id, guild_id, channel_id, creator_id, question, options, status, house_cut_pct, locks_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9)`,
        [prediction.id, prediction.guild_id, prediction.channel_id, prediction.creator_id, prediction.question, JSON.stringify(options), prediction.house_cut_pct, locksAt, prediction.created_at],
    );
    const sent = await channel.send({ components: [predictionCard(prediction, [])], flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch(() => null);
    if (!sent) {
        prediction.status = "cancelled";
        await setStatus(prediction);
        return { ok: false, reason: t("Não consegui publicar aqui (permissões do bot?).") };
    }
    prediction.message_id = sent.id;
    await setStatus(prediction);
    appendAuditLog({ guildId: member.guild.id, actorId: member.id, action: "prediction.create", details: { id: prediction.id, question: prediction.question } });
    return { ok: true, url: sent.url };
}

export function buildBetModal(prediction: Prediction, option: number, settings: PredictionSettings, balance: number): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("amount", prediction.id, option)).setTitle(t("Apostar em {option}", { option: prediction.options[option] ?? "?" }).slice(0, 45)).addLabelComponents(
        textField("amount", t("Quantas moedas"), "", {
            required: true, max: 12,
            placeholder: t("{min} a {max}", { min: formatNumber(settings.min_bet), max: formatNumber(settings.max_bet) }),
            description: t("Tens {balance}. Podes reforçar a mesma opção depois, mas não mudar.", { balance: formatNumber(balance) }),
        }),
    );
}

export async function balanceOf(member: GuildMember): Promise<number> {
    return (await accountOf(member.guild.id, member.id)).balance;
}

export async function placeBet(member: GuildMember, predictionId: string, option: number, amount: number): Promise<{ ok: true; total: number } | { ok: false; reason: string }> {
    return serialize(predictionId, async () => {
        const prediction = await getPrediction(predictionId);
        if (!prediction || prediction.status !== "open" || (prediction.locks_at && prediction.locks_at <= Date.now())) return { ok: false as const, reason: t("As apostas já fecharam.") };
        if (option < 0 || option >= prediction.options.length) return { ok: false as const, reason: t("Opção inválida.") };
        const settings = await getPredictionSettings(member.guild.id);
        const existing = (await betsOf(predictionId)).find((bet) => bet.user_id === member.id);
        if (existing && existing.option !== option) return { ok: false as const, reason: t("Já apostaste em **{option}** — só podes reforçar essa.", { option: prediction.options[existing.option] ?? "?" }) };
        const total = (existing?.amount ?? 0) + amount;
        if (amount < settings.min_bet) return { ok: false as const, reason: t("A aposta mínima é {n}.", { n: formatNumber(settings.min_bet) }) };
        if (total > settings.max_bet) return { ok: false as const, reason: t("O máximo por pessoa é {n} (já tens {have}).", { n: formatNumber(settings.max_bet), have: formatNumber(existing?.amount ?? 0) }) };
        const balance = await spendCoins(member.guild.id, member.id, amount, "prediction-bet", t("Previsão: {q}", { q: prediction.question.slice(0, 60) }));
        if (balance === null) return { ok: false as const, reason: t("Não tens moedas suficientes.") };
        await query(
            `INSERT INTO prediction_bets (prediction_id, user_id, option, amount, created_at) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (prediction_id, user_id) DO UPDATE SET amount = prediction_bets.amount + EXCLUDED.amount`,
            [predictionId, member.id, option, amount, Date.now()],
        );
        await refreshCard(member.guild, prediction);
        return { ok: true as const, total };
    });
}

export async function lockPrediction(guild: Guild, predictionId: string, auto = false): Promise<boolean> {
    return serialize(predictionId, async () => {
        const prediction = await getPrediction(predictionId);
        if (!prediction || prediction.status !== "open") return false;
        prediction.status = "locked";
        await setStatus(prediction);
        await refreshCard(guild, prediction);
        if (auto) await announce(guild, prediction, `🔒 ${t("Apostas fechadas em **{q}**! Agora é esperar pelo resultado.", { q: prediction.question })}`);
        return true;
    });
}

export async function resolvePrediction(guild: Guild, predictionId: string, winner: number, staffId: string): Promise<string | null> {
    return serialize(predictionId, async () => {
        const prediction = await getPrediction(predictionId);
        if (!prediction || (prediction.status !== "open" && prediction.status !== "locked")) return t("Esta previsão já foi resolvida.");
        if (winner < 0 || winner >= prediction.options.length) return t("Opção inválida.");
        const bets = await betsOf(predictionId);
        const result = settle(bets, winner, prediction.house_cut_pct);
        for (const [userId, payout] of result.payouts) {
            await grantCoins(guild.id, userId, payout, result.refunded ? "prediction-refund" : "prediction-win", t("Previsão: {q}", { q: prediction.question.slice(0, 60) })).catch((error) => logger.warn("Previsões: falha a pagar:", error));
            await query("UPDATE prediction_bets SET payout = $3 WHERE prediction_id = $1 AND user_id = $2", [predictionId, userId, payout]);
        }
        prediction.status = "resolved";
        prediction.winner = winner;
        prediction.resolved_at = Date.now();
        await setStatus(prediction);
        await refreshCard(guild, prediction);
        const winners = bets.filter((bet) => bet.option === winner);
        const best = [...result.payouts.entries()].sort((a, b) => b[1] - a[1])[0];
        await announce(guild, prediction, result.refunded
            ? `🏁 **${prediction.question}** → **${prediction.options[winner]}**\n${t("Ninguém acertou, por isso toda a gente recebeu a aposta de volta.")}`
            : `🏁 **${prediction.question}** → **${prediction.options[winner]}**\n${t("{count, plural, one {# pessoa acertou} other {# pessoas acertaram}} e {count, plural, one {levou} other {dividiram}} **{pool}** moedas.", { count: winners.length, pool: formatNumber(result.pool - result.cut) })}${best ? ` ${t("Maior prémio: {user} (+{n}).", { user: `<@${best[0]}>`, n: formatNumber(best[1] - (bets.find((bet) => bet.user_id === best[0])?.amount ?? 0)) })}` : ""}`,
        winners.map((bet) => bet.user_id).slice(0, 20));
        appendAuditLog({ guildId: guild.id, actorId: staffId, action: "prediction.resolve", details: { id: predictionId, winner, pool: result.pool } });
        return null;
    });
}

export async function cancelPrediction(guild: Guild, predictionId: string, staffId: string): Promise<string | null> {
    return serialize(predictionId, async () => {
        const prediction = await getPrediction(predictionId);
        if (!prediction || (prediction.status !== "open" && prediction.status !== "locked")) return t("Esta previsão já terminou.");
        for (const bet of await betsOf(predictionId)) {
            await grantCoins(guild.id, bet.user_id, bet.amount, "prediction-refund", t("Previsão cancelada")).catch(() => null);
            await query("UPDATE prediction_bets SET payout = amount WHERE prediction_id = $1 AND user_id = $2", [predictionId, bet.user_id]);
        }
        prediction.status = "cancelled";
        prediction.resolved_at = Date.now();
        await setStatus(prediction);
        await refreshCard(guild, prediction);
        appendAuditLog({ guildId: guild.id, actorId: staffId, action: "prediction.cancel", details: { id: predictionId } });
        return null;
    });
}

export async function myBetText(prediction: Prediction, userId: string): Promise<string> {
    const bet = (await betsOf(prediction.id)).find((entry) => entry.user_id === userId);
    if (!bet) return t("Ainda não apostaste nesta previsão.");
    const multiplier = payoutMultiplier(await betsOf(prediction.id), bet.option, prediction.house_cut_pct) ?? 1;
    return t("Apostaste **{amount}** em **{option}**. Se ganhar, recebes cerca de **{win}**.", { amount: formatNumber(bet.amount), option: prediction.options[bet.option] ?? "?", win: formatNumber(Math.floor(bet.amount * multiplier)) });
}

export function resolveSelect(prediction: Prediction): StringSelectMenuBuilder {
    return new StringSelectMenuBuilder()
        .setCustomId(cid("win", prediction.id))
        .setPlaceholder(t("Qual foi o resultado?"))
        .addOptions(prediction.options.map((label, option) => ({ label: label.slice(0, 100), value: String(option), emoji: LETTERS[option] })));
}

export async function predictionsListView(guildId: string): Promise<ContainerPlusBuilder> {
    const open = await openPredictions(guildId);
    return buildContainer({
        color: COLORS.primary,
        title: `🔮 ${t("Previsões abertas")}`,
        description: open.length
            ? open.map((prediction) => {
                const link = prediction.message_id ? `https://discord.com/channels/${guildId}/${prediction.channel_id}/${prediction.message_id}` : null;
                return `${prediction.status === "open" ? "🟢" : "🔒"} ${link ? `[${prediction.question}](${link})` : prediction.question}${prediction.locks_at && prediction.status === "open" ? ` · ${t("fecha {when}", { when: timestamp(prediction.locks_at, "R") })}` : ""}`;
            }).join("\n")
            : t("Nenhuma previsão aberta."),
    });
}

// ─── Tarefa: fechar à hora marcada ───────────────────────────────────────────

async function tick(client: Client<true>): Promise<void> {
    const { rows } = await query("SELECT id, guild_id FROM predictions WHERE status = 'open' AND locks_at IS NOT NULL AND locks_at <= $1", [Date.now()]);
    for (const row of rows) {
        const guild = ourGuilds(client).find((entry) => entry.id === String(row.guild_id));
        if (guild) await lockPrediction(guild, String(row.id), true);
    }
}

let timer: NodeJS.Timeout | null = null;

export function startPredictionJobs(client: Client<true>): void {
    if (timer) return;
    const run = () => void tick(client).catch((error) => logger.warn("Previsões: falha na tarefa:", error));
    setTimeout(run, 25_000).unref?.();
    timer = setInterval(run, TICK_MS);
    timer.unref?.();
}
