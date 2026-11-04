import { type Guild, type GuildMember, type GuildTextBasedChannel, type TextChannel, type User } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess, outranks } from "../../lib/discord.js";
import { e, type EmojiName } from "../../lib/emojis.js";
import { t, tk } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { humanizeDuration, timestamp } from "../../lib/time.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { countActiveWarns, createCase, type ModAction, type ModCase } from "../../repositories/modCaseRepository.js";
import { appendAuditLog } from "../../services/auditService.js";
import { getModerationSettings, type ModerationSettings, type WarnThreshold } from "./moderationSettings.js";
import { banAppealNotice } from "../appeals/appealAccess.js";
import { appealsOpen } from "../appeals/appealService.js";

export const ACTION_LABELS: Record<ModAction, string> = {
    warn: tk("Aviso"),
    timeout: tk("Castigo"),
    untimeout: tk("Castigo retirado"),
    kick: tk("Expulsão"),
    ban: tk("Banimento"),
    unban: tk("Banimento retirado"),
    purge: tk("Limpeza de mensagens"),
};

const ACTION_ICONS: Record<ModAction, EmojiName> = {
    warn: "warn",
    timeout: "timeout",
    untimeout: "unlock",
    kick: "leave",
    ban: "ban",
    unban: "unlock",
    purge: "trash",
};

const ACTION_COLORS: Record<ModAction, number> = {
    warn: COLORS.warning,
    timeout: COLORS.warning,
    untimeout: COLORS.success,
    kick: COLORS.danger,
    ban: COLORS.danger,
    unban: COLORS.success,
    purge: COLORS.info,
};

/** Máximo do timeout do Discord: 28 dias. */
export const MAX_TIMEOUT_MS = 28 * 86_400_000;

/** Pode usar /mod? Permissão do Discord, cargo de moderação, ou super-admin. */
export async function hasModAccess(member: GuildMember, permission: bigint): Promise<boolean> {
    if (member.permissions.has(permission)) return true;
    const [settings, config] = await Promise.all([getModerationSettings(member.guild.id), ensureGuildConfig(member.guild.id)]);
    if (hasSuperAdminAccess(member, config.admin_role)) return true;
    return Boolean(settings.mod_role && member.roles.cache.has(settings.mod_role));
}

/** Problema de hierarquia (texto para mostrar), ou null se a ação pode avançar. */
/** Quem pede está acima do alvo? (sem olhar para o que o bot consegue — usado também nos avisos) */
export function rankProblem(actor: GuildMember, target: GuildMember): string | null {
    if (target.id === actor.id) return t("Não te podes moderar a ti mesmo.");
    if (target.id === target.guild.ownerId) return t("Não dá para moderar o dono do servidor.");
    if (target.id === target.client.user.id) return t("Boa tentativa. 🙂");
    if (!outranks(actor, target)) return t("{user} tem um cargo igual ou acima do teu.", { user: `<@${target.id}>` });
    return null;
}

export function hierarchyProblem(actor: GuildMember, target: GuildMember, need: "moderate" | "kick" | "ban"): string | null {
    const rank = rankProblem(actor, target);
    if (rank) return rank;
    const able = need === "moderate" ? target.moderatable : need === "kick" ? target.kickable : target.bannable;
    if (!able) return t("O bot não tem permissão para isso em {user} (cargo do bot abaixo do dele?).", { user: `<@${target.id}>` });
    return null;
}

export function caseLine(entry: ModCase): string {
    const duration = entry.duration_seconds ? ` · ${humanizeDuration(entry.duration_seconds * 1000)}` : "";
    const struck = entry.action === "warn" && !entry.active;
    const text = `**#${entry.case_number}** ${e(ACTION_ICONS[entry.action])} ${t(ACTION_LABELS[entry.action])}${duration} — ${entry.reason ? entry.reason.slice(0, 120) : t("sem motivo")} · ${timestamp(entry.created_at, "R")} · <@${entry.moderator_id}>`;
    return struck ? `~~${text}~~` : text;
}

async function notify(user: User, guild: Guild, action: ModAction, reason: string | null, durationMs: number | null, settings: ModerationSettings): Promise<boolean> {
    if (user.bot) return false;
    // Banimento com os pedidos de revisão abertos: a DM vai sempre, com o link para adicionar o bot
    // à conta e o botão do pedido (ver modules/appeals/appealAccess.ts — sem adicionar o bot, o
    // Discord não lhe entrega os cliques de quem já não está no servidor).
    const appeal = action === "ban" && await appealsOpen(guild.id) ? banAppealNotice(guild.client, guild.id) : null;
    if (!settings.dm_on_action && !appeal) return false;
    const lines = [
        t("**Servidor:** {server}", { server: guild.name }),
        reason ? t("**Motivo:** {reason}", { reason }) : null,
        durationMs ? t("**Duração:** {duration} (até {until})", { duration: humanizeDuration(durationMs), until: timestamp(Date.now() + durationMs, "f") }) : null,
        appeal ? `\n${appeal.text}` : null,
    ].filter(Boolean);
    return user.send({
        components: [buildContainer({ color: ACTION_COLORS[action], title: `${e(ACTION_ICONS[action])} ${t(ACTION_LABELS[action])}`, description: lines.join("\n"), rows: appeal ? [appeal.row] : [] })],
        flags: CV2_FLAG,
    }).then(() => true).catch(() => false);
}

