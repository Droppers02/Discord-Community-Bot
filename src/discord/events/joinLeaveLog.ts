import { createEvent } from "#base";
import type { Client } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG, safeFireAndForget } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { relative, humanizeDuration } from "../../lib/time.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { resolveUsedInvite } from "../../modules/logs/inviteTracker.js";
import { countInvitesBy, getInvitedJoin, recordInvitedJoin, removeInvitedJoin } from "../../repositories/inviteRepository.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { t } from "../../lib/i18n.js";

async function sendTo(client: Client, channelId: string, container: ContainerPlusBuilder): Promise<void> {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased() && !channel.isDMBased()) {
        // Log: as menções aparecem sem fazer ping.
        safeFireAndForget(channel.send({ components: [container], flags: CV2_FLAG, allowedMentions: { parse: [] } }));
    }
}

createEvent({
    name: "Join log",
    event: "guildMemberAdd",
    async run(member) {
        const config = await ensureGuildConfig(member.guild.id);
        const used = await resolveUsedInvite(member.guild);

        // Attribute the join and compute the inviter's running total.
        let inviteLine: string;
        if (used) {
            await recordInvitedJoin(member.guild.id, member.id, used.inviterId, used.code);
            if (used.inviterId) {
                const total = await countInvitesBy(member.guild.id, used.inviterId);
                inviteLine = `\`${used.code}\` · <@${used.inviterId}> (**${total}**)`;
            } else {
                inviteLine = `\`${used.code}\``;
            }
        } else {
            inviteLine = member.user.bot ? t("OAuth (bot)") : "desconhecido";
        }

        if (!config.join_log_channel) return;
        const joined = member.joinedTimestamp ?? Date.now();

        // One field per line so nothing wraps mid-label even with the avatar thumbnail
        // narrowing the text column.
        await sendTo(member.client, config.join_log_channel, buildContainer({
            color: COLORS.success,
            thumbnailUrl: member.user.displayAvatarURL(),
            title: `${emoji.join} ${t("Membro entrou")}`,
            description: [
                `${emoji.user} <@${member.id}>`,
                `${emoji.id} **ID** \`${member.id}\``,
                `${emoji.calendar} **${t("Conta criada")}** ${relative(member.user.createdTimestamp)}`,
                `${emoji.join} **${t("Entrada")}** ${relative(joined)}`,
                `${emoji.clock} **${t("No servidor")}** ${humanizeDuration(Date.now() - joined)}`,
                `${emoji.link} **${t("Convite")}** ${inviteLine}`,
            ].join("\n"),
            footerText: member.user.tag,
        }));
    },
});

createEvent({
    name: "Leave log",
    event: "guildMemberRemove",
    async run(member) {
        const config = await ensureGuildConfig(member.guild.id);
        const attribution = await getInvitedJoin(member.guild.id, member.id);
        await removeInvitedJoin(member.guild.id, member.id); // count goes down for the inviter

        if (!config.leave_log_channel) return;
        const joined = member.joinedTimestamp;

        const lines = [
            `${emoji.user} <@${member.id}>`,
            `${emoji.id} **ID** \`${member.id}\``,
            `${emoji.calendar} **${t("Conta criada")}** ${relative(member.user?.createdTimestamp ?? null)}`,
            `${emoji.join} **${t("Entrada")}** ${joined ? relative(joined) : "—"}`,
            `${emoji.clock} **${t("No servidor")}** ${joined ? humanizeDuration(Date.now() - joined) : "—"}`,
        ];
        if (attribution?.inviter_id) lines.push(`${emoji.link} **${t("Convidado por")}** <@${attribution.inviter_id}>`);

        await sendTo(member.client, config.leave_log_channel, buildContainer({
            color: COLORS.danger,
            thumbnailUrl: member.user?.displayAvatarURL() ?? null,
            title: `${emoji.leave} ${t("Membro saiu")}`,
            description: lines.join("\n"),
            footerText: member.user?.tag ?? member.id,
        }));
    },
});
