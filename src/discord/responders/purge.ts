import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { handlePurgeButton } from "../../modules/moderation/purgeService.js";

// /limpar → pré-visualização: purge/<ok|old|only|cancel>/<id>.

createResponder({
    customId: "purge/:action/:id",
    types: [ResponderType.Button],
    async run(interaction, { action, id }) {
        if (!interaction.inCachedGuild()) return;
        await handlePurgeButton(interaction, id, action);
    },
});
