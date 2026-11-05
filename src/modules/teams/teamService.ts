import { ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, type Client, type Guild, type GuildMember, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne } from "#database";
import { ourGuilds } from "../../config.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import { startDaily } from "../../repositories/gameStatsRepository.js";
import { appendAuditLog } from "../../services/auditService.js";
import { grantCoins, spendCoins } from "../economy/economyService.js";
import { canDo, colorHex, isoWeek, previousWeek, RANK_LABELS, sortByRank, type TeamAction, type TeamRank } from "./teamLogic.js";
import { getTeamSettings, type TeamSettings } from "./teamSettings.js";

// Equipas (/equipa): grupos de membros com nome, tag, cor, cargo próprio, canais opcionais, banco
// de moedas e pontos. Os pontos vêm do XP que os membros ganham (texto e voz) e somam para a
// guerra semanal — à segunda, a equipa com mais pontos na semana anterior ganha moedas.

export const TEAM_NS = "team";
const cid = (...parts: Array<string | number>) => buildCustomId(TEAM_NS, ...parts);

export interface Team {
    id: number;
    guild_id: string;
    name: string;
    tag: string;
    emoji: string | null;
    color: number;
    description: string | null;
    owner_id: string;
    role_id: string | null;
    text_channel_id: string | null;
    voice_channel_id: string | null;
    bank: number;
    points: number;
    open: boolean;
    created_at: number;
}

export interface TeamMember { user_id: string; team_id: number; rank: TeamRank; points: number; coins: number; joined_at: number }

function toTeam(row: Record<string, unknown>): Team {
    const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
    return {
        id: Number(row.id), guild_id: String(row.guild_id), name: String(row.name), tag: String(row.tag), emoji: str(row.emoji),
        color: Number(row.color), description: str(row.description), owner_id: String(row.owner_id), role_id: str(row.role_id),
        text_channel_id: str(row.text_channel_id), voice_channel_id: str(row.voice_channel_id), bank: Number(row.bank), points: Number(row.points),
        open: Boolean(row.open), created_at: Number(row.created_at),
    };
}

function toMember(row: Record<string, unknown>): TeamMember {
    return { user_id: String(row.user_id), team_id: Number(row.team_id), rank: row.rank as TeamRank, points: Number(row.points), coins: Number(row.coins), joined_at: Number(row.joined_at) };
}

export async function getTeam(guildId: string, id: number): Promise<Team | null> {
    const row = await queryOne("SELECT * FROM teams WHERE guild_id = $1 AND id = $2", [guildId, id]);
    return row ? toTeam(row) : null;
}

/** Pelo nome ou pela tag (sem ligar a maiúsculas). */
export async function findTeam(guildId: string, input: string): Promise<Team | null> {
    const row = await queryOne("SELECT * FROM teams WHERE guild_id = $1 AND (lower(name) = lower($2) OR lower(tag) = lower($2)) LIMIT 1", [guildId, input.trim()]);
    return row ? toTeam(row) : null;
}

export async function teamsOf(guildId: string): Promise<Team[]> {
    const { rows } = await query("SELECT * FROM teams WHERE guild_id = $1 ORDER BY points DESC", [guildId]);
    return rows.map(toTeam);
}

export async function membersOf(teamId: number): Promise<TeamMember[]> {
    const { rows } = await query("SELECT * FROM team_members WHERE team_id = $1", [teamId]);
    return sortByRank(rows.map(toMember));
}

export async function membershipOf(guildId: string, userId: string): Promise<{ team: Team; member: TeamMember } | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT * FROM team_members WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    if (!row) return null;
    const team = await getTeam(guildId, Number(row.team_id));
    return team ? { team, member: toMember(row) } : null;
}

async function weeklyPoints(guildId: string, teamId: number, week: string): Promise<{ points: number; rank: number }> {
    const { rows } = await query("SELECT team_id, points FROM team_weekly WHERE guild_id = $1 AND week = $2 ORDER BY points DESC", [guildId, week]);
    const index = rows.findIndex((row) => Number(row.team_id) === teamId);
    return { points: index >= 0 ? Number(rows[index]!.points) : 0, rank: index >= 0 ? index + 1 : 0 };
}

// ─── Pontos (ligados ao XP) ──────────────────────────────────────────────────

