import { createCommand } from "#base";
import { ApplicationCommandType, MessageFlags } from "discord.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { buildConfessionModal } from "../../../modules/confessions/confessionService.js";
import { getConfessionSettings } from "../../../modules/confessions/confessionSettings.js";

createCommand({
    name: "confissao",
    description: t("Envia uma confissão anónima (ninguém sabe que foste tu)."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const settings = await getConfessionSettings(interaction.guildId);
        if (!settings.enabled || !settings.channel) {
            return void interaction.reply({ components: [errorContainer(t("As confissões não estão ligadas neste servidor."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        await interaction.showModal(buildConfessionModal(0, settings.allow_images));
    },
});
