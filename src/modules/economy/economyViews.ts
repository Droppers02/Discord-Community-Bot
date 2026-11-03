import { StringSelectMenuBuilder, type GuildMember } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row, type Row } from "../../lib/containers.js";
import { e, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t, tk } from "../../lib/i18n.js";
import { timestamp } from "../../lib/time.js";
import { balanceRank, recentLedger, type EconomyAccount } from "../../repositories/economyRepository.js";
import { formatCoins, type DailyResult, type WorkResult } from "./economyService.js";
import type { EconomySettings } from "./economySettings.js";

export async function buildBalanceCard(member: GuildMember, account: EconomyAccount, settings: EconomySettings): Promise<ContainerPlusBuilder> {
    const rank = account.balance > 0 ? await balanceRank(member.guild.id, account.balance) : null;
    return buildContainer({
        color: COLORS.gold,
        title: `${e("wallet")} ${t("Carteira de {name}", { name: member.displayName })}`,
        thumbnailUrl: member.displayAvatarURL({ size: 256 }),
        description: [
            `# ${formatCoins(account.balance)}`,
            `-# ${settings.currency_name}${rank ? ` · ${t("#{rank} mais rico do servidor", { rank })}` : ""}`,
        ].join("\n"),
        fields: [
            {
                name: t("Resumo"),
                value: [
                    t("Ganho no total: {value}", { value: formatCoins(account.total_earned) }),
                    t("Gasto no total: {value}", { value: formatCoins(account.total_spent) }),
                    t("Sequência do diário: **{streak}** (melhor: {best})", { streak: account.daily_streak, best: account.best_daily_streak }),
                ].join("\n"),
            },
        ],
    });
}

export function buildDailyResult(result: DailyResult, balance: number, settings: EconomySettings): ContainerPlusBuilder {
    const lines = [
        `## ${formatCoins(result.reward, settings)}`,
        t("Base: {base} · Bónus de sequência: {bonus}", { base: formatNumber(result.base), bonus: formatNumber(result.bonus) }),
        result.eventMultiplier > 1 ? `🎉 ${t("Evento ativo: ×{mult}!", { mult: result.eventMultiplier })}` : null,
        result.milestone ? `${e("trophy")} ${t("**Marco de {days} dias!** +{amount} extra.", { days: result.streak, amount: formatNumber(result.milestone) })}` : null,
        result.lostStreak ? `${e("warn")} ${t("Falhaste um dia e a sequência recomeçou.")}` : null,
        "",
        `${e("flame")} ${t("Sequência: **{streak} {streak, plural, one {dia} other {dias}}** (melhor: {best})", { streak: result.streak, best: result.best })}`,
        `${e("wallet")} ${t("Saldo: {balance}", { balance: formatCoins(balance) })}`,
    ].filter((line) => line !== null);
    return buildContainer({
        color: COLORS.success,
        title: `${e("gift")} ${t("Recompensa diária")}`,
        description: lines.join("\n"),
        footerText: t("Volta amanhã para manteres a sequência — o diário renova à meia-noite."),
    });
}

export function buildDailyRefused(result: DailyResult): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.warning,
        title: `${e("hourglass")} ${t("Já recebeste o diário hoje")}`,
        description: t("O próximo fica disponível {at}.\nSequência atual: **{streak}** {streak, plural, one {dia} other {dias}}.", { at: timestamp(result.nextAt, "R"), streak: result.streak }),
    });
}

export function buildWorkResult(result: WorkResult, balance: number, settings: EconomySettings): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.success,
        title: `${e("hammer")} ${t("Trabalho feito")}`,
        description: [
            `${result.job}.`,
            `## +${formatCoins(result.reward, settings)}`,
            `${e("wallet")} ${t("Saldo: {balance}", { balance: formatCoins(balance) })}`,
        ].join("\n"),
        footerText: t("Podes voltar a trabalhar daqui a {minutes} min.", { minutes: settings.work_cooldown_minutes }),
    });
}

export function buildWorkRefused(result: WorkResult): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.warning,
        title: `${e("sleeping")} ${t("Ainda estás cansado")}`,
        description: t("Podes voltar a trabalhar {at}.", { at: timestamp(result.nextAt, "R") }),
    });
}

const KIND_LABELS: Record<string, string> = {
    daily: tk("Diário"),
    work: tk("Trabalho"),
    transfer_in: tk("Transferência recebida"),
    transfer_out: tk("Transferência enviada"),
    shop: tk("Loja"),
    refund: tk("Devolução"),
    admin_add: tk("Administração"),
    admin_remove: tk("Administração"),
    admin_set: tk("Administração"),
    bet: tk("Aposta"),
    bet_win: tk("Prémio de aposta"),
    bet_refund: tk("Aposta devolvida"),
    game_reward: tk("Prémio de jogo"),
};

export async function buildLedger(member: GuildMember, settings: EconomySettings): Promise<ContainerPlusBuilder> {
    const entries = await recentLedger(member.guild.id, member.id, 15);
    const lines = entries.map((entry) => {
        const sign = entry.amount >= 0 ? "+" : "−";
        const label = t(KIND_LABELS[entry.kind] ?? entry.kind);
        const note = entry.note && !entry.note.startsWith("→") && !entry.note.startsWith("←") ? ` · ${entry.note.slice(0, 50)}` : "";
        return `\`${sign}${formatNumber(Math.abs(entry.amount)).padStart(8)}\` ${label}${note} · ${timestamp(entry.created_at, "R")}`;
    });
    return buildContainer({
        color: COLORS.info,
        title: `${e("receipt")} ${t("Movimentos de {name}", { name: member.displayName })}`,
        description: lines.length ? lines.join("\n") : t("Ainda não há movimentos."),
        footerText: settings.currency_name,
    });
}

export function buildShop(settings: EconomySettings, balance: number, viewerId: string): ContainerPlusBuilder {
    const items = settings.shop;
    const lines = items.map((item) => [
        `### ${item.name} — ${formatCoins(item.price)}`,
        `${e("role")} <@&${item.role_id}>${item.duration_days > 0 ? ` · ${t("{days, plural, one {# dia} other {# dias}}", { days: item.duration_days })}` : ` · ${t("para sempre")}`}`,
        item.description ? `-# ${item.description}` : null,
    ].filter(Boolean).join("\n"));
    const rows: Row[] = [];
    if (items.length) {
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId(buildCustomId("eco", "buy", viewerId))
            .setPlaceholder(t("Comprar um artigo…"))
            .addOptions(items.map((item) => ({
                label: item.name.slice(0, 100),
                value: item.id,
                description: `${formatNumber(item.price)} · ${item.duration_days > 0 ? t("{days} dias", { days: item.duration_days }) : t("para sempre")}`.slice(0, 100),
                emoji: ei(balance >= item.price ? "cart" : "lock"),
            })))));
    }
    return buildContainer({
        color: COLORS.gold,
        title: `${e("shop")} ${t("Loja")}`,
        description: items.length ? lines.join("\n") : t("A loja ainda está vazia. A administração pode pôr cargos à venda em `/config → Economia`."),
        footerText: t("O teu saldo: {balance}", { balance: `${formatNumber(balance)} ${settings.currency_name}` }),
        rows,
    });
}
