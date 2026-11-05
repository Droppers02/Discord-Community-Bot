import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { controlQuiz } from "../../modules/musicquiz/musicQuiz.js";

// Quiz de música: mquiz/<skip|stop>/<guildId>.

createResponder({
    customId: "mquiz/:action/:guildId",
    types: [ResponderType.Button],
    async run(interaction, { action }) {
        if (!interaction.inCachedGuild()) return;
        const problem = await controlQuiz(interaction.member, action === "stop" ? "stop" : "skip");
        await interaction.reply({ components: [problem ? errorContainer(problem) : successContainer(action === "stop" ? t("Quiz terminado.") : t("A saltar para a revelação…"))], flags: CV2_FLAG | MessageFlags.Ephemeral });
    },
});
