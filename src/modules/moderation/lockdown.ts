import {
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    type CategoryChannel,
    type Client,
    type Guild,
    type GuildBasedChannel,
    type PermissionsString,
    type ThreadChannel,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query } from "#database";
import { ourGuilds } from "../../config.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import { appendAuditLog } from "../../services/auditService.js";
import { getLockdownSettings, insideQuietWindow, type LockdownSettings, type QuietRule } from "./lockdownSettings.js";

// Trancar: tira a @everyone (ou aos cargos escolhidos) o direito de escrever, criar fios, reagir e
// fazer sondagens. Antes de mexer, guarda o que o canal tinha (channel_locks) — destrancar repõe
// exatamente esses bits e não toca no resto, mesmo que alguém tenha mudado permissões entretanto.
// Fontes: "manual" (/trancar canal), "server" (/trancar servidor), "raid" (anti-raid) e
// "quiet:<regra>" (horário de silêncio). O slowmode do horário usa role_id = "slowmode" e guarda
// o slowmode anterior em prev_allow.

export const LOCK_FLAGS: PermissionsString[] = ["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads", "AddReactions", "SendPolls"];
const SLOWMODE_ROLE = "slowmode";
const TICK_MS = 30_000;

export type LockableChannel = Exclude<GuildBasedChannel, ThreadChannel | CategoryChannel>;

export interface LockRow {
    guild_id: string;
    channel_id: string;
    role_id: string;
    had_overwrite: boolean;
    prev_allow: string;
    prev_deny: string;
    source: string;
    reason: string | null;
    locked_by: string;
    locked_at: number;
    until_at: number | null;
}

function toLock(row: Record<string, unknown>): LockRow {
    return {
        guild_id: String(row.guild_id),
        channel_id: String(row.channel_id),
        role_id: String(row.role_id),
        had_overwrite: Boolean(row.had_overwrite),
        prev_allow: String(row.prev_allow ?? "0"),
        prev_deny: String(row.prev_deny ?? "0"),
        source: String(row.source),
        reason: (row.reason as string | null) ?? null,
        locked_by: String(row.locked_by),
        locked_at: Number(row.locked_at),
        until_at: row.until_at === null || row.until_at === undefined ? null : Number(row.until_at),
    };
}

export async function locksOfGuild(guildId: string): Promise<LockRow[]> {
    const { rows } = await query("SELECT * FROM channel_locks WHERE guild_id = $1 ORDER BY locked_at", [guildId]);
    return rows.map(toLock);
}

async function insertLock(lock: LockRow): Promise<boolean> {
    const result = await query(
        `INSERT INTO channel_locks (guild_id, channel_id, role_id, had_overwrite, prev_allow, prev_deny, source, reason, locked_by, locked_at, until_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING`,
        [lock.guild_id, lock.channel_id, lock.role_id, lock.had_overwrite, lock.prev_allow, lock.prev_deny, lock.source, lock.reason, lock.locked_by, lock.locked_at, lock.until_at],
    );
    return (result.rowCount ?? 0) > 0;
}

async function deleteLock(lock: Pick<LockRow, "guild_id" | "channel_id" | "role_id">): Promise<void> {
    await query("DELETE FROM channel_locks WHERE guild_id = $1 AND channel_id = $2 AND role_id = $3", [lock.guild_id, lock.channel_id, lock.role_id]);
}

export function isLockable(channel: GuildBasedChannel | null | undefined): channel is LockableChannel {
    return Boolean(channel && !channel.isThread() && channel.type !== ChannelType.GuildCategory && "permissionOverwrites" in channel);
}

function lockRoles(guild: Guild, settings: LockdownSettings): string[] {
    const roles = settings.roles.filter((id) => guild.roles.cache.has(id));
    return roles.length ? roles : [guild.roles.everyone.id];
}

/** O bot consegue mexer nas permissões deste canal? */
export function botCanLock(channel: LockableChannel): boolean {
    const me = channel.guild.members.me;
    return Boolean(me && channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels]));
}

/** Patch de permissões que repõe o estado guardado (só nos bits que a tranca mexeu). */
export function restorePatch(prevAllow: bigint, prevDeny: bigint): Record<string, boolean | null> {
    return Object.fromEntries(LOCK_FLAGS.map((name) => {
        const bit = PermissionFlagsBits[name];
        return [name, (prevAllow & bit) === bit ? true : (prevDeny & bit) === bit ? false : null];
    }));
}

async function announce(channel: LockableChannel, locked: boolean, text: string): Promise<void> {
    if (!channel.isTextBased()) return;
    await channel.send({
        components: [buildContainer({ color: locked ? COLORS.danger : COLORS.success, description: text })],
        flags: CV2_FLAG,
        allowedMentions: { parse: [] },
    }).catch(() => null);
}

