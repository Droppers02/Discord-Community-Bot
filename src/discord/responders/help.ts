import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { buildHelp, isHelpSection } from "../../modules/community/help.js";

createResponder({
    customId: "help/section",
    types: [ResponderType.StringSelect],
    async run(interaction) {
        const section = interaction.values[0] ?? "geral";
        await interaction.update({ components: [buildHelp(isHelpSection(section) ? section : "geral")] });
    },
});
