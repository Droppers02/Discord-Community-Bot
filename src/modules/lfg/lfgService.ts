import { randomUUID } from "node:crypto";
import { ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, type Client, type Guild, type GuildMember, type GuildTextBasedChannel, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne } from "#database";
import { ourGuilds } from "../../config.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import { getReactionRoleSettings } from "../community/communitySettings.js";
import { adoptTempChannel, LFG_VOICE_PREFIX } from "../voice/tempVoiceManager.js";
import { defaultSizeFor, expiryFor, joinGroup, leaveGroup, slugify, type LfgStatus } from "./lfgLogic.js";
import { getLfgSettings, MAX_LFG_GAMES, normalizeGame, saveLfgSettings, type LfgGame, type LfgSettings } from "./lfgSettings.js";

// Procurar grupo (/grupo): um cartão com vagas, botões para entrar/sair, lista de espera, sala de
// voz quando enche, lembrete à hora marcada e expiração automática. Os grupos vivem na BD
// (lfg_groups), por isso os botões continuam a funcionar depois de o bot reiniciar.

export const LFG_NS = "lfg";
const cid = (...parts: string[]) => buildCustomId(LFG_NS, ...parts);
const TICK_MS = 60_000;

export interface LfgGroup {
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string | null;
    host_id: string;
    game_key: string;
    game_name: string;
    size: number;
    members: string[];
    waitlist: string[];
    note: string | null;
    mode: string | null;
    starts_at: number | null;
    reminded: boolean;
    voice_channel_id: string | null;
    status: LfgStatus;
    created_at: number;
    expires_at: number;
    closed_at: number | null;
}

function toGroup(row: Record<string, unknown>): LfgGroup {
    const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
    return {
        id: String(row.id),
        guild_id: String(row.guild_id),
        channel_id: String(row.channel_id),
        message_id: (row.message_id as string | null) ?? null,
        host_id: String(row.host_id),
        game_key: String(row.game_key),
        game_name: String(row.game_name),
        size: Number(row.size),
        members: Array.isArray(row.members) ? row.members as string[] : [],
        waitlist: Array.isArray(row.waitlist) ? row.waitlist as string[] : [],
        note: (row.note as string | null) ?? null,
        mode: (row.mode as string | null) ?? null,
        starts_at: num(row.starts_at),
        reminded: Boolean(row.reminded),
        voice_channel_id: (row.voice_channel_id as string | null) ?? null,
        status: row.status as LfgStatus,
        created_at: Number(row.created_at),
        expires_at: Number(row.expires_at),
        closed_at: num(row.closed_at),
    };
}

export async function getGroup(id: string): Promise<LfgGroup | null> {
    const row = await queryOne("SELECT * FROM lfg_groups WHERE id = $1", [id]);
    return row ? toGroup(row) : null;
}

async function saveGroup(group: LfgGroup): Promise<void> {
    await query(
        `UPDATE lfg_groups SET message_id = $2, host_id = $3, members = $4, waitlist = $5, reminded = $6, voice_channel_id = $7, status = $8, closed_at = $9, expires_at = $10
         WHERE id = $1`,
        [group.id, group.message_id, group.host_id, JSON.stringify(group.members), JSON.stringify(group.waitlist), group.reminded, group.voice_channel_id, group.status, group.closed_at, group.expires_at],
    );
}

export async function activeGroups(guildId: string): Promise<LfgGroup[]> {
    const { rows } = await query("SELECT * FROM lfg_groups WHERE guild_id = $1 AND status IN ('open', 'full', 'started') ORDER BY COALESCE(starts_at, created_at)", [guildId]);
    return rows.map(toGroup);
}

async function openHostedBy(guildId: string, userId: string): Promise<number> {
    const row = await queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM lfg_groups WHERE guild_id = $1 AND host_id = $2 AND status IN ('open', 'full')", [guildId, userId]);
    return Number(row?.n ?? 0);
}

// ─── Cartão ──────────────────────────────────────────────────────────────────