// guild → (user → equipa). Carregado uma vez por servidor e mantido nas mudanças de membros.
const membership = new Map<string, Map<string, number>>();

async function membershipMap(guildId: string): Promise<Map<string, number>> {
    let map = membership.get(guildId);
    if (!map) {
        const { rows } = await query("SELECT user_id, team_id FROM team_members WHERE guild_id = $1", [guildId]);
        map = new Map(rows.map((row) => [String(row.user_id), Number(row.team_id)]));
        membership.set(guildId, map);
    }
    return map;
}

function setMembership(guildId: string, userId: string, teamId: number | null): void {
    const map = membership.get(guildId);
    if (!map) return;
    if (teamId === null) map.delete(userId);
    else map.set(userId, teamId);
}

/** Chamado quando um membro ganha XP: soma aos pontos da equipa (total e da semana). */
export async function addTeamPoints(guildId: string, userId: string, xp: number): Promise<void> {
    if (xp <= 0) return;
    const teamId = (await membershipMap(guildId)).get(userId);
    if (!teamId) return;
    await query("UPDATE teams SET points = points + $2 WHERE id = $1", [teamId, xp]);
    await query("UPDATE team_members SET points = points + $3 WHERE guild_id = $1 AND user_id = $2", [guildId, userId, xp]);
    await query(
        `INSERT INTO team_weekly (guild_id, team_id, week, points) VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, team_id, week) DO UPDATE SET points = team_weekly.points + EXCLUDED.points`,
        [guildId, teamId, isoWeek(Date.now()), xp],
    );
}

// ─── Cargo e canais ──────────────────────────────────────────────────────────

async function createTeamRole(guild: Guild, settings: TeamSettings, name: string, tag: string, color: number): Promise<string | null> {
    if (!settings.create_roles) return null;
    const anchor = settings.role_anchor ? guild.roles.cache.get(settings.role_anchor) : null;
    const role = await guild.roles.create({
        name: `[${tag}] ${name}`.slice(0, 100),
        colors: { primaryColor: color },
        permissions: [],
        mentionable: true,
        hoist: false,
        position: anchor ? anchor.position + 1 : undefined,
        reason: t("Equipa {name}", { name }),
    }).catch((error) => { logger.warn("Equipas: falha a criar o cargo:", error); return null; });
    return role?.id ?? null;
}

async function createTeamChannels(guild: Guild, settings: TeamSettings, team: Pick<Team, "name" | "role_id" | "owner_id">): Promise<{ text: string | null; voice: string | null }> {
    const category = settings.channel_category ? guild.channels.cache.get(settings.channel_category) : null;
    if (category?.type !== ChannelType.GuildCategory) return { text: null, voice: null };
    const allowed = team.role_id ?? team.owner_id;
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: allowed, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
    ];
    const slug = team.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "equipa";
    const text = await guild.channels.create({ name: `🛡️・${slug}`, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites }).catch(() => null);
    const voice = await guild.channels.create({ name: `🔊・${team.name}`.slice(0, 100), type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: overwrites }).catch(() => null);
    return { text: text?.id ?? null, voice: voice?.id ?? null };
}

async function giveRole(guild: Guild, team: Team, userId: string, add: boolean): Promise<void> {
    if (team.role_id) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) await (add ? member.roles.add(team.role_id) : member.roles.remove(team.role_id)).catch(() => null);
    } else if (team.text_channel_id || team.voice_channel_id) {
        for (const channelId of [team.text_channel_id, team.voice_channel_id]) {
            const channel = channelId ? guild.channels.cache.get(channelId) : null;
            if (channel && "permissionOverwrites" in channel) {
                await (add
                    ? channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, Connect: true, Speak: true })
                    : channel.permissionOverwrites.delete(userId)).catch(() => null);
            }
        }
    }
}

// ─── Ações ───────────────────────────────────────────────────────────────────

export type TeamResult = { ok: true; text: string; team?: Team } | { ok: false; reason: string };
const fail = (reason: string): TeamResult => ({ ok: false, reason });