export async function modLog(guild: Guild, entry: ModCase, extra: string | null = null): Promise<void> {
    const settings = await getModerationSettings(guild.id);
    if (!settings.log_channel) return;
    const channel = guild.channels.cache.get(settings.log_channel);
    if (!channel?.isTextBased()) return;
    await (channel as TextChannel).send({
        components: [buildContainer({
            color: ACTION_COLORS[entry.action],
            title: `${e(ACTION_ICONS[entry.action])} ${t("Caso #{n} — {action}", { n: entry.case_number, action: t(ACTION_LABELS[entry.action]) })}`,
            fields: [
                { name: t("Membro"), value: `<@${entry.user_id}> (\`${entry.user_tag}\` · ${entry.user_id})` },
                { name: t("Moderador"), value: `<@${entry.moderator_id}>` },
                { name: t("Motivo"), value: entry.reason ?? t("*Sem motivo*") },
                ...(entry.duration_seconds ? [{ name: t("Duração"), value: humanizeDuration(entry.duration_seconds * 1000) }] : []),
                ...(extra ? [{ name: t("Nota"), value: extra }] : []),
            ],
        })],
        flags: CV2_FLAG,
        allowedMentions: { parse: [] },
    }).catch((error) => logger.warn("Moderação: falha a registar o caso:", error));
}

async function record(guild: Guild, user: User, moderatorId: string, action: ModAction, reason: string | null, durationMs: number | null, extra: string | null = null): Promise<ModCase> {
    const entry = await createCase(guild.id, {
        user_id: user.id,
        user_tag: user.tag,
        moderator_id: moderatorId,
        action,
        reason,
        duration_seconds: durationMs ? Math.round(durationMs / 1000) : null,
    });
    appendAuditLog({ guildId: guild.id, actorId: moderatorId, action: `mod.${action}`, details: { userId: user.id, case: entry.case_number, reason } });
    void modLog(guild, entry, extra);
    return entry;
}

export interface ModResult {
    entry: ModCase;
    dmSent: boolean;
    escalation: string | null;
}

/** Aviso + castigo automático se passar um limite. */
export async function warnMember(target: GuildMember, moderator: GuildMember, reason: string | null): Promise<ModResult> {
    const settings = await getModerationSettings(target.guild.id);
    const dmSent = await notify(target.user, target.guild, "warn", reason, null, settings);
    const entry = await record(target.guild, target.user, moderator.id, "warn", reason, null);
    const since = settings.warn_expiry_days > 0 ? Date.now() - settings.warn_expiry_days * 86_400_000 : 0;
    const active = await countActiveWarns(target.guild.id, target.id, since);
    const threshold = settings.thresholds.find((entry) => entry.count === active) ?? null;
    const escalation = threshold ? await escalate(target, moderator, threshold, active, settings) : null;
    return { entry, dmSent, escalation };
}

async function escalate(target: GuildMember, moderator: GuildMember, threshold: WarnThreshold, count: number, settings: ModerationSettings): Promise<string | null> {
    const reason = t("Automático: {count} avisos", { count });
    const botMember = target.guild.members.me;
    try {
        if (threshold.action === "timeout" && target.moderatable) {
            const ms = Math.min(threshold.minutes * 60_000, MAX_TIMEOUT_MS);
            await notify(target.user, target.guild, "timeout", reason, ms, settings);
            await target.timeout(ms, reason);
            await record(target.guild, target.user, botMember?.id ?? moderator.id, "timeout", reason, ms);
            return t("Castigo automático de {duration}.", { duration: humanizeDuration(ms) });
        }
        if (threshold.action === "kick" && target.kickable) {
            await notify(target.user, target.guild, "kick", reason, null, settings);
            await target.kick(reason);
            await record(target.guild, target.user, botMember?.id ?? moderator.id, "kick", reason, null);
            return t("Expulso automaticamente.");
        }
        if (threshold.action === "ban" && target.bannable) {
            await notify(target.user, target.guild, "ban", reason, null, settings);
            await target.ban({ reason });
            await record(target.guild, target.user, botMember?.id ?? moderator.id, "ban", reason, null);
            return t("Banido automaticamente.");
        }
    } catch (error) {
        logger.warn("Moderação: castigo automático falhou:", error);
    }
    return t("O castigo automático não foi aplicado (permissões do bot).");
}

