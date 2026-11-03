import { createEvent } from "#base";
import { logger } from "../../lib/logger.js";
import { handleLevelMessage } from "../../modules/levels/levelService.js";

createEvent({
    name: "Níveis: XP por mensagem",
    event: "messageCreate",
    async run(message) {
        if (!message.inGuild()) return;
        await handleLevelMessage(message).catch((error) => logger.warn("Níveis: falha ao dar XP:", error));
    },
});