export async function createTeam(member: GuildMember, name: string, tag: string, color: number, emoji: string | null): Promise<TeamResult> {
    const guild = member.guild;
    const settings = await getTeamSettings(guild.id);
    if (!settings.enabled) return fail(t("As equipas estão desligadas neste servidor."));
    if (await membershipOf(guild.id, member.id)) return fail(t("Já estás numa equipa — sai primeiro com `/equipa sair`."));
    if ((await teamsOf(guild.id)).length >= settings.max_teams) return fail(t("O servidor já tem {n} equipas (o máximo).", { n: settings.max_teams }));
    if (await findTeam(guild.id, name) || await findTeam(guild.id, tag)) return fail(t("Já existe uma equipa com esse nome ou tag."));
    if (settings.create_cost > 0 && await spendCoins(guild.id, member.id, settings.create_cost, "team-create", name) === null) {
        return fail(t("Criar uma equipa custa {n} moedas — não tens que chegue.", { n: formatNumber(settings.create_cost) }));
    }
    const refund = () => settings.create_cost > 0 ? grantCoins(guild.id, member.id, settings.create_cost, "refund", name) : Promise.resolve(0);
    let roleId: string | null = null;
    let channels: { text: string | null; voice: string | null } = { text: null, voice: null };
    try {
        roleId = await createTeamRole(guild, settings, name, tag, color);
        channels = await createTeamChannels(guild, settings, { name, role_id: roleId, owner_id: member.id });
        const row = await queryOne(
            `INSERT INTO teams (guild_id, name, tag, emoji, color, owner_id, role_id, text_channel_id, voice_channel_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [guild.id, name, tag, emoji, color, member.id, roleId, channels.text, channels.voice, Date.now()],
        );
        const team = toTeam(row!);
        await query("INSERT INTO team_members (guild_id, user_id, team_id, rank, joined_at) VALUES ($1, $2, $3, 'owner', $4)", [guild.id, member.id, team.id, Date.now()]);
        setMembership(guild.id, member.id, team.id);
        await giveRole(guild, team, member.id, true);
        appendAuditLog({ guildId: guild.id, actorId: member.id, action: "team.create", details: { team: team.id, name, tag } });
        return { ok: true, team, text: t("Equipa **[{tag}] {name}** criada! Convida gente com `/equipa convidar`.", { tag, name }) };
    } catch (error) {
        logger.warn("Equipas: falha a criar:", error);
        // Nada fica para trás: cargo e canais criados antes da falha saem, e as moedas voltam.
        if (roleId) await guild.roles.cache.get(roleId)?.delete().catch(() => null);
        for (const channelId of [channels.text, channels.voice]) if (channelId) await guild.channels.cache.get(channelId)?.delete().catch(() => null);
        await refund();
        return fail(t("Não consegui criar a equipa (nome repetido?) — as moedas foram devolvidas."));
    }
}

async function addMember(guild: Guild, team: Team, userId: string): Promise<TeamResult> {
    const settings = await getTeamSettings(guild.id);
    if (await membershipOf(guild.id, userId)) return fail(t("Já estás numa equipa."));
    if ((await membersOf(team.id)).length >= settings.max_members) return fail(t("A equipa está cheia ({n}).", { n: settings.max_members }));
    await query("INSERT INTO team_members (guild_id, user_id, team_id, rank, joined_at) VALUES ($1, $2, $3, 'member', $4) ON CONFLICT DO NOTHING", [guild.id, userId, team.id, Date.now()]);
    await query("DELETE FROM team_invites WHERE guild_id = $1 AND user_id = $2", [guild.id, userId]);
    setMembership(guild.id, userId, team.id);
    await giveRole(guild, team, userId, true);
    return { ok: true, team, text: t("Bem-vindo à **[{tag}] {name}**! 🎉", { tag: team.tag, name: team.name }) };
}

export async function joinTeam(member: GuildMember, team: Team): Promise<TeamResult> {
    const invited = await queryOne("SELECT 1 FROM team_invites WHERE guild_id = $1 AND team_id = $2 AND user_id = $3", [member.guild.id, team.id, member.id]);
    if (!team.open && !invited) return fail(t("Esta equipa só aceita por convite."));
    return addMember(member.guild, team, member.id);
}

export async function declineInvite(guildId: string, teamId: number, userId: string): Promise<void> {
    await query("DELETE FROM team_invites WHERE guild_id = $1 AND team_id = $2 AND user_id = $3", [guildId, teamId, userId]);
}

export async function inviteToTeam(actor: GuildMember, target: GuildMember): Promise<TeamResult> {
    const mine = await membershipOf(actor.guild.id, actor.id);
    if (!mine) return fail(t("Não estás em nenhuma equipa."));
    if (!canDo(mine.member.rank, "invite")) return fail(t("Só o dono e os oficiais convidam."));
    if (target.user.bot) return fail(t("Os bots não jogam em equipa. 🤖"));
    if (await membershipOf(actor.guild.id, target.id)) return fail(t("{user} já está numa equipa.", { user: `<@${target.id}>` }));
    await query("INSERT INTO team_invites (guild_id, team_id, user_id, invited_by, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [actor.guild.id, mine.team.id, target.id, actor.id, Date.now()]);
    return { ok: true, team: mine.team, text: "" };
}

export function inviteView(team: Team, targetId: string, inviterId: string): ContainerPlusBuilder {
    return buildContainer({
        color: team.color,
        title: `📨 ${t("Convite para a {team}", { team: `${team.emoji ?? "🛡️"} [${team.tag}] ${team.name}` })}`,
        description: t("{target}, {inviter} convidou-te para a equipa!", { target: `<@${targetId}>`, inviter: `<@${inviterId}>` }),
        rows: [row(
            new ButtonBuilder().setCustomId(cid("accept", team.id, targetId)).setLabel(t("Aceitar")).setEmoji("✅").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(cid("decline", team.id, targetId)).setLabel(t("Recusar")).setStyle(ButtonStyle.Secondary),
        )],
    });
}

export async function acceptInvite(member: GuildMember, teamId: number): Promise<TeamResult> {
    const team = await getTeam(member.guild.id, teamId);
    if (!team) return fail(t("Essa equipa já não existe."));
    const invited = await queryOne("SELECT 1 FROM team_invites WHERE guild_id = $1 AND team_id = $2 AND user_id = $3", [member.guild.id, team.id, member.id]);
    if (!invited) return fail(t("Este convite já não é válido."));
    return addMember(member.guild, team, member.id);
}

export async function leaveTeam(member: GuildMember): Promise<TeamResult> {
    const mine = await membershipOf(member.guild.id, member.id);
    if (!mine) return fail(t("Não estás em nenhuma equipa."));
    const members = await membersOf(mine.team.id);
    if (mine.member.rank === "owner" && members.length > 1) return fail(t("És o dono: passa a equipa a alguém com `/equipa dono` ou apaga-a com `/equipa apagar`."));
    if (members.length === 1) return deleteTeam(member, true);
    await removeMember(member.guild, mine.team, member.id);
    return { ok: true, text: t("Saíste da **[{tag}] {name}**.", { tag: mine.team.tag, name: mine.team.name }) };
}

async function removeMember(guild: Guild, team: Team, userId: string): Promise<void> {
    await query("DELETE FROM team_members WHERE guild_id = $1 AND user_id = $2", [guild.id, userId]);
    setMembership(guild.id, userId, null);
    await giveRole(guild, team, userId, false);
}

async function actorWith(actor: GuildMember, action: TeamAction, target: GuildMember | null): Promise<{ team: Team; targetRank: TeamRank | null } | string> {
    const mine = await membershipOf(actor.guild.id, actor.id);
    if (!mine) return t("Não estás em nenhuma equipa.");
    let targetRank: TeamRank | null = null;
    if (target) {
        const theirs = await membershipOf(actor.guild.id, target.id);
        if (!theirs || theirs.team.id !== mine.team.id) return t("{user} não é da tua equipa.", { user: `<@${target.id}>` });
        if (target.id === actor.id) return t("Isso não dá para fazer a ti próprio.");
        targetRank = theirs.member.rank;
    }
    if (!canDo(mine.member.rank, action, targetRank)) return t("O teu cargo na equipa não deixa fazer isso.");
    return { team: mine.team, targetRank };
}

export async function kickFromTeam(actor: GuildMember, target: GuildMember): Promise<TeamResult> {
    const ctx = await actorWith(actor, "kick", target);
    if (typeof ctx === "string") return fail(ctx);
    await removeMember(actor.guild, ctx.team, target.id);
    return { ok: true, text: t("{user} saiu da equipa.", { user: `<@${target.id}>` }) };
}

export async function setRank(actor: GuildMember, target: GuildMember, promote: boolean): Promise<TeamResult> {
    const ctx = await actorWith(actor, promote ? "promote" : "demote", target);
    if (typeof ctx === "string") return fail(ctx);
    const rank: TeamRank = promote ? "officer" : "member";
    if (ctx.targetRank === rank) return fail(promote ? t("Já é oficial.") : t("Já é membro."));
    await query("UPDATE team_members SET rank = $3 WHERE guild_id = $1 AND user_id = $2", [actor.guild.id, target.id, rank]);
    return { ok: true, text: promote ? t("{user} é agora ⭐ oficial.", { user: `<@${target.id}>` }) : t("{user} voltou a membro.", { user: `<@${target.id}>` }) };
}

export async function transferTeam(actor: GuildMember, target: GuildMember): Promise<TeamResult> {
    const ctx = await actorWith(actor, "transfer", target);
    if (typeof ctx === "string") return fail(ctx);
    await query("UPDATE team_members SET rank = 'officer' WHERE guild_id = $1 AND user_id = $2", [actor.guild.id, actor.id]);
    await query("UPDATE team_members SET rank = 'owner' WHERE guild_id = $1 AND user_id = $2", [actor.guild.id, target.id]);
    await query("UPDATE teams SET owner_id = $2 WHERE id = $1", [ctx.team.id, target.id]);
    return { ok: true, text: t("👑 {user} é o novo dono da equipa.", { user: `<@${target.id}>` }) };
}

export async function deposit(member: GuildMember, amount: number): Promise<TeamResult> {
    const mine = await membershipOf(member.guild.id, member.id);
    if (!mine) return fail(t("Não estás em nenhuma equipa."));
    if (await spendCoins(member.guild.id, member.id, amount, "team-deposit", mine.team.name) === null) return fail(t("Não tens moedas suficientes."));
    await query("UPDATE teams SET bank = bank + $2 WHERE id = $1", [mine.team.id, amount]);
    await query("UPDATE team_members SET coins = coins + $3 WHERE guild_id = $1 AND user_id = $2", [member.guild.id, member.id, amount]);
    return { ok: true, text: t("Depositaste **{n}** moedas no banco da equipa. 🏦", { n: formatNumber(amount) }) };
}

export async function withdraw(actor: GuildMember, amount: number, to: GuildMember | null): Promise<TeamResult> {
    const ctx = await actorWith(actor, "withdraw", null);
    if (typeof ctx === "string") return fail(ctx);
    const recipient = to ?? actor;
    const theirs = await membershipOf(actor.guild.id, recipient.id);
    if (!theirs || theirs.team.id !== ctx.team.id) return fail(t("Só dá para levantar para alguém da equipa."));
    const updated = await query("UPDATE teams SET bank = bank - $2 WHERE id = $1 AND bank >= $2", [ctx.team.id, amount]);
    if (!updated.rowCount) return fail(t("O banco da equipa não tem {n} moedas.", { n: formatNumber(amount) }));
    await grantCoins(actor.guild.id, recipient.id, amount, "team-withdraw", ctx.team.name);
    return { ok: true, text: t("Levantaste **{n}** moedas para {user}.", { n: formatNumber(amount), user: `<@${recipient.id}>` }) };
}

export async function editTeam(actor: GuildMember, patch: { description?: string | null; color?: number; emoji?: string | null; open?: boolean }): Promise<TeamResult> {
    const ctx = await actorWith(actor, "edit", null);
    if (typeof ctx === "string") return fail(ctx);
    const team = { ...ctx.team, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) } as Team;
    await query("UPDATE teams SET description = $2, color = $3, emoji = $4, open = $5 WHERE id = $1", [team.id, team.description, team.color, team.emoji, team.open]);
    if (patch.color !== undefined && team.role_id) await actor.guild.roles.cache.get(team.role_id)?.edit({ colors: { primaryColor: team.color } }).catch(() => null);
    return { ok: true, team, text: t("Equipa atualizada.") };
}

export async function deleteTeam(actor: GuildMember, leaving = false): Promise<TeamResult> {
    const ctx = await actorWith(actor, "delete", null);
    if (typeof ctx === "string") return fail(ctx);
    const team = ctx.team;
    const members = await membersOf(team.id);
    if (team.bank > 0) await grantCoins(actor.guild.id, actor.id, team.bank, "team-delete", t("Banco da equipa {name}", { name: team.name }));
    for (const member of members) setMembership(actor.guild.id, member.user_id, null);
    await query("DELETE FROM team_members WHERE team_id = $1", [team.id]);
    await query("DELETE FROM team_invites WHERE team_id = $1", [team.id]);
    await query("DELETE FROM teams WHERE id = $1", [team.id]);
    if (team.role_id) await actor.guild.roles.cache.get(team.role_id)?.delete(t("Equipa apagada")).catch(() => null);
    for (const channelId of [team.text_channel_id, team.voice_channel_id]) if (channelId) await actor.guild.channels.cache.get(channelId)?.delete(t("Equipa apagada")).catch(() => null);
    appendAuditLog({ guildId: actor.guild.id, actorId: actor.id, action: "team.delete", details: { team: team.id, name: team.name } });
    return { ok: true, text: leaving ? t("Eras o último — a equipa **{name}** foi apagada.", { name: team.name }) : t("A equipa **{name}** foi apagada{bank}.", { name: team.name, bank: team.bank ? t(" e o banco ({n}) veio para ti", { n: formatNumber(team.bank) }) : "" }) };
}

// ─── Vistas ──────────────────────────────────────────────────────────────────

export async function teamCard(guild: Guild, team: Team, viewerId: string | null): Promise<ContainerPlusBuilder> {
    const [members, settings, week] = await Promise.all([membersOf(team.id), getTeamSettings(guild.id), weeklyPoints(guild.id, team.id, isoWeek(Date.now()))]);
    const viewerIn = viewerId ? members.some((member) => member.user_id === viewerId) : true;
    const container = buildContainer({
        color: team.color,
        title: `${team.emoji ?? "🛡️"} [${team.tag}] ${team.name}`,
        description: [
            team.description ?? t("*Sem descrição.*"),
            `-# ${team.open ? t("🔓 Aberta — qualquer um entra") : t("🔒 Só por convite")} · ${t("criada {when}", { when: timestamp(team.created_at, "D") })} · ${colorHex(team.color)}`,
        ].join("\n"),
        fields: [
            { name: t("Membros ({n}/{max})", { n: members.length, max: settings.max_members }), value: members.map((member) => `${member.rank === "member" ? "•" : t(RANK_LABELS[member.rank]).split(" ")[0]} <@${member.user_id}> · ${formatNumber(member.points)} ${t("pts")}`).join("\n") || t("*ninguém*") },
            {
                name: t("Pontos"),
                value: [
                    t("Total: **{n}**", { n: formatNumber(team.points) }),
                    t("Esta semana: **{n}**{rank}", { n: formatNumber(week.points), rank: week.rank ? ` (${t("{n}.º lugar", { n: week.rank })})` : "" }),
                    t("Banco: **{n}** moedas", { n: formatNumber(team.bank) }),
                ].join("\n"),
            },
            ...(team.text_channel_id || team.voice_channel_id || team.role_id ? [{ name: t("Da equipa"), value: [team.role_id ? `<@&${team.role_id}>` : null, team.text_channel_id ? `<#${team.text_channel_id}>` : null, team.voice_channel_id ? `<#${team.voice_channel_id}>` : null].filter(Boolean).join(" · ") }] : []),
        ],
    });
    if (!viewerIn && team.open && members.length < settings.max_members) {
        container.addActionRowComponents(row(new ButtonBuilder().setCustomId(cid("join", team.id, "x")).setLabel(t("Entrar na equipa")).setEmoji("🛡️").setStyle(ButtonStyle.Success)));
    }
    return container;
}

