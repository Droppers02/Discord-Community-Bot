import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { handleShipVote } from "../../modules/games/ship.js";

// /ship → votos do servidor: shipv/<id>/<up|down|stats>.

createResponder({
    customId: "shipv/:id/:action",
    types: [ResponderType.Button],
    async run(interaction, { id, action }) {
        if (!interaction.inCachedGuild()) return;
        await handleShipVote(interaction, id, action);
    },
});
