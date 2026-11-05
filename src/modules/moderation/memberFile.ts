import { ButtonBuilder, ButtonStyle, ModalBuilder, type Guild, type User } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { query, queryOne } from "#database";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { e, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { humanizeDuration, timestamp } from "../../lib/time.js";
import { getAccount } from "../../repositories/economyRepository.js";
import { getInvitedJoin } from "../../repositories/inviteRepository.js";
import { casesOf, type ModCase } from "../../repositories/modCaseRepository.js";
import { getReputation } from "../../repositories/reputationRepository.js";
import { appealsOf } from "../../repositories/appealRepository.js";
import { textField } from "../config/panelKit.js";
import { caseLine } from "./moderationService.js";

// Ficha do membro (botão direito → Apps → Ficha do membro, ou /mod ficha): tudo o que a equipa
// precisa de saber de alguém num só sítio, com as ações mais comuns à mão. As notas da equipa
// são privadas (só a equipa as vê) e ficam para sempre, ao contrário dos avisos.

export const FILE_NS = "ficha";
const cid = (action: string, userId: string) => buildCustomId(FILE_NS, action, userId);
const NEW_ACCOUNT_MS = 7 * 86_400_000;

// ─── Notas da equipa ─────────────────────────────────────────────────────────

export interface StaffNote { id: number; author_id: string; note: string; created_at: number }

export async function addStaffNote(guildId: string, userId: string, authorId: string, note: string): Promise<void> {
    await query("INSERT INTO member_staff_notes (guild_id, user_id, author_id, note, created_at) VALUES ($1, $2, $3, $4, $5)", [guildId, userId, authorId, note.slice(0, 1000), Date.now()]);
}

export async function staffNotesOf(guildId: string, userId: string, limit = 5): Promise<{ notes: StaffNote[]; total: number }> {
    const [{ rows }, count] = await Promise.all([
        query("SELECT id, author_id, note, created_at FROM member_staff_notes WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3", [guildId, userId, limit]),
        queryOne<{ n: string }>("SELECT COUNT(*) AS n FROM member_staff_notes WHERE guild_id = $1 AND user_id = $2", [guildId, userId]),
    ]);
    return { notes: rows.map((row) => ({ id: Number(row.id), author_id: String(row.author_id), note: String(row.note), created_at: Number(row.created_at) })), total: Number(count?.n ?? 0) };
}

export async function deleteLastStaffNote(guildId: string, userId: string): Promise<boolean> {
    const result = await query("DELETE FROM member_staff_notes WHERE id = (SELECT id FROM member_staff_notes WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1)", [guildId, userId]);
    return (result.rowCount ?? 0) > 0;
}

// ─── Resumo dos casos ────────────────────────────────────────────────────────

/** Contagem por tipo para a linha de resumo (avisos ativos à parte). */
export function caseSummary(cases: ModCase[]): { warns: number; activeWarns: number; timeouts: number; kicks: number; bans: number; purges: number } {
    return {
        warns: cases.filter((entry) => entry.action === "warn").length,
        activeWarns: cases.filter((entry) => entry.action === "warn" && entry.active).length,
        timeouts: cases.filter((entry) => entry.action === "timeout").length,
        kicks: cases.filter((entry) => entry.action === "kick").length,
        bans: cases.filter((entry) => entry.action === "ban").length,
        purges: cases.filter((entry) => entry.action === "purge" && entry.user_id !== entry.moderator_id).length,
    };
}

/** Avaliação rápida do risco (para a cor e o selo da ficha). */
export function riskLevel(summary: ReturnType<typeof caseSummary>, reportsAgainst: number, newAccount: boolean): "baixo" | "médio" | "alto" {
    const score = summary.activeWarns * 2 + summary.timeouts * 2 + summary.kicks * 4 + summary.bans * 6 + Math.min(reportsAgainst, 5) + (newAccount ? 2 : 0);
    return score >= 8 ? "alto" : score >= 3 ? "médio" : "baixo";
}

async function reportCounts(guildId: string, userId: string): Promise<{ against: number; open: number; made: number }> {
    const row = await queryOne<{ against: string; open: string; made: string }>(
        `SELECT
            COUNT(*) FILTER (WHERE author_id = $2) AS against,
            COUNT(*) FILTER (WHERE author_id = $2 AND status IN ('open', 'claimed')) AS open,
            COUNT(*) FILTER (WHERE reporters @> $3::jsonb) AS made
         FROM message_reports WHERE guild_id = $1`,
        [guildId, userId, JSON.stringify([{ id: userId }])],
    ).catch(() => null);
    return { against: Number(row?.against ?? 0), open: Number(row?.open ?? 0), made: Number(row?.made ?? 0) };
}

async function teamOf(guildId: string, userId: string): Promise<{ name: string; tag: string; rank: string } | null> {
    return queryOne<{ name: string; tag: string; rank: string }>(
        "SELECT t.name, t.tag, m.rank FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.guild_id = $1 AND m.user_id = $2",
        [guildId, userId],
    ).catch(() => null);
}

export async function buildMemberFile(guild: Guild, user: User): Promise<ContainerPlusBuilder> {
    const [member, cases, notes, invite, level, account, rep, reports, appeals, ban, team] = await Promise.all([
        guild.members.fetch(user.id).catch(() => null),
        casesOf(guild.id, user.id, 50),
        staffNotesOf(guild.id, user.id, 5),
        getInvitedJoin(guild.id, user.id).catch(() => null),
        queryOne<{ xp: string; level: number; messages: number; voice_seconds: string }>("SELECT xp, level, messages, voice_seconds FROM member_levels WHERE guild_id = $1 AND user_id = $2", [guild.id, user.id]).catch(() => null),
        getAccount(guild.id, user.id).catch(() => null),
        getReputation(guild.id, user.id).catch(() => ({ points: 0 })),
        reportCounts(guild.id, user.id),
        appealsOf(guild.id, user.id).catch(() => []),
        guild.bans.fetch(user.id).catch(() => null),
        teamOf(guild.id, user.id),
    ]);

    const summary = caseSummary(cases);
    const newAccount = Date.now() - user.createdTimestamp < NEW_ACCOUNT_MS;
    const risk = riskLevel(summary, reports.against, newAccount);
    const timedOut = member?.isCommunicationDisabled() ? member.communicationDisabledUntilTimestamp : null;

    const badges = [
        user.bot ? `${e("bot")} ${t("bot")}` : null,
        newAccount ? `${e("warn")} ${t("conta nova")}` : null,
        timedOut ? `${e("timeout")} ${t("de castigo até {when}", { when: timestamp(timedOut, "t") })}` : null,
        ban ? `${e("ban")} ${t("banido")}` : null,
        !member && !ban ? `${e("leave")} ${t("já não está no servidor")}` : null,
        `${risk === "alto" ? "🔴" : risk === "médio" ? "🟡" : "🟢"} ${t("risco {risk}", { risk })}`,
    ].filter(Boolean);

    const roles = member ? [...member.roles.cache.values()].filter((role) => role.id !== guild.id).sort((a, b) => b.position - a.position) : [];
    const lastCases = cases.slice(0, 5).map(caseLine);

    const fields = [
        {
            name: `${e("id")} ${t("Conta")}`,
            value: [
                t("Criada {when} ({ago})", { when: timestamp(user.createdTimestamp, "D"), ago: timestamp(user.createdTimestamp, "R") }),
                member?.joinedTimestamp ? t("Entrou {when} ({ago})", { when: timestamp(member.joinedTimestamp, "D"), ago: timestamp(member.joinedTimestamp, "R") }) : null,
                invite?.inviter_id ? t("Convidado por {user}{code}", { user: `<@${invite.inviter_id}>`, code: invite.code ? ` (\`${invite.code}\`)` : "" }) : null,
                team ? t("Equipa: **{name}** [{tag}] · {rank}", { name: team.name, tag: team.tag, rank: team.rank }) : null,
            ].filter(Boolean).join("\n"),
        },
        {
            name: `${e("chart")} ${t("Atividade")}`,
            value: level || account
                ? [
                    level ? t("Nível **{level}** · {xp} XP · {messages} mensagens · {voice} em voz", { level: level.level, xp: formatNumber(Number(level.xp)), messages: formatNumber(level.messages), voice: humanizeDuration(Number(level.voice_seconds) * 1000) }) : null,
                    t("{coins} moedas · {rep} reputação", { coins: formatNumber(account?.balance ?? 0), rep: rep.points }),
                ].filter(Boolean).join("\n")
                : t("*Sem atividade registada.*"),
        },
        {
            name: `${e("hammer")} ${t("Moderação")}`,
            value: [
                t("Avisos {active}/{total} ativos · castigos {timeouts} · expulsões {kicks} · bans {bans}", { active: summary.activeWarns, total: summary.warns, timeouts: summary.timeouts, kicks: summary.kicks, bans: summary.bans }),
                t("Denúncias contra: {against}{open} · feitas: {made}", { against: reports.against, open: reports.open ? ` (${t("{n} por tratar", { n: reports.open })})` : "", made: reports.made }),
                appeals.length ? t("Pedidos de revisão de ban: {n}", { n: appeals.length }) : null,
                ...(lastCases.length ? ["", ...lastCases] : []),
                cases.length > 5 ? `-# ${t("+{n} casos — botão «Todos os casos».", { n: cases.length - 5 })}` : null,
            ].filter((line) => line !== null).join("\n"),
        },
        {
            name: `${e("notes")} ${t("Notas da equipa ({n})", { n: notes.total })}`,
            value: notes.notes.length
                ? notes.notes.map((note) => `${timestamp(note.created_at, "d")} · <@${note.author_id}>: ${note.note.slice(0, 200)}`).join("\n")
                : t("*Sem notas. Usa «Nota» para deixar contexto à equipa (só a equipa vê).*"),
        },
        ...(roles.length ? [{ name: `${e("role")} ${t("Cargos ({n})", { n: roles.length })}`, value: roles.slice(0, 15).map((role) => `<@&${role.id}>`).join(" ") + (roles.length > 15 ? ` +${roles.length - 15}` : "") }] : []),
    ];

    const actions = [
        new ButtonBuilder().setCustomId(cid("note", user.id)).setLabel(t("Nota")).setEmoji(ei("notes")).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(cid("warn", user.id)).setLabel(t("Avisar")).setEmoji(ei("warn")).setStyle(ButtonStyle.Secondary).setDisabled(!member || user.bot),
        timedOut
            ? new ButtonBuilder().setCustomId(cid("untimeout", user.id)).setLabel(t("Tirar castigo")).setEmoji(ei("unlock")).setStyle(ButtonStyle.Success)
            : new ButtonBuilder().setCustomId(cid("timeout", user.id)).setLabel(t("Castigar")).setEmoji(ei("timeout")).setStyle(ButtonStyle.Secondary).setDisabled(!member),
        new ButtonBuilder().setCustomId(cid("purge", user.id)).setLabel(t("Limpar 24h")).setEmoji(ei("trash")).setStyle(ButtonStyle.Danger),
    ];
    const more = [
        new ButtonBuilder().setCustomId(cid("cases", user.id)).setLabel(t("Todos os casos")).setEmoji(ei("hammer")).setStyle(ButtonStyle.Secondary).setDisabled(cases.length === 0),
        new ButtonBuilder().setCustomId(cid("delnote", user.id)).setLabel(t("Apagar última nota")).setStyle(ButtonStyle.Secondary).setDisabled(notes.total === 0),
        new ButtonBuilder().setCustomId(cid("refresh", user.id)).setLabel(t("Atualizar")).setEmoji(ei("reroll")).setStyle(ButtonStyle.Secondary),
    ];

    return buildContainer({
        color: risk === "alto" ? COLORS.danger : risk === "médio" ? COLORS.warning : COLORS.info,
        title: `${e("id")} ${t("Ficha de {name}", { name: member?.displayName ?? user.username })}`,
        thumbnailUrl: (member ?? user).displayAvatarURL({ size: 128 }),
        description: [`<@${user.id}> · \`${user.username}\` · ${user.id}`, badges.join(" · ")].join("\n"),
        fields,
        footerText: t("Só a equipa vê esta ficha."),
        rows: [row(...actions), row(...more)],
    });
}

export function buildAllCasesView(user: User, cases: ModCase[]): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.info,
        title: `${e("hammer")} ${t("Casos de {name}", { name: user.username })}`,
        description: cases.length ? cases.slice(0, 25).map(caseLine).join("\n") : t("Sem registos. 😇"),
        footerText: cases.length > 25 ? t("A mostrar os 25 mais recentes de {n}.", { n: cases.length }) : null,
        rows: [row(new ButtonBuilder().setCustomId(cid("refresh", user.id)).setLabel(t("Voltar à ficha")).setEmoji(ei("arrowLeft")).setStyle(ButtonStyle.Secondary))],
    });
}

export function buildNoteModal(userId: string): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("notesave", userId)).setTitle(t("Nota da equipa")).addLabelComponents(
        textField("note", t("Nota (só a equipa vê)"), "", { required: true, paragraph: true, max: 1000, placeholder: t("Ex.: avisado em voz por spam de áudio, pediu desculpa.") }),
    );
}

export function buildWarnModal(userId: string): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("warnsave", userId)).setTitle(t("Avisar")).addLabelComponents(
        textField("reason", t("Motivo (vai para o membro e para o registo)"), "", { required: true, paragraph: true, max: 400 }),
    );
}

export function buildTimeoutModal(userId: string): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("timeoutsave", userId)).setTitle(t("Castigar")).addLabelComponents(
        textField("duration", t("Duração"), "1h", { required: true, max: 20, description: t("Ex.: 10m, 1h, 2d (máx. 28 dias)") }),
        textField("reason", t("Motivo"), "", { paragraph: true, max: 400 }),
    );
}