const STATUS: Record<LfgStatus, { label: string; color: number }> = {
    open: { label: "🟢 À procura de jogadores", color: COLORS.success },
    full: { label: "✅ Grupo completo", color: COLORS.info },
    started: { label: "🚀 Em jogo", color: COLORS.primary },
    closed: { label: "⌛ Fechado", color: COLORS.neutral },
};

export function groupCard(group: LfgGroup, game: LfgGame | null, mentionRole: boolean): ContainerPlusBuilder {
    const emoji = game?.emoji ?? "🎮";
    const slots = Array.from({ length: group.size }, (_, index) => {
        const id = group.members[index];
        return id ? `**${index + 1}.** <@${id}>${id === group.host_id ? " 👑" : ""}` : `**${index + 1}.** ${t("*vaga livre*")}`;
    });
    const live = group.status === "open" || group.status === "full";
    const when = group.starts_at
        ? (group.starts_at > Date.now() ? t("⏰ Começa {time} ({ago})", { time: timestamp(group.starts_at, "t"), ago: timestamp(group.starts_at, "R") }) : t("⏰ Era para {time}", { time: timestamp(group.starts_at, "t") }))
        : t("⚡ Agora");
    const container = buildContainer({
        color: STATUS[group.status].color,
        title: `${emoji} ${group.game_name}${group.mode ? ` · ${group.mode}` : ""}`,
        description: [
            `**${group.members.length}/${group.size}** ${t("jogadores")} · ${t("organizado por {host}", { host: `<@${group.host_id}>` })}`,
            mentionRole && game?.role_id && group.status === "open" ? `<@&${game.role_id}>` : null,
            `${when} · ${t(STATUS[group.status].label)}`,
            group.note ? `📝 ${group.note}` : null,
        ].filter(Boolean).join("\n"),
        fields: [
            { name: t("Jogadores"), value: slots.join("\n") },
            ...(group.waitlist.length ? [{ name: t("Lista de espera ({n})", { n: group.waitlist.length }), value: group.waitlist.map((id, index) => `${index + 1}. <@${id}>`).join("\n") }] : []),
            ...(group.voice_channel_id && live ? [{ name: t("Sala"), value: `🔊 <#${group.voice_channel_id}>` }] : []),
        ],
        footerText: live ? t("Expira {when} · grupo {id}", { when: timestamp(group.expires_at, "R"), id: group.id }) : t("Grupo {id}", { id: group.id }),
    });
    if (live) {
        container.addActionRowComponents(row(
            new ButtonBuilder().setCustomId(cid("join", group.id)).setLabel(group.status === "full" ? t("Lista de espera") : t("Entrar")).setEmoji(ei(group.status === "full" ? "hourglass" : "join")).setStyle(group.status === "full" ? ButtonStyle.Secondary : ButtonStyle.Success),
            new ButtonBuilder().setCustomId(cid("leave", group.id)).setLabel(t("Sair")).setEmoji(ei("leave")).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(cid("start", group.id)).setLabel(t("Começar")).setEmoji("🚀").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(cid("close", group.id)).setLabel(t("Fechar")).setEmoji(ei("error")).setStyle(ButtonStyle.Danger),
        ));
    }
    return container;
}

async function refreshCard(guild: Guild, group: LfgGroup, settings: LfgSettings): Promise<void> {
    if (!group.message_id) return;
    const channel = guild.channels.cache.get(group.channel_id);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(group.message_id).catch(() => null);
    await message?.edit({ components: [groupCard(group, gameOf(settings, group), false)], allowedMentions: { parse: [] } }).catch(() => null);
}

function gameOf(settings: LfgSettings, group: Pick<LfgGroup, "game_key">): LfgGame | null {
    return settings.games.find((game) => game.key === group.game_key) ?? null;
}

async function say(guild: Guild, group: LfgGroup, text: string, users: string[]): Promise<void> {
    const channel = guild.channels.cache.get(group.channel_id);
    if (!channel?.isTextBased()) return;
    await (channel as TextChannel).send({ components: [buildContainer({ color: COLORS.info, description: text })], flags: CV2_FLAG, allowedMentions: { users } }).catch(() => null);
}

