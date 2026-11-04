import { createRawEvent } from "#base";
import { noteDmInteraction } from "../../lib/dmDiagnostics.js";

// Regista a chegada de cada interação em mensagem privada (antes de qualquer handler), para o
// diagnóstico da revisão de bans: se nem isto aparece, o Discord não entregou o clique ao bot.
createRawEvent({
    name: "Diagnóstico de interações em DM",
    event: "interactionCreate",
    async run(interaction) {
        if (!interaction.guildId) noteDmInteraction(interaction, "chegou");
    },
});