export async function rankingView(guild: Guild, weekly: boolean): Promise<ContainerPlusBuilder> {
    const week = isoWeek(Date.now());
    const teams = await teamsOf(guild.id);
    let ranked: Array<{ team: Team; points: number }>;
    if (weekly) {
        const { rows } = await query("SELECT team_id, points FROM team_weekly WHERE guild_id = $1 AND week = $2", [guild.id, week]);
        const points = new Map(rows.map((row) => [Number(row.team_id), Number(row.points)]));
        ranked = teams.map((team) => ({ team, points: points.get(team.id) ?? 0 })).sort((a, b) => b.points - a.points);
    } else {
        ranked = teams.map((team) => ({ team, points: team.points }));
    }
    const medals = ["🥇", "🥈", "🥉"];
    return buildContainer({
        color: COLORS.gold,
        title: weekly ? `⚔️ ${t("Guerra da semana")}` : `🏆 ${t("Ranking das equipas")}`,
        description: ranked.length
            ? ranked.slice(0, 15).map((entry, index) => `${medals[index] ?? `**${index + 1}.**`} ${entry.team.emoji ?? "🛡️"} **[${entry.team.tag}] ${entry.team.name}** — ${formatNumber(entry.points)} ${t("pts")}`).join("\n")
            : t("Ainda não há equipas — cria uma com `/equipa criar`!"),
        footerText: weekly ? t("Os pontos vêm do XP dos membros (texto e voz). A semana fecha à segunda às 00:00.") : null,
    });
}

