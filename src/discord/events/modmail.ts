import { createEvent } from "#base";
import { logger } from "../../lib/logger.js";
import { handleDirectMessage, handleStaffMessage } from "../../modules/modmail/modmailService.js";

createEvent({
    name: "Modmail: mensagens privadas e respostas da equipa",
    event: "messageCreate",
    async run(message) {
        try {
            if (message.inGuild()) await handleStaffMessage(message);
            else await handleDirectMessage(message);
        } catch (error) {
            logger.warn("Modmail: falha ao encaminhar:", error);
        }
    },
});
