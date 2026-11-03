import { randomInt } from "node:crypto";
import type { Client, Guild, GuildMember, TextChannel } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { formatNumber, t, tk } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { applyDelta, claimWithLock, ensureAccount, pruneLedger, type EconomyAccount } from "../../repositories/economyRepository.js";
import { applyTempRole } from "../roles/tempRoleManager.js";
import { getEconomySettings, type EconomySettings, type ShopItem } from "./economySettings.js";
import { eventMultiplier } from "./economyEvents.js";

const TZ = "Europe/Lisbon";
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Dia do calendário em Lisboa ("2026-11-03") — o diário renova à meia-noite portuguesa. */
export function lisbonDay(ms: number): string {
    return dayFormatter.format(new Date(ms));
}

/** Dias de calendário entre duas datas de Lisboa. */
export function dayDiff(fromMs: number, toMs: number): number {
    const a = Date.parse(`${lisbonDay(fromMs)}T00:00:00Z`);
    const b = Date.parse(`${lisbonDay(toMs)}T00:00:00Z`);
    return Math.round((b - a) / 86_400_000);
}

/** Próxima meia-noite em Lisboa (epoch ms). */
export function nextLisbonMidnight(now = Date.now()): number {
    const today = lisbonDay(now);
    // Avança de hora a hora até o dia mudar (lida com as mudanças de hora sem contas de fusos).
    let probe = now - (now % 3_600_000) + 3_600_000;
    while (lisbonDay(probe) === today) probe += 3_600_000;
    // Recua minuto a minuto dentro dessa hora para achar a meia-noite exata.
    let exact = probe - 3_600_000;
    while (lisbonDay(exact) === today) exact += 60_000;
    return exact;
}

export function formatCoins(amount: number, settings?: Pick<EconomySettings, "currency_name">): string {
    return `${e("coin")} **${formatNumber(amount)}**${settings ? ` ${settings.currency_name}` : ""}`;
}

export class EconomyDisabledError extends Error {}

/** Garante a conta com o saldo inicial do servidor. */
export async function accountOf(guildId: string, userId: string): Promise<EconomyAccount> {
    const settings = await getEconomySettings(guildId);
    return ensureAccount(guildId, userId, settings.start_balance);
}

/** Dá moedas (prémios de jogos, diário, trabalho, administração). Devolve o saldo novo. */
export async function grantCoins(guildId: string, userId: string, amount: number, kind: string, note: string | null = null): Promise<number> {
    const settings = await getEconomySettings(guildId);
    const balance = await applyDelta(guildId, userId, Math.max(0, Math.round(amount)), kind, note, settings.start_balance);
    return balance ?? 0;
}

/** Tira moedas se houver saldo. Devolve o saldo novo, ou null sem saldo suficiente. */
export async function spendCoins(guildId: string, userId: string, amount: number, kind: string, note: string | null = null): Promise<number | null> {
    const settings = await getEconomySettings(guildId);
    return applyDelta(guildId, userId, -Math.max(0, Math.round(amount)), kind, note, settings.start_balance);
}

// ─── Diário ──────────────────────────────────────────────────────────────────

export interface DailyResult {
    reward: number;
    /** Multiplicador de um evento ativo (1 = nenhum). */
    eventMultiplier: number;
    base: number;
    bonus: number;
    streak: number;
    best: number;
    milestone: number;
    lostStreak: boolean;
    nextAt: number;
}

/** Bónus fixos ao atingir certas sequências. */
const MILESTONES: Array<[number, number]> = [[7, 1500], [14, 3000], [30, 7500], [60, 15_000], [100, 30_000], [365, 100_000]];

export async function claimDaily(guildId: string, userId: string): Promise<{ ok: true; balance: number; result: DailyResult } | { ok: false; result: DailyResult }> {
    const settings = await getEconomySettings(guildId);
    if (!settings.enabled) throw new EconomyDisabledError();
    const now = Date.now();
    const nextAt = nextLisbonMidnight(now);
    const multiplier = await eventMultiplier(guildId, "daily");
    return claimWithLock<DailyResult>(guildId, userId, settings.start_balance, (account) => {
        const sinceLast = account.last_daily_at ? dayDiff(account.last_daily_at, now) : Number.POSITIVE_INFINITY;
        if (sinceLast === 0) {
            return { refuse: { reward: 0, eventMultiplier: 1, base: 0, bonus: 0, streak: account.daily_streak, best: account.best_daily_streak, milestone: 0, lostStreak: false, nextAt } };
        }
        const lostStreak = account.daily_streak > 0 && sinceLast > 1;
        const streak = sinceLast === 1 ? account.daily_streak + 1 : 1;
        const best = Math.max(account.best_daily_streak, streak);
        const base = randomInt(settings.daily_min, settings.daily_max + 1);
        const bonus = Math.round(base * (settings.daily_streak_bonus_pct / 100) * Math.min(streak - 1, settings.daily_streak_cap));
        const milestone = MILESTONES.find(([days]) => days === streak)?.[1] ?? 0;
        const reward = Math.round((base + bonus + milestone) * multiplier);
        return {
            amount: reward,
            kind: "daily",
            note: t("Diário (dia {streak})", { streak }),
            patch: { daily_streak: streak, best_daily_streak: best, last_daily_at: now },
            result: { reward, eventMultiplier: multiplier, base, bonus, streak, best, milestone, lostStreak, nextAt },
        };
    });
}

// ─── Trabalho ────────────────────────────────────────────────────────────────

