import { createRawEvent } from "#base";
import { isAllowedGuild } from "../../config.js";
import { logger } from "../../lib/logger.js";

// O EPA BOTCHI é privado. Se alguém o puser noutro servidor, regista-se e mais nada: os
// comandos não existem lá (são registados só nos servidores do .env) e os eventos são
// ignorados. Usa-se o createRawEvent porque o nosso (#base) descarta
// eventos de servidores fora da lista — que é precisamente o caso aqui.
createRawEvent({
    name: "Aviso de entrada num servidor que não é o nosso",
    event: "guildCreate",
    async run(guild) {
        if (isAllowedGuild(guild.id)) return;
        logger.warn(`O bot foi adicionado a um servidor fora da lista: ${guild.name} (${guild.id}). Fica inativo lá.`);
    },
});
