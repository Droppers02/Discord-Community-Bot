import { createCommand } from "#base";
import { ApplicationCommandType } from "discord.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { freeGamesListView } from "../../../modules/freegames/freeGamesService.js";

createCommand({
    name: "jogosgratis",
    description: t("Jogos grátis agora (Epic, Steam, GOG, Prime…) e os próximos da Epic."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply();
        await interaction.editReply({ components: [await freeGamesListView(interaction.guildId)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});