const JOBS = [
    tk("Entregaste pizzas pela cidade toda e ainda ficaste com as gorjetas"),
    tk("Programaste um bot para um servidor de Discord (soa familiar?)"),
    tk("Passeaste os cães da vizinhança"),
    tk("Fizeste de árbitro num jogo de futebol de bairro e ninguém te insultou"),
    tk("Vendeste castanhas assadas na Baixa"),
    tk("Arrumaste o armazém de uma loja de jogos"),
    tk("Fizeste uma stream de 8 horas e houve quem doasse"),
    tk("Lavaste carros num domingo de sol"),
    tk("Deste explicações de matemática"),
    tk("Montaste um PC para um amigo e ele pagou em notas"),
    tk("Trabalhaste como barista e acertaste em todos os nomes nos copos"),
    tk("Consertaste a impressora do escritório à primeira"),
    tk("Testaste um jogo novo à procura de bugs"),
    tk("Ajudaste nas mudanças de um amigo (e só partiste um copo)"),
    tk("Fizeste DJ numa festa de anos"),
    tk("Editaste um vídeo para um youtuber"),
];

export interface WorkResult {
    reward: number;
    job: string;
    nextAt: number;
}

export async function claimWork(guildId: string, userId: string): Promise<{ ok: true; balance: number; result: WorkResult } | { ok: false; result: WorkResult }> {
    const settings = await getEconomySettings(guildId);
    if (!settings.enabled) throw new EconomyDisabledError();
    const now = Date.now();
    const cooldown = settings.work_cooldown_minutes * 60_000;
    const multiplier = await eventMultiplier(guildId, "work");
    return claimWithLock<WorkResult>(guildId, userId, settings.start_balance, (account) => {
        const readyAt = account.last_work_at + cooldown;
        if (account.last_work_at && readyAt > now) return { refuse: { reward: 0, job: "", nextAt: readyAt } };
        const reward = Math.round(randomInt(settings.work_min, settings.work_max + 1) * multiplier);
        const job = JOBS[randomInt(0, JOBS.length)]!;
        return {
            amount: reward,
            kind: "work",
            note: t(job),
            patch: { last_work_at: now },
            result: { reward, job: t(job), nextAt: now + cooldown },
        };
    });
}

// ─── Loja ────────────────────────────────────────────────────────────────────

export type PurchaseOutcome =
    | { ok: true; balance: number; item: ShopItem; expiresAt: number | null }
    | { ok: false; reason: string };

export async function buyShopItem(member: GuildMember, itemId: string): Promise<PurchaseOutcome> {
    const settings = await getEconomySettings(member.guild.id);
    if (!settings.enabled) return { ok: false, reason: t("A economia está desligada neste servidor.") };
    const item = settings.shop.find((entry) => entry.id === itemId);
    if (!item) return { ok: false, reason: t("Esse artigo já não está à venda.") };
    const role = member.guild.roles.cache.get(item.role_id);
    if (!role) return { ok: false, reason: t("O cargo deste artigo já não existe. Avisa a administração.") };
    if (!role.editable) return { ok: false, reason: t("O bot não consegue dar o cargo {role} (está acima do cargo do bot).", { role: role.name }) };
    if (item.duration_days === 0 && member.roles.cache.has(role.id)) return { ok: false, reason: t("Já tens o cargo {role}.", { role: `<@&${role.id}>` }) };

    const balance = await spendCoins(member.guild.id, member.id, item.price, "shop", item.name);
    if (balance === null) return { ok: false, reason: t("Não tens moedas suficientes — custa {price}.", { price: formatCoins(item.price, settings) }) };

    try {
        let expiresAt: number | null = null;
        if (item.duration_days > 0) {
            const record = await applyTempRole(member.guild, {
                guildId: member.guild.id,
                userId: member.id,
                roleId: role.id,
                grantedBy: member.client.user.id,
                reason: t("Loja: {item}", { item: item.name }),
                durationMs: item.duration_days * 86_400_000,
            });
            expiresAt = record.expires_at;
        } else {
            await member.roles.add(role.id, t("Loja: {item}", { item: item.name }));
        }
        void economyLog(member.guild, settings, t("{user} comprou **{item}** por {price}.", { user: `<@${member.id}>`, item: item.name, price: formatCoins(item.price, settings) }));
        return { ok: true, balance, item, expiresAt };
    } catch (error) {
        // O cargo falhou: devolve as moedas.
        await grantCoins(member.guild.id, member.id, item.price, "refund", item.name);
        logger.warn("Loja: falha a entregar o cargo:", error);
        return { ok: false, reason: t("Não consegui entregar o cargo — as moedas foram devolvidas.") };
    }
}

// ─── Registo e tarefas ───────────────────────────────────────────────────────

export async function economyLog(guild: Guild, settings: EconomySettings, text: string): Promise<void> {
    if (!settings.log_channel) return;
    const channel = guild.channels.cache.get(settings.log_channel);
    if (!channel?.isTextBased()) return;
    await (channel as TextChannel).send({
        components: [buildContainer({ color: COLORS.gold, title: `${e("coin")} ${t("Economia")}`, description: text })],
        flags: CV2_FLAG,
        allowedMentions: { parse: [] },
    }).catch(() => null);
}

let jobsStarted = false;

/** Limpa o histórico de movimentos com mais de 120 dias (uma vez por dia). */
export function startEconomyJobs(_client: Client<true>): void {
    if (jobsStarted) return;
    jobsStarted = true;
    const prune = () => void pruneLedger(120)
        .then((removed) => { if (removed > 0) logger.info(`Economia: ${removed} movimento(s) antigo(s) removido(s) do histórico.`); })
        .catch((error) => logger.warn("Economia: falha a limpar o histórico:", error));
    setTimeout(prune, 60_000).unref?.();
    setInterval(prune, 86_400_000).unref?.();
}