// ─── Sala de voz ─────────────────────────────────────────────────────────────

async function ensureVoice(guild: Guild, group: LfgGroup, settings: LfgSettings): Promise<string | null> {
    if (group.voice_channel_id && guild.channels.cache.has(group.voice_channel_id)) return group.voice_channel_id;
    if (!settings.voice_category) return null;
    const category = guild.channels.cache.get(settings.voice_category);
    if (category?.type !== ChannelType.GuildCategory) return null;
    const host = guild.members.cache.get(group.host_id);
    const voice = await guild.channels.create({
        name: `${LFG_VOICE_PREFIX}${group.game_name} · ${host?.displayName ?? t("grupo")}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: category.id,
        userLimit: Math.min(99, group.size),
        permissionOverwrites: [
            ...category.permissionOverwrites.cache.map((overwrite) => ({ id: overwrite.id, allow: overwrite.allow, deny: overwrite.deny, type: overwrite.type })),
            ...group.members.map((id) => ({ id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Speak] })),
            { id: group.host_id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers] },
        ],
        reason: t("Grupo {id} completo", { id: group.id }),
    }).catch((error) => { logger.warn("Grupos: falha a criar a sala de voz:", error); return null; });
    if (!voice) return null;
    adoptTempChannel(voice.id);
    group.voice_channel_id = voice.id;
    return voice.id;
}

// ─── Ações ───────────────────────────────────────────────────────────────────

export interface CreateGroupInput {
    host: GuildMember;
    gameInput: string;
    size: number | null;
    startsAt: number | null;
    mode: string | null;
    note: string | null;
    channel: GuildTextBasedChannel;
}

export async function createGroup(input: CreateGroupInput): Promise<{ ok: true; group: LfgGroup; url: string } | { ok: false; reason: string }> {
    const guild = input.host.guild;
    const settings = await getLfgSettings(guild.id);
    if (!settings.enabled) return { ok: false, reason: t("Os grupos estão desligados neste servidor.") };
    if (await openHostedBy(guild.id, input.host.id) >= settings.max_open_per_user) {
        return { ok: false, reason: t("Já tens {n} grupos abertos — fecha um antes de criar outro.", { n: settings.max_open_per_user }) };
    }
    const target = settings.channel ? guild.channels.cache.get(settings.channel) : input.channel;
    if (!target?.isTextBased()) return { ok: false, reason: t("O canal dos grupos já não existe — avisa a equipa.") };

    const configured = settings.games.find((game) => game.key === input.gameInput) ?? settings.games.find((game) => slugify(game.name) === slugify(input.gameInput)) ?? null;
    const gameName = configured?.name ?? input.gameInput.trim().slice(0, 40);
    if (!gameName) return { ok: false, reason: t("Diz qual é o jogo.") };
    const size = Math.max(2, Math.min(20, input.size ?? configured?.size ?? defaultSizeFor(gameName)));
    const now = Date.now();
    const group: LfgGroup = {
        id: randomUUID().slice(0, 8),
        guild_id: guild.id,
        channel_id: target.id,
        message_id: null,
        host_id: input.host.id,
        game_key: configured?.key ?? slugify(gameName),
        game_name: gameName,
        size,
        members: [input.host.id],
        waitlist: [],
        note: input.note?.slice(0, 300) ?? null,
        mode: input.mode?.slice(0, 40) ?? null,
        starts_at: input.startsAt,
        reminded: false,
        voice_channel_id: null,
        status: "open",
        created_at: now,
        expires_at: expiryFor(now, input.startsAt, settings.expire_hours),
        closed_at: null,
    };
    await query(
        `INSERT INTO lfg_groups (id, guild_id, channel_id, host_id, game_key, game_name, size, members, waitlist, note, mode, starts_at, status, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb, $9, $10, $11, 'open', $12, $13)`,
        [group.id, group.guild_id, group.channel_id, group.host_id, group.game_key, group.game_name, group.size, JSON.stringify(group.members), group.note, group.mode, group.starts_at, group.created_at, group.expires_at],
    );
    const mention = settings.ping_role && configured?.role_id ? configured.role_id : null;
    const sent = await (target as TextChannel).send({
        components: [groupCard(group, configured, Boolean(mention))],
        flags: CV2_FLAG,
        allowedMentions: mention ? { roles: [mention] } : { parse: [] },
    }).catch((error) => { logger.warn("Grupos: falha a publicar:", error); return null; });
    if (!sent) {
        group.status = "closed";
        await saveGroup(group);
        return { ok: false, reason: t("Não consegui publicar o grupo nesse canal (permissões do bot?).") };
    }
    group.message_id = sent.id;
    await saveGroup(group);
    return { ok: true, group, url: sent.url };
}

export type GroupActionResult = { ok: true; notice: string | null } | { ok: false; reason: string };

export async function groupAction(member: GuildMember, group: LfgGroup, action: string, isStaff: boolean): Promise<GroupActionResult> {
    const guild = member.guild;
    const settings = await getLfgSettings(guild.id);
    const canManage = member.id === group.host_id || isStaff;

    if (action === "join") {
        const { group: next, result, filled } = joinGroup(group, member.id);
        if (result === "already") return { ok: false, reason: t("Já estás neste grupo. 🙂") };
        if (result === "closed") return { ok: false, reason: t("Este grupo já fechou.") };
        Object.assign(group, next);
        if (filled) {
            const voice = await ensureVoice(guild, group, settings);
            await say(guild, group, `✅ ${t("Grupo de **{game}** completo!", { game: group.game_name })} ${group.members.map((id) => `<@${id}>`).join(" ")}${voice ? `\n🔊 ${t("A vossa sala: {voice}", { voice: `<#${voice}>` })}` : ""}`, group.members);
        }
        await saveGroup(group);
        await refreshCard(guild, group, settings);
        await grantVoiceAccess(guild, group, member.id);
        return { ok: true, notice: result === "waitlisted" ? t("O grupo está cheio — ficaste na lista de espera ({n}.º). Se alguém sair, entras logo.", { n: group.waitlist.length }) : null };
    }

    if (action === "leave") {
        const outcome = leaveGroup(group, member.id);
        if (!outcome.left) return { ok: false, reason: t("Não estás neste grupo.") };
        Object.assign(group, outcome.group);
        if (outcome.empty) group.closed_at = Date.now();
        await saveGroup(group);
        await refreshCard(guild, group, settings);
        if (outcome.promoted) {
            await grantVoiceAccess(guild, group, outcome.promoted);
            await say(guild, group, `🎟️ ${t("Abriu uma vaga no grupo de **{game}** — {user} saiu da lista de espera e está dentro!", { game: group.game_name, user: `<@${outcome.promoted}>` })}`, [outcome.promoted]);
        }
        if (outcome.newHost) await say(guild, group, `👑 ${t("{user} é o novo organizador do grupo de **{game}**.", { user: `<@${outcome.newHost}>`, game: group.game_name })}`, [outcome.newHost]);
        return { ok: true, notice: null };
    }

    if (!canManage) return { ok: false, reason: t("Só quem organizou o grupo (ou a equipa) pode fazer isso.") };

    if (action === "start") {
        group.status = "started";
        group.reminded = true;
        const voice = await ensureVoice(guild, group, settings);
        await saveGroup(group);
        await refreshCard(guild, group, settings);
        await say(guild, group, `🚀 ${t("Bora! O grupo de **{game}** vai começar.", { game: group.game_name })} ${group.members.map((id) => `<@${id}>`).join(" ")}${voice ? `\n🔊 <#${voice}>` : ""}`, group.members);
        return { ok: true, notice: null };
    }
    if (action === "close") {
        group.status = "closed";
        group.closed_at = Date.now();
        await saveGroup(group);
        await refreshCard(guild, group, settings);
        return { ok: true, notice: t("Grupo fechado.") };
    }
    return { ok: false, reason: t("Ação desconhecida.") };
}

async function grantVoiceAccess(guild: Guild, group: LfgGroup, userId: string): Promise<void> {
    if (!group.voice_channel_id || !group.members.includes(userId)) return;
    const voice = guild.channels.cache.get(group.voice_channel_id);
    if (voice?.type !== ChannelType.GuildVoice) return;
    await voice.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true, Speak: true }).catch(() => null);
}