export interface LockInput {
    source: string;
    reason: string | null;
    by: string;
    until: number | null;
    /** Aviso no canal (null = segundo as definições). */
    notice?: string | null;
}

/** Tranca um canal para os cargos configurados. Devolve quantos cargos ficaram trancados. */
export async function lockChannel(channel: LockableChannel, input: LockInput, settings?: LockdownSettings): Promise<{ locked: number; already: number; failed: number }> {
    const config = settings ?? await getLockdownSettings(channel.guild.id);
    const result = { locked: 0, already: 0, failed: 0 };
    if (!botCanLock(channel)) return { ...result, failed: 1 };
    const patch = Object.fromEntries(LOCK_FLAGS.map((name) => [name, false]));
    for (const roleId of lockRoles(channel.guild, config)) {
        const overwrite = channel.permissionOverwrites.cache.get(roleId);
        const fresh = await insertLock({
            guild_id: channel.guild.id,
            channel_id: channel.id,
            role_id: roleId,
            had_overwrite: Boolean(overwrite),
            prev_allow: (overwrite?.allow.bitfield ?? 0n).toString(),
            prev_deny: (overwrite?.deny.bitfield ?? 0n).toString(),
            source: input.source,
            reason: input.reason,
            locked_by: input.by,
            locked_at: Date.now(),
            until_at: input.until,
        });
        if (!fresh) { result.already++; continue; }
        try {
            await channel.permissionOverwrites.edit(roleId, patch, { reason: input.reason ?? t("Canal trancado") });
            result.locked++;
        } catch (error) {
            await deleteLock({ guild_id: channel.guild.id, channel_id: channel.id, role_id: roleId });
            result.failed++;
            logger.warn(`Trancar: falha em ${channel.id}:`, error);
        }
    }
    if (result.locked && config.announce && input.notice !== null) {
        await announce(channel, true, input.notice ?? [
            `${e("lock")} **${t("Canal trancado")}**`,
            input.reason ? t("Motivo: {reason}", { reason: input.reason }) : null,
            input.until ? `-# ${t("Volta a abrir {when}.", { when: timestamp(input.until, "R") })}` : null,
        ].filter(Boolean).join("\n"));
    }
    return result;
}

/** Destranca (repõe) as trancas deste canal — todas, ou só as de uma fonte. */
export async function unlockChannel(channel: LockableChannel | null, guildId: string, channelId: string, locks: LockRow[], opts: { reason?: string; notice?: string | null; settings?: LockdownSettings } = {}): Promise<number> {
    let restored = 0;
    for (const lock of locks.filter((entry) => entry.channel_id === channelId)) {
        if (!channel) { await deleteLock(lock); continue; }
        try {
            if (lock.role_id === SLOWMODE_ROLE) {
                if ("setRateLimitPerUser" in channel) await channel.setRateLimitPerUser(Number(lock.prev_allow) || 0, opts.reason);
            } else {
                await channel.permissionOverwrites.edit(lock.role_id, restorePatch(BigInt(lock.prev_allow), BigInt(lock.prev_deny)), { reason: opts.reason ?? t("Canal destrancado") });
                const overwrite = channel.permissionOverwrites.cache.get(lock.role_id);
                if (!lock.had_overwrite && overwrite && overwrite.allow.bitfield === 0n && overwrite.deny.bitfield === 0n) await overwrite.delete(opts.reason).catch(() => null);
            }
            restored++;
        } catch (error) {
            logger.warn(`Destrancar: falha em ${channelId}:`, error);
        }
        await deleteLock(lock);
    }
    const settings = opts.settings ?? (channel ? await getLockdownSettings(guildId) : null);
    if (channel && restored && settings?.announce && opts.notice !== null) {
        await announce(channel, false, opts.notice ?? `${e("unlock")} **${t("Canal reaberto")}** — ${t("já podem voltar a escrever.")}`);
    }
    return restored;
}

/** Canais que o "trancar servidor" fecha: onde os cargos trancados hoje podem escrever. */
export function serverLockTargets(guild: Guild, settings: LockdownSettings): LockableChannel[] {
    const roles = lockRoles(guild, settings).map((id) => guild.roles.cache.get(id)!).filter(Boolean);
    return [...guild.channels.cache.values()].filter((channel): channel is LockableChannel => {
        if (!isLockable(channel) || settings.excluded_channels.includes(channel.id)) return false;
        if (!channel.isTextBased() && channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildMedia) return false;
        if (!botCanLock(channel)) return false;
        return roles.some((role) => channel.permissionsFor(role).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]));
    });
}

