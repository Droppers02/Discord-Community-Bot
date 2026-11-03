import { createEvent } from "#base";
import { logger } from "../../lib/logger.js";
import { removePendingVerification } from "../../repositories/verifyRepository.js";
import { handleMemberJoin } from "../../modules/verification/verifyService.js";

createEvent({
    name: "Verificação: entrada de membro",
    event: "guildMemberAdd",
    async run(member) {
        await handleMemberJoin(member).catch((error) => logger.warn("Verificação: falha ao tratar a entrada:", error));
    },
});

createEvent({
    name: "Verificação: saída de membro",
    event: "guildMemberRemove",
    async run(member) {
        await removePendingVerification(member.guild.id, member.id).catch(() => null);
    },
});