// ─── Lista e importação ──────────────────────────────────────────────────────

export async function groupsListView(guild: Guild, viewerId: string): Promise<ContainerPlusBuilder> {
    const groups = await activeGroups(guild.id);
    const lines = groups.slice(0, 20).map((group) => {
        const link = group.message_id ? `https://discord.com/channels/${guild.id}/${group.channel_id}/${group.message_id}` : null;
        const mine = group.members.includes(viewerId) ? " ⭐" : "";
        const when = group.starts_at ? timestamp(group.starts_at, "t") : t("agora");
        const title = `${group.game_name}${group.mode ? ` (${group.mode})` : ""}`;
        return `${STATUS[group.status].label.split(" ")[0]} ${link ? `[${title}](${link})` : title} · **${group.members.length}/${group.size}** · ${when} · <@${group.host_id}>${mine}`;
    });
    return buildContainer({
        color: COLORS.primary,
        title: `🎮 ${t("Grupos abertos")}`,
        description: lines.length ? lines.join("\n") : t("Nenhum grupo aberto agora — cria um com `/grupo criar`!"),
        footerText: groups.length ? t("⭐ = estás lá dentro") : null,
    });
}

/** Junta aos jogos configurados os cargos dos painéis de auto-cargos (sem duplicar). */
export async function importGamesFromRolePanels(guildId: string): Promise<number> {
    const [settings, panels] = await Promise.all([getLfgSettings(guildId), getReactionRoleSettings(guildId)]);
    const games = [...settings.games];
    const gamePanels = panels.panels.filter((panel) => /jogo/i.test(panel.name) || /jogo/i.test(panel.title) || panel.id === "epa-jogos");
    let added = 0;
    for (const entry of gamePanels.flatMap((panel) => panel.roles)) {
        if (games.length >= MAX_LFG_GAMES) break;
        const game = normalizeGame({ name: entry.label, emoji: entry.emoji, role_id: entry.role_id, size: defaultSizeFor(entry.label) });
        if (!game || games.some((existing) => existing.key === game.key || existing.role_id === game.role_id)) continue;
        games.push(game);
        added++;
    }
    if (added) await saveLfgSettings(guildId, { games });
    return added;
}