// ─── Guerra semanal ──────────────────────────────────────────────────────────

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short" });

async function closeWeek(guild: Guild, settings: TeamSettings): Promise<void> {
    const week = previousWeek(Date.now());
    if (!(await startDaily(guild.id, "_", "teams-weekly", week))) return;
    const { rows } = await query("SELECT w.team_id, w.points FROM team_weekly w JOIN teams t ON t.id = w.team_id WHERE w.guild_id = $1 AND w.week = $2 AND w.points > 0 ORDER BY w.points DESC LIMIT 3", [guild.id, week]);
    if (!rows.length) return;
    const podium = await Promise.all(rows.map(async (row) => ({ team: await getTeam(guild.id, Number(row.team_id)), points: Number(row.points) })));
    const winner = podium[0]!.team;
    if (!winner) return;
    const members = await membersOf(winner.id);
    if (settings.weekly_reward > 0) {
        for (const member of members) await grantCoins(guild.id, member.user_id, settings.weekly_reward, "team-weekly", week).catch(() => null);
    }
    const channel = (settings.announce_channel ? guild.channels.cache.get(settings.announce_channel) : null) ?? guild.systemChannel;
    if (!channel?.isTextBased()) return;
    const medals = ["🥇", "🥈", "🥉"];
    await (channel as TextChannel).send({
        components: [buildContainer({
            color: winner.color,
            title: `⚔️ ${t("Guerra das equipas — {week}", { week })}`,
            description: [
                t("A vencedora é a {team}! 🎉", { team: `**${winner.emoji ?? "🛡️"} [${winner.tag}] ${winner.name}**` }),
                "",
                ...podium.filter((entry) => entry.team).map((entry, index) => `${medals[index]} **[${entry.team!.tag}] ${entry.team!.name}** — ${formatNumber(entry.points)} ${t("pts")}`),
                "",
                settings.weekly_reward > 0 ? t("Cada membro da equipa vencedora ganhou **{n}** moedas: {members}", { n: formatNumber(settings.weekly_reward), members: members.map((member) => `<@${member.user_id}>`).join(" ") }) : null,
                `-# ${t("Uma nova semana começou — todos os contadores voltaram a zero.")}`,
            ].filter((line) => line !== null).join("\n"),
        })],
        flags: CV2_FLAG,
        allowedMentions: { users: members.map((member) => member.user_id) },
    }).catch(() => null);
}

async function tick(client: Client<true>): Promise<void> {
    if (weekdayFormatter.format(new Date()) !== "Mon") return;
    for (const guild of ourGuilds(client)) {
        const settings = await getTeamSettings(guild.id);
        if (settings.enabled && settings.weekly_war) await closeWeek(guild, settings).catch((error) => logger.warn("Equipas: falha a fechar a semana:", error));
    }
}

let timer: NodeJS.Timeout | null = null;

export function startTeamJobs(client: Client<true>): void {
    if (timer) return;
    const run = () => void tick(client).catch((error) => logger.warn("Equipas: falha na tarefa:", error));
    setTimeout(run, 60_000).unref?.();
    timer = setInterval(run, 30 * 60_000);
    timer.unref?.();
}