export async function lockServer(guild: Guild, input: LockInput): Promise<{ channels: number; failed: number; invitesPaused: boolean }> {
    const settings = await getLockdownSettings(guild.id);
    const targets = serverLockTargets(guild, settings);
    let channels = 0;
    let failed = 0;
    const notice = [
        `${e("lock")} **${input.source === "raid" ? t("Servidor trancado — raid detetado") : t("Servidor trancado")}**`,
        input.reason ? t("Motivo: {reason}", { reason: input.reason }) : null,
        input.until ? `-# ${t("Volta a abrir {when}.", { when: timestamp(input.until, "R") })}` : `-# ${t("A equipa reabre assim que estiver tudo calmo.")}`,
    ].filter(Boolean).join("\n");
    for (let i = 0; i < targets.length; i += 5) {
        const results = await Promise.all(targets.slice(i, i + 5).map((channel) => lockChannel(channel, { ...input, notice }, settings)));
        for (const result of results) {
            if (result.locked) channels++;
            if (result.failed) failed++;
        }
    }
    let invitesPaused = false;
    if (settings.pause_invites) {
        const until = new Date(Math.min(input.until ?? Date.now() + 86_400_000, Date.now() + 86_400_000));
        invitesPaused = await guild.setIncidentActions({ invitesDisabledUntil: until }).then(() => true).catch(() => false);
    }
    appendAuditLog({ guildId: guild.id, actorId: input.by, action: "lockdown.server", details: { channels, failed, source: input.source, reason: input.reason, until: input.until } });
    return { channels, failed, invitesPaused };
}

export async function unlockServer(guild: Guild, by: string): Promise<number> {
    const settings = await getLockdownSettings(guild.id);
    const locks = (await locksOfGuild(guild.id)).filter((lock) => lock.source === "server" || lock.source === "raid");
    let restored = 0;
    for (const channelId of new Set(locks.map((lock) => lock.channel_id))) {
        const channel = guild.channels.cache.get(channelId);
        restored += await unlockChannel(isLockable(channel) ? channel : null, guild.id, channelId, locks, { settings, notice: `${e("unlock")} **${t("Servidor reaberto")}** — ${t("obrigado pela paciência!")}` }) ? 1 : 0;
    }
    if (settings.pause_invites) await guild.setIncidentActions({ invitesDisabledUntil: null }).catch(() => null);
    appendAuditLog({ guildId: guild.id, actorId: by, action: "lockdown.server.unlock", details: { channels: restored } });
    return restored;
}

/** O servidor está trancado? (alguma tranca do servidor ou do anti-raid) */
export function serverLocked(locks: LockRow[]): boolean {
    return locks.some((lock) => lock.source === "server" || lock.source === "raid");
}

// ─── Estado (para /trancar estado e as respostas) ───────────────────────────

function sourceLabel(source: string, settings: LockdownSettings): string {
    if (source === "manual") return t("manual");
    if (source === "server") return t("servidor");
    if (source === "raid") return t("anti-raid");
    if (source.startsWith("quiet:")) return t("horário «{name}»", { name: settings.quiet_rules.find((rule) => `quiet:${rule.id}` === source)?.name ?? "?" });
    return source;
}

export async function lockStatusView(guild: Guild): Promise<ContainerPlusBuilder> {
    const [locks, settings] = await Promise.all([locksOfGuild(guild.id), getLockdownSettings(guild.id)]);
    const byChannel = new Map<string, LockRow>();
    for (const lock of locks) if (!byChannel.has(lock.channel_id)) byChannel.set(lock.channel_id, lock);
    const lines = [...byChannel.values()].slice(0, 30).map((lock) => {
        const slow = lock.role_id === SLOWMODE_ROLE ? ` · ${t("slowmode")}` : "";
        const until = lock.until_at ? ` · ${t("abre {when}", { when: timestamp(lock.until_at, "R") })}` : "";
        return `${e("lock")} <#${lock.channel_id}> — ${sourceLabel(lock.source, settings)}${slow}${until}`;
    });
    const buttons: ButtonBuilder[] = [];
    if (serverLocked(locks)) buttons.push(new ButtonBuilder().setCustomId(buildCustomId("lock", "unlockserver")).setLabel(t("Destrancar o servidor")).setEmoji(ei("unlock")).setStyle(ButtonStyle.Success));
    if (locks.some((lock) => lock.source === "manual")) buttons.push(new ButtonBuilder().setCustomId(buildCustomId("lock", "unlockmanual")).setLabel(t("Destrancar os canais manuais")).setEmoji(ei("unlock")).setStyle(ButtonStyle.Secondary));
    return buildContainer({
        color: locks.length ? COLORS.warning : COLORS.success,
        title: `${e("lock")} ${t("Trancas")}`,
        description: lines.length ? lines.join("\n") + (byChannel.size > 30 ? `\n-# ${t("+{n} canais", { n: byChannel.size - 30 })}` : "") : t("Está tudo aberto. 🔓"),
        footerText: settings.quiet_enabled && settings.quiet_rules.length ? t("Horário de silêncio ligado ({n} regras).", { n: settings.quiet_rules.length }) : null,
        rows: buttons.length ? [row(...buttons)] : [],
    });
}

