import { GuildMember, TextChannel, type RepliableInteraction } from "discord.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { hasStaffAccess, replyContainer } from "../../lib/discord.js";
import { errorContainer } from "../../lib/containers.js";
import type { GuildConfig } from "../../types.js";
import { t } from "../../lib/i18n.js";

export interface TicketContext {
    channel: TextChannel;
    channelId: string;
    member: GuildMember;
    config: GuildConfig;
}

/** Resolve guild + text channel + member + config for a ticket interaction, or null (after replying). */
export async function loadTicketContext(interaction: RepliableInteraction): Promise<TicketContext | null> {
    if (!interaction.inGuild() || !interaction.guild || !interaction.channel?.isTextBased() || !interaction.channelId) {
        return null;
    }

    const config = await ensureGuildConfig(interaction.guildId);
    return {
        channel: interaction.channel as TextChannel,
        channelId: interaction.channelId,
        member: interaction.member as GuildMember,
        config,
    };
}

export async function ensureStaff(interaction: RepliableInteraction, context: TicketContext): Promise<boolean> {
    if (hasStaffAccess(context.member, context.config.staff_role, context.config.admin_role)) {
        return true;
    }
    await replyContainer(interaction, errorContainer(t("Apenas staff ou super-admin pode usar este painel.")));
    return false;
}
