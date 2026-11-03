import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { hasStaffAccess } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getQueue, skip, type GuildQueue } from "./player.js";

// Quem pode mandar na música: a equipa (ou quem gere canais), quem pediu a música que está a
// tocar, ou quem está sozinho com o bot. Os outros votam para pular (maioria de quem ouve).

export function listeners(member: GuildMember, queue: GuildQueue): GuildMember[] {
    const channel = member.guild.channels.cache.get(queue.voiceChannelId);
    return channel?.isVoiceBased() ? [...channel.members.filter((entry) => !entry.user.bot).values()] : [];
}

export async function canControl(member: GuildMember, queue: GuildQueue): Promise<boolean> {
    if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
    const config = await ensureGuildConfig(member.guild.id);
    if (hasStaffAccess(member, config.staff_role, config.admin_role)) return true;
    if (queue.current?.requestedBy === member.id) return true;
    const present = listeners(member, queue);
    return present.length === 1 && present[0]!.id === member.id;
}

/** Problema por estar fora do canal da música (ou null se está tudo bem). */
export function voiceProblem(member: GuildMember): { queue: GuildQueue | null; problem: string | null } {
    const queue = getQueue(member.guild.id) ?? null;
    if (!queue) return { queue: null, problem: t("Não está a tocar nada.") };
    if (member.voice.channelId !== queue.voiceChannelId) return { queue, problem: t("Tens de estar no canal de voz da música ({channel}).", { channel: `<#${queue.voiceChannelId}>` }) };
    return { queue, problem: null };
}

/** Pular: direto para quem pode; para os outros conta um voto. Devolve o texto do resultado. */
export async function skipOrVote(member: GuildMember, queue: GuildQueue): Promise<string> {
    if (await canControl(member, queue)) {
        const title = queue.current?.title ?? "";
        skip(queue);
        return t("⏭️ Saltei **{title}**.", { title });
    }
    queue.skipVotes.add(member.id);
    const present = listeners(member, queue);
    const needed = Math.ceil(present.length / 2);
    const votes = [...queue.skipVotes].filter((id) => present.some((entry) => entry.id === id)).length;
    if (votes >= needed) {
        const title = queue.current?.title ?? "";
        skip(queue);
        return t("⏭️ A maioria votou — saltei **{title}**.", { title });
    }
    return t("🗳️ Voto registado ({votes}/{needed} para saltar).", { votes, needed });
}