export async function timeoutMember(target: GuildMember, moderator: GuildMember, ms: number, reason: string | null): Promise<ModResult> {
    const settings = await getModerationSettings(target.guild.id);
    const duration = Math.min(ms, MAX_TIMEOUT_MS);
    const dmSent = await notify(target.user, target.guild, "timeout", reason, duration, settings);
    await target.timeout(duration, reason ?? undefined);
    return { entry: await record(target.guild, target.user, moderator.id, "timeout", reason, duration), dmSent, escalation: null };
}

export async function removeTimeout(target: GuildMember, moderator: GuildMember, reason: string | null): Promise<ModResult> {
    const settings = await getModerationSettings(target.guild.id);
    await target.timeout(null, reason ?? undefined);
    const dmSent = await notify(target.user, target.guild, "untimeout", reason, null, settings);
    return { entry: await record(target.guild, target.user, moderator.id, "untimeout", reason, null), dmSent, escalation: null };
}

export async function kickMember(target: GuildMember, moderator: GuildMember, reason: string | null): Promise<ModResult> {
    const settings = await getModerationSettings(target.guild.id);
    // A DM vai ANTES: depois de sair, o bot já não partilha servidor com a pessoa.
    const dmSent = await notify(target.user, target.guild, "kick", reason, null, settings);
    await target.kick(reason ?? undefined);
    return { entry: await record(target.guild, target.user, moderator.id, "kick", reason, null), dmSent, escalation: null };
}

export async function banUser(guild: Guild, user: User, moderator: GuildMember, reason: string | null, deleteDays: number): Promise<ModResult> {
    const settings = await getModerationSettings(guild.id);
    const dmSent = guild.members.cache.has(user.id) ? await notify(user, guild, "ban", reason, null, settings) : false;
    await guild.members.ban(user, { reason: reason ?? undefined, deleteMessageSeconds: Math.max(0, Math.min(7, deleteDays)) * 86_400 });
    return { entry: await record(guild, user, moderator.id, "ban", reason, null), dmSent, escalation: null };
}

export async function unbanUser(guild: Guild, user: User, moderator: GuildMember, reason: string | null): Promise<ModResult> {
    await guild.members.unban(user, reason ?? undefined);
    return { entry: await record(guild, user, moderator.id, "unban", reason, null), dmSent: false, escalation: null };
}

/** Apaga até 100 mensagens recentes (o Discord só deixa apagar em massa até 14 dias). */
export async function purgeMessages(channel: GuildTextBasedChannel, moderator: GuildMember, amount: number, filterUserId: string | null): Promise<number> {
    const fetched = await channel.messages.fetch({ limit: filterUserId ? 100 : Math.min(100, amount) });
    const cutoff = Date.now() - 14 * 86_400_000 + 60_000;
    const targets = [...fetched.values()]
        .filter((message) => message.createdTimestamp > cutoff && !message.pinned)
        .filter((message) => !filterUserId || message.author.id === filterUserId)
        .slice(0, amount);
    if (!targets.length) return 0;
    const deleted = await channel.bulkDelete(targets, true);
    const target = filterUserId ? await channel.client.users.fetch(filterUserId).catch(() => null) : null;
    await record(channel.guild, target ?? moderator.user, moderator.id, "purge", t("{count} mensagens em {channel}", { count: deleted.size, channel: `<#${channel.id}>` }), null);
    return deleted.size;
}

/** ID de mensagem a partir de um ID ou de um link de mensagem. */
export function messageIdFrom(input: string): string | null {
    const match = input.trim().match(/(\d{15,25})\s*$/);
    return match ? match[1]! : null;
}

/**
 * Apaga as mensagens entre `fromId` e `toId` (inclusive; sem `toId`, até à mais recente) — o
 * "apartir" e o "intervalo" do bot antigo. No máximo 500, e só as com menos de 14 dias.
 */
export async function purgeRange(channel: GuildTextBasedChannel, moderator: GuildMember, fromId: string, toId: string | null): Promise<number> {
    const from = BigInt(fromId);
    const to = toId ? BigInt(toId) : null;
    const [low, high] = to !== null && to < from ? [to, from] : [from, to];
    const cutoff = Date.now() - 14 * 86_400_000 + 60_000;
    const collected: string[] = [];
    let after = (low - 1n).toString();
    for (let page = 0; page < 5; page++) {
        const batch = await channel.messages.fetch({ limit: 100, after });
        if (!batch.size) break;
        const sorted = [...batch.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
        for (const message of sorted) {
            if (high !== null && BigInt(message.id) > high) break;
            if (message.createdTimestamp > cutoff && !message.pinned) collected.push(message.id);
        }
        const last = sorted.at(-1)!;
        if ((high !== null && BigInt(last.id) >= high) || batch.size < 100) break;
        after = last.id;
    }
    let deleted = 0;
    for (let i = 0; i < collected.length; i += 100) {
        const result = await channel.bulkDelete(collected.slice(i, i + 100), true);
        deleted += result.size;
    }
    if (deleted) await record(channel.guild, moderator.user, moderator.id, "purge", t("{count} mensagens em {channel} (por intervalo)", { count: deleted, channel: `<#${channel.id}>` }), null);
    return deleted;
}