// ─── Tarefas: desbloqueios marcados e horário de silêncio ────────────────────

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function lisbonClock(ms: number): { weekday: number; minute: number } {
    const parts = Object.fromEntries(clock.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
    return { weekday: WEEKDAYS.indexOf(parts.weekday ?? "Sun"), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

async function applyQuietRules(guild: Guild, settings: LockdownSettings, locks: LockRow[], now: number): Promise<void> {
    const { weekday, minute } = lisbonClock(now);
    const active = new Map<string, QuietRule>();
    if (settings.quiet_enabled) {
        for (const rule of settings.quiet_rules) if (rule.enabled && insideQuietWindow(rule, weekday, minute)) active.set(`quiet:${rule.id}`, rule);
    }
    // Fechar o que deve estar fechado.
    for (const [source, rule] of active) {
        for (const channelId of rule.channels) {
            const channel = guild.channels.cache.get(channelId);
            if (!isLockable(channel) || locks.some((lock) => lock.channel_id === channelId && lock.source === source)) continue;
            const notice = rule.announce ? `🌙 **${rule.name}** — ${rule.mode === "lock" ? t("o canal fecha até às {end}.", { end: rule.end }) : t("slowmode de {s} s até às {end}.", { s: rule.slowmode, end: rule.end })}` : null;
            if (rule.mode === "lock") {
                await lockChannel(channel, { source, reason: t("Horário de silêncio: {name}", { name: rule.name }), by: guild.client.user.id, until: null, notice }, settings);
            } else if ("setRateLimitPerUser" in channel) {
                const fresh = await insertLock({ guild_id: guild.id, channel_id: channelId, role_id: SLOWMODE_ROLE, had_overwrite: false, prev_allow: String(channel.rateLimitPerUser ?? 0), prev_deny: "0", source, reason: rule.name, locked_by: guild.client.user.id, locked_at: now, until_at: null });
                if (!fresh) continue;
                await channel.setRateLimitPerUser(rule.slowmode, t("Horário de silêncio: {name}", { name: rule.name })).catch(() => null);
                if (notice && channel.isTextBased()) await announce(channel, true, notice);
            }
        }
    }
    // Abrir o que já passou da hora (ou cuja regra mudou/saiu).
    const stale = locks.filter((lock) => lock.source.startsWith("quiet:") && (!active.has(lock.source) || !active.get(lock.source)!.channels.includes(lock.channel_id)));
    for (const channelId of new Set(stale.map((lock) => lock.channel_id))) {
        const channel = guild.channels.cache.get(channelId);
        const rule = settings.quiet_rules.find((entry) => stale.some((lock) => lock.channel_id === channelId && lock.source === `quiet:${entry.id}`));
        await unlockChannel(isLockable(channel) ? channel : null, guild.id, channelId, stale, {
            settings,
            reason: t("Fim do horário de silêncio"),
            notice: rule?.announce ? `☀️ **${rule.name}** — ${t("o canal está aberto outra vez.")}` : null,
        });
    }
}

async function tick(client: Client<true>): Promise<void> {
    const now = Date.now();
    for (const guild of ourGuilds(client)) {
        const [settings, locks] = await Promise.all([getLockdownSettings(guild.id), locksOfGuild(guild.id)]);
        const due = locks.filter((lock) => lock.until_at !== null && lock.until_at <= now);
        if (due.some((lock) => lock.source === "server" || lock.source === "raid")) {
            await unlockServer(guild, client.user.id);
        }
        const manual = due.filter((lock) => lock.source === "manual");
        for (const channelId of new Set(manual.map((lock) => lock.channel_id))) {
            const channel = guild.channels.cache.get(channelId);
            await unlockChannel(isLockable(channel) ? channel : null, guild.id, channelId, manual, { settings, reason: t("Fim da tranca") });
        }
        await applyQuietRules(guild, settings, locks.filter((lock) => !due.includes(lock)), now);
    }
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startLockdownJobs(client: Client<true>): void {
    if (timer) return;
    const run = async () => {
        if (running) return;
        running = true;
        try {
            await tick(client);
        } catch (error) {
            logger.warn("Trancas: falha na tarefa:", error);
        } finally {
            running = false;
        }
    };
    setTimeout(() => void run(), 15_000).unref?.();
    timer = setInterval(() => void run(), TICK_MS);
    timer.unref?.();
}
