import { createEvent } from "#base";
import { logger } from "../../lib/logger.js";
import { checkMessageContent, trackJoinForRaid, trackMessageForSlowmode } from "../../modules/protection/protectionService.js";

createEvent({
    name: "Proteção: filtros e slowmode",
    event: "messageCreate",
    async run(message) {
        if (!message.inGuild() || message.author.bot) return;
        try {
            const removed = await checkMessageContent(message);
            if (!removed) await trackMessageForSlowmode(message);
        } catch (error) {
            logger.warn("Proteção: falha a verificar a mensagem:", error);
        }
    },
});

createEvent({
    name: "Proteção: filtros em mensagens editadas",
    event: "messageUpdate",
    async run(_old, message) {
        if (!message.inGuild() || message.author?.bot || message.partial) return;
        await checkMessageContent(message).catch((error) => logger.warn("Proteção: falha a verificar a edição:", error));
    },
});

createEvent({
    name: "Proteção: anti-raid",
    event: "guildMemberAdd",
    async run(member) {
        await trackJoinForRaid(member).catch((error) => logger.warn("Anti-raid: falha:", error));
    },
});
