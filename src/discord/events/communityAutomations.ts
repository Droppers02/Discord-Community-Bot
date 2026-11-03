import { createEvent } from "#base";
import { logger } from "../../lib/logger.js";
import { maybeAutoPublish } from "../../modules/community/statsAndBroadcast.js";

// Auto-publish: crosspost automático das mensagens em canais de anúncios configurados.
createEvent({
    name: "Comunidade: auto-publish",
    event: "messageCreate",
    async run(message) {
        if (!message.inGuild() || message.author.bot) return;
        void maybeAutoPublish(message.guildId, message.channelId, () => message.crosspost(), message.channel.type)
            .catch((error) => logger.warn("Auto-publish falhou:", error));
    },
});
