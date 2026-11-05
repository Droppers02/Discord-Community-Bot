import { createCommand } from "#base";
import { ApplicationCommandType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { buildMemberFile } from "../../../modules/moderation/memberFile.js";
import { hasModAccess } from "../../../modules/moderation/moderationService.js";

// Botão direito num membro → Apps → Ficha do membro (só a equipa).

createCommand({
    name: "Ficha do membro",
    type: ApplicationCommandType.User,
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!(await hasModAccess(interaction.member, PermissionFlagsBits.ModerateMembers))) {
            return void interaction.editReply({ components: [errorContainer(t("Só a equipa vê as fichas."))], flags: CV2_FLAG });
        }
        await interaction.editReply({ components: [await buildMemberFile(interaction.guild, interaction.targetUser)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});
