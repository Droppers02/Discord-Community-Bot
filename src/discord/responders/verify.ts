import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { parseCustomId } from "../../lib/ids.js";
import { newImage, pickSymbol, startVerification } from "../../modules/verification/verifyService.js";

// Botões do painel de verificação e do captcha (efémero, de cada pessoa).
createResponder({
    customId: "verify/**",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const { action, systemId } = parseCustomId(interaction.customId);
        if (action === "start") return void startVerification(interaction);
        if (action === "new") return void newImage(interaction);
        if (action === "pick") return void pickSymbol(interaction, systemId);
    },
});