// ─── Tarefas: lembretes à hora e expiração ───────────────────────────────────

async function tick(client: Client<true>): Promise<void> {
    const now = Date.now();
    for (const guild of ourGuilds(client)) {
        const settings = await getLfgSettings(guild.id);
        for (const group of await activeGroups(guild.id)) {
            if (group.starts_at && !group.reminded && group.starts_at <= now + 60_000 && group.status !== "started") {
                group.reminded = true;
                const voice = group.members.length > 1 ? await ensureVoice(guild, group, settings) : null;
                await saveGroup(group);
                await say(guild, group, `⏰ ${t("Está na hora do **{game}**!", { game: group.game_name })} ${group.members.map((id) => `<@${id}>`).join(" ")}${voice ? `\n🔊 <#${voice}>` : ""}${group.members.length < group.size ? `\n-# ${t("Ainda há {n} vagas.", { n: group.size - group.members.length })}` : ""}`, group.members);
                await refreshCard(guild, group, settings);
            }
            if (group.expires_at <= now) {
                group.status = "closed";
                group.closed_at = now;
                await saveGroup(group);
                await refreshCard(guild, group, settings);
            }
        }
    }
}

let timer: NodeJS.Timeout | null = null;

export function startLfgJobs(client: Client<true>): void {
    if (timer) return;
    const run = () => void tick(client).catch((error) => logger.warn("Grupos: falha na tarefa:", error));
    setTimeout(run, 20_000).unref?.();
    timer = setInterval(run, TICK_MS);
    timer.unref?.();
}

