import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags, PermissionFlagsBits, type GuildMember } from "discord.js";
import { CV2_FLAG, hasSuperAdminAccess, replyContainer } from "../../lib/discord.js";
import { registerEphemeralPanel } from "../../lib/ephemeralLifecycle.js";
import { errorContainer } from "../../lib/containers.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getEntriesDetailed, getGiveawayById } from "../../repositories/giveawayRepository.js";
import { getGiveawaySettings } from "../../modules/giveaways/giveawaySettings.js";
import { buildParticipantsPanel, isParticipantsSort } from "../../modules/giveaways/participantsPanel.js";
import { t } from "../../lib/i18n.js";

async function canManageGiveaways(guildId: string, member: GuildMember): Promise<boolean> {
    const config = await ensureGuildConfig(guildId);
    if (hasSuperAdminAccess(member, config.admin_role)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    const settings = await getGiveawaySettings(guildId);
    return settings.host_role ? member.roles.cache.has(settings.host_role) : false;
}

// Staff-only participants viewer. The first click comes from the public giveaway message
// (open a fresh ephemeral panel); sort/page clicks come from that ephemeral panel (update
// it in place).
createResponder({
    customId: "gwview/:id/:sort/:page",
    types: [ResponderType.Button],
    async run(interaction, { id, sort, page }) {
        if (!interaction.inCachedGuild()) return;
        if (!(await canManageGiveaways(interaction.guildId, interaction.member))) {
            await replyContainer(interaction, errorContainer(t("Apenas a staff pode ver os participantes.")));
            return;
        }

        const giveaway = await getGiveawayById(id);
        if (!giveaway || giveaway.guild_id !== interaction.guildId) {
            await replyContainer(interaction, errorContainer(t("Sorteio não encontrado.")));
            return;
        }

        const safeSort = isParticipantsSort(sort) ? sort : "recent";
        const pageNumber = Number.parseInt(page, 10) || 0;
        const entries = await getEntriesDetailed(id);
        const panel = buildParticipantsPanel(giveaway, entries, safeSort, pageNumber);

        const fromEphemeralPanel = interaction.message?.flags.has(MessageFlags.Ephemeral) ?? false;
        if (fromEphemeralPanel) {
            await interaction.update({ components: [panel] as never });
            return;
        }
        await interaction.reply({ components: [panel] as never, flags: CV2_FLAG | MessageFlags.Ephemeral });
        await registerEphemeralPanel(interaction);
    },
});
