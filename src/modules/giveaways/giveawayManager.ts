import { randomUUID } from "node:crypto";
import {
    ButtonBuilder,
    ButtonStyle,
    type Client,
    type GuildMember,
    type TextChannel,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row, type Row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";
import { clearManagedTimeout, scheduleManagedTimeout } from "../../lib/scheduler.js";
import {
    countEntrants,
    finishGiveaway,
    getEntries,
    getGiveawayById,
    getRunningGiveaways,
    insertGiveaway,
    setGiveawayMessage,
} from "../../repositories/giveawayRepository.js";
import { getCachedGuildConfig } from "../../repositories/guildConfigRepository.js";
import { appendAuditLog } from "../../services/auditService.js";
import type { GiveawayBonusRole, GiveawayRecord } from "../../types.js";
import { t } from "../../lib/i18n.js";

const endTimers = new Map<string, NodeJS.Timeout>();

/** Client role for a guild, read from the warm config cache (sync, no DB hit). */
function clientRoleOf(guildId: string): string | null {
    return getCachedGuildConfig(guildId)?.client_role ?? null;
}

// ─── Entry weighting ───────────────────────────────────────────────────────────
/** Total entries for a member: 1 base + the configured bonus for each matching role. */
export function computeMemberEntries(member: GuildMember, bonusRoles: GiveawayBonusRole[]): number {
    let entries = 1;
    for (const bonus of bonusRoles) {
        if (member.roles.cache.has(bonus.role_id)) entries += Math.max(0, bonus.entries);
    }
    return Math.max(1, entries);
}

/**
 * Weighted random selection of up to `count` distinct winners. Each entrant occupies a
 * slice of the cumulative weight proportional to their entries; selected entrants are
 * removed so the same user can't win twice. Pure — unit tested.
 */
export function pickWeightedWinners(
    entrants: Array<{ user_id: string; entries: number }>,
    count: number,
    random: () => number = Math.random,
): string[] {
    const pool = entrants.map((entry) => ({ user_id: entry.user_id, weight: Math.max(1, entry.entries) }));
    const winners: string[] = [];
    const target = Math.min(count, pool.length);

    for (let picked = 0; picked < target; picked++) {
        const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
        let roll = random() * totalWeight;
        let index = 0;
        for (; index < pool.length; index++) {
            roll -= pool[index].weight;
            if (roll <= 0) break;
        }
        const chosen = pool.splice(Math.min(index, pool.length - 1), 1)[0];
        if (chosen) winners.push(chosen.user_id);
    }
    return winners;
}

// ─── Requirements / eligibility ──────────────────────────────────────────────
export type JoinResult =
    | { ok: true; entries: number }
    | { ok: false; reason: "ended" | "missing_role" | "account_age" | "server_age" | "not_client" };

export interface EligibilityOptions {
    /** Role id that marks a member as a "client" — required when `giveaway.require_client`. */
    clientRoleId?: string | null;
}

export function checkEligibility(giveaway: GiveawayRecord, member: GuildMember, options: EligibilityOptions = {}): JoinResult {
    if (giveaway.status !== "running") return { ok: false, reason: "ended" };
    if (giveaway.required_role && !member.roles.cache.has(giveaway.required_role)) {
        return { ok: false, reason: "missing_role" };
    }
    if (giveaway.min_account_age_days > 0) {
        const ageMs = Date.now() - member.user.createdTimestamp;
        if (ageMs < giveaway.min_account_age_days * 86_400_000) return { ok: false, reason: "account_age" };
    }
    if (giveaway.min_server_age_days > 0) {
        const joinedMs = member.joinedTimestamp ?? Date.now();
        if (Date.now() - joinedMs < giveaway.min_server_age_days * 86_400_000) return { ok: false, reason: "server_age" };
    }
    if (giveaway.require_client) {
        // A member counts as a client only if the guild has a client role configured and
        // the member holds it. With no role configured the requirement can never be met.
        if (!options.clientRoleId || !member.roles.cache.has(options.clientRoleId)) {
            return { ok: false, reason: "not_client" };
        }
    }
    return { ok: true, entries: computeMemberEntries(member, giveaway.bonus_roles) };
}

// ─── UI ─────────────────────────────────────────────────────────────────────
function requirementLines(giveaway: GiveawayRecord, clientRoleId?: string | null): string {
    const lines: string[] = [];
    if (giveaway.required_role) lines.push(`${emoji.role} ${t("Cargo necessário: {role}", { role: `<@&${giveaway.required_role}>` })}`);
    if (giveaway.min_account_age_days > 0) lines.push(`${emoji.clock} ${t("Conta com mais de {days, plural, one {**#** dia} other {**#** dias}}", { days: giveaway.min_account_age_days })}`);
    if (giveaway.min_server_age_days > 0) lines.push(`${emoji.calendar} ${t("No servidor há mais de {days, plural, one {**#** dia} other {**#** dias}}", { days: giveaway.min_server_age_days })}`);
    if (giveaway.require_client) lines.push(`${emoji.crown} ${t("Reservado a **clientes**")}${clientRoleId ? ` (<@&${clientRoleId}>)` : ""}`);
    for (const bonus of giveaway.bonus_roles) {
        lines.push(`${emoji.star} <@&${bonus.role_id}> → ${t("{count, plural, one {**+#** entrada} other {**+#** entradas}}", { count: bonus.entries })}`);
    }
    return lines.length ? lines.join("\n") : t("Sem requisitos — aberto a todos.");
}

export function buildGiveawayContainer(giveaway: GiveawayRecord, entrantCount: number, clientRoleId?: string | null, announceEveryone = false): ContainerPlusBuilder {
    const endsRelative = `<t:${Math.floor(giveaway.ends_at / 1000)}:R>`;
    const shortId = giveaway.id.slice(0, 8);
    // A menção fica dentro do próprio container (como em todo o resto da UI) — nunca numa
    // mensagem de content à parte. Só aparece na publicação inicial, não em re-renders.
    const pingLine = announceEveryone ? "@everyone" : null;

    // Linha única de contadores (o CV2 não tem colunas lado a lado; isto é o equivalente compacto).
    const countsLine = (winners: number) =>
        `${emoji.crown} **${t("Vencedores")}** \`${winners}x\` • ${emoji.users} **${t("Participantes")}** \`${entrantCount}x\``;

    if (giveaway.status !== "running") {
        const cancelled = giveaway.status === "cancelled";
        const winnersLine = giveaway.winner_ids.length
            ? giveaway.winner_ids.map((id) => `${emoji.trophy} <@${id}>`).join(" • ")
            : t("*Sem participantes suficientes — sem vencedores.*");

        // Ended giveaways keep a status badge + reroll button (claim lives in the winner
        // announcement below). Cancelled giveaways get no buttons.
        const endedRows: Row[] = cancelled ? [] : [row(
            new ButtonBuilder().setCustomId(buildCustomId("giveaway", "ended", giveaway.id)).setLabel(t("Sorteio terminado")).setEmoji(emoji.gift).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(buildCustomId("giveaway", "reroll", giveaway.id)).setLabel(t("Reroll")).setEmoji(emoji.reroll).setStyle(ButtonStyle.Primary),
        )];

        return buildContainer({
            color: cancelled ? COLORS.neutral : COLORS.gold,
            title: `${emoji.gift} ${giveaway.prize}`,
            description: [
                cancelled ? t("Este sorteio foi **cancelado**.") : `${emoji.trophy} ${t("Este sorteio **terminou**! Obrigado a todos os participantes.")}`,
                ...(giveaway.description ? ["", giveaway.description] : []),
                "",
                `${emoji.trophy} ${t("**Prémio**")}`,
                `**${giveaway.prize}**`,
                "",
                `${emoji.clock} **${t("Finalizado")}**`,
                endsRelative,
                "",
                countsLine(giveaway.winner_ids.length || giveaway.winners_count),
                ...(cancelled ? [] : [winnersLine]),
                "",
                `-# ${t("Organizado por {user}", { user: `<@${giveaway.host_id}>` })}`,
            ].join("\n"),
            footerText: t("Terminado • ID {id}", { id: shortId }),
            rows: endedRows,
        });
    }

    const rows: Row[] = [row(
        new ButtonBuilder()
            .setCustomId(buildCustomId("giveaway", "join", giveaway.id))
            .setLabel(t("Participar • {count}", { count: entrantCount }))
            .setEmoji(emoji.gift)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(buildCustomId("gwview", giveaway.id, "recent", "0"))
            .setLabel(t("Participantes"))
            .setEmoji(emoji.users)
            .setStyle(ButtonStyle.Secondary),
    )];

    const hasRequirements = Boolean(
        giveaway.required_role || giveaway.min_account_age_days > 0 || giveaway.min_server_age_days > 0
        || giveaway.require_client || giveaway.bonus_roles.length,
    );

    return buildContainer({
        color: COLORS.gold,
        title: `${emoji.gift} ${giveaway.prize}`,
        description: [
            ...(pingLine ? [pingLine, ""] : []),
            `${emoji.heart} ${t("Carrega em **Participar** para entrares.")}`,
            ...(giveaway.description ? ["", giveaway.description] : []),
            "",
            `${emoji.trophy} ${t("**Prémio**")}`,
            `**${giveaway.prize}**`,
            "",
            `${emoji.clock} **${t("Finaliza")}**`,
            endsRelative,
            "",
            countsLine(giveaway.winners_count),
            ...(hasRequirements ? ["", `${emoji.shield} **${t("Requisitos")}**`, requirementLines(giveaway, clientRoleId)] : []),
            "",
            `-# ${t("Organizado por {user}", { user: `<@${giveaway.host_id}>` })}`,
        ].join("\n"),
        footerText: t("Sorteio • ID {id}", { id: shortId }),
        rows,
    });
}

/**
 * Botão de atalho para o `/giveaway listar`: com um só giveaway, um Link direto para a
 * mensagem; com vários, um botão que abre um seletor (ver responder "gwlist"). `null`
 * quando não há nada para mostrar (ex.: mensagem ainda não publicada).
 */
export function buildGiveawayJumpRow(guildId: string, giveaways: GiveawayRecord[]): Row | null {
    if (giveaways.length === 0) return null;
    if (giveaways.length === 1) {
        const target = giveaways[0];
        if (!target.message_id) return null;
        const url = `https://discord.com/channels/${guildId}/${target.channel_id}/${target.message_id}`;
        return row(new ButtonBuilder().setLabel(t("Ir à mensagem")).setEmoji(emoji.link).setStyle(ButtonStyle.Link).setURL(url));
    }
    return row(new ButtonBuilder().setCustomId(buildCustomId("gwlist", "pick")).setLabel(t("Ir a um sorteio")).setEmoji(emoji.link).setStyle(ButtonStyle.Secondary));
}

// ─── Message helpers ───────────────────────────────────────────────────────────
async function fetchGiveawayMessage(client: Client, giveaway: GiveawayRecord): Promise<{ channel: TextChannel; messageId: string } | null> {
    if (!giveaway.message_id) return null;
    try {
        const channel = await client.channels.fetch(giveaway.channel_id);
        if (!channel?.isTextBased() || channel.isDMBased()) return null;
        return { channel: channel as TextChannel, messageId: giveaway.message_id };
    } catch {
        return null;
    }
}

export async function refreshGiveawayMessage(client: Client, giveaway: GiveawayRecord): Promise<void> {
    const target = await fetchGiveawayMessage(client, giveaway);
    if (!target) return;
    const entrantCount = await countEntrants(giveaway.id);
    await target.channel.messages.edit(target.messageId, { components: [buildGiveawayContainer(giveaway, entrantCount, clientRoleOf(giveaway.guild_id))], flags: CV2_FLAG }).catch(() => null);
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────
export interface CreateGiveawayInput {
    guildId: string;
    channel: TextChannel;
    hostId: string;
    prize: string;
    description: string | null;
    winnersCount: number;
    durationMs: number;
    requiredRole: string | null;
    bonusRoles: GiveawayBonusRole[];
    minAccountAgeDays: number;
    minServerAgeDays: number;
    requireClient: boolean;
    /** Enviar um ping @everyone junto com a publicação (mensagem própria: o CV2 não leva content). */
    pingEveryone?: boolean;
}

export async function createGiveaway(client: Client, input: CreateGiveawayInput): Promise<GiveawayRecord> {
    const now = Date.now();
    const giveaway: GiveawayRecord = {
        id: randomUUID(),
        guild_id: input.guildId,
        channel_id: input.channel.id,
        message_id: null,
        host_id: input.hostId,
        prize: input.prize,
        description: input.description,
        winners_count: Math.max(1, input.winnersCount),
        status: "running",
        required_role: input.requiredRole,
        bonus_roles: input.bonusRoles,
        min_account_age_days: Math.max(0, input.minAccountAgeDays),
        min_server_age_days: Math.max(0, input.minServerAgeDays),
        require_client: input.requireClient,
        ends_at: now + input.durationMs,
        created_at: now,
        ended_at: null,
        winner_ids: [],
    };

    await insertGiveaway(giveaway);
    // A menção (@everyone) vai DENTRO do próprio container CV2 — uma única mensagem.
    // allowedMentions é explícito para garantir o ping mesmo quando a publicação
    // também contém menções de cargo (requisitos), sem depender do default da API.
    const message = await input.channel.send({
        components: [buildGiveawayContainer(giveaway, 0, clientRoleOf(giveaway.guild_id), input.pingEveryone)],
        flags: CV2_FLAG,
        allowedMentions: input.pingEveryone ? { parse: ["everyone", "roles", "users"] } : undefined,
    });
    await setGiveawayMessage(giveaway.id, message.id);
    giveaway.message_id = message.id;
    scheduleGiveawayEnd(client, giveaway);
    appendAuditLog({ guildId: input.guildId, actorId: input.hostId, action: "giveaway.create", details: { giveawayId: giveaway.id, prize: giveaway.prize, winners: giveaway.winners_count } });
    return giveaway;
}

export function scheduleGiveawayEnd(client: Client, giveaway: GiveawayRecord): void {
    scheduleManagedTimeout(endTimers, giveaway.id, Math.max(0, giveaway.ends_at - Date.now()), () => {
        void endGiveaway(client, giveaway.id).catch((err) => logger.error("Falha ao terminar sorteio:", err));
    });
}

async function announceWinners(client: Client, giveaway: GiveawayRecord, winners: string[]): Promise<void> {
    const target = await fetchGiveawayMessage(client, giveaway);
    if (!target) return;
    const url = `https://discord.com/channels/${giveaway.guild_id}/${giveaway.channel_id}/${target.messageId}`;

    let text: string;
    if (winners.length === 0) {
        text = `${emoji.warn} ${t("O sorteio de **{prize}** terminou sem participantes suficientes.", { prize: giveaway.prize })}`;
    } else if (winners.length === 1) {
        text = `${emoji.trophy} ${t("Parabéns {user}! Ganhaste **{prize}**.", { user: `<@${winners[0]}>`, prize: giveaway.prize })}`;
    } else {
        text = `${emoji.trophy} ${t("Parabéns {users}! Ganharam **{prize}**.", { users: winners.map((id) => `<@${id}>`).join(", "), prize: giveaway.prize })}`;
    }

    const actions = [new ButtonBuilder().setLabel(t("Ver sorteio")).setStyle(ButtonStyle.Link).setURL(url)];
    if (winners.length) {
        actions.unshift(
            new ButtonBuilder()
                .setCustomId(buildCustomId("giveaway", "claim", giveaway.id))
                .setLabel(t("Reclamar prémio"))
                .setEmoji(emoji.gift)
                .setStyle(ButtonStyle.Success),
        );
    }

    // Announce as a REPLY to the original giveaway message, so it's tied to the sorteio.
    await target.channel.send({
        components: [buildContainer({
            color: COLORS.gold,
            title: `${emoji.gift} ${t("Sorteio terminado")}`,
            description: text,
            rows: [row(...actions)],
        })],
        flags: CV2_FLAG,
        allowedMentions: { users: winners },
        reply: { messageReference: target.messageId, failIfNotExists: false },
    }).catch(() => null);
}

export async function endGiveaway(client: Client, id: string): Promise<GiveawayRecord | null> {
    clearManagedTimeout(endTimers, id);
    const giveaway = await getGiveawayById(id);
    if (!giveaway || giveaway.status !== "running") return null;

    const entries = await getEntries(id);
    const winners = pickWeightedWinners(entries, giveaway.winners_count);
    await finishGiveaway(id, "ended", winners);
    const ended: GiveawayRecord = { ...giveaway, status: "ended", winner_ids: winners, ended_at: Date.now() };

    await refreshGiveawayMessage(client, ended);
    await announceWinners(client, ended, winners);
    return ended;
}

export async function rerollGiveaway(client: Client, id: string): Promise<GiveawayRecord | null> {
    const giveaway = await getGiveawayById(id);
    if (!giveaway || giveaway.status !== "ended") return null;

    const entries = await getEntries(id);
    const winners = pickWeightedWinners(entries, giveaway.winners_count);
    await finishGiveaway(id, "ended", winners);
    const rerolled: GiveawayRecord = { ...giveaway, winner_ids: winners };

    await refreshGiveawayMessage(client, rerolled);
    await announceWinners(client, rerolled, winners);
    return rerolled;
}

export async function cancelGiveaway(client: Client, id: string): Promise<GiveawayRecord | null> {
    clearManagedTimeout(endTimers, id);
    const giveaway = await getGiveawayById(id);
    if (!giveaway || giveaway.status !== "running") return null;
    await finishGiveaway(id, "cancelled", []);
    const cancelled: GiveawayRecord = { ...giveaway, status: "cancelled", ended_at: Date.now() };
    await refreshGiveawayMessage(client, cancelled);
    return cancelled;
}

/** Restore end timers on startup; giveaways already past their deadline end immediately. */
export async function restoreGiveawaySchedulers(client: Client): Promise<number> {
    const running = await getRunningGiveaways();
    for (const giveaway of running) {
        if (giveaway.ends_at <= Date.now()) {
            void endGiveaway(client, giveaway.id).catch((err) => logger.error("Falha ao terminar sorteio atrasado:", err));
        } else {
            scheduleGiveawayEnd(client, giveaway);
        }
    }
    return running.length;
}
