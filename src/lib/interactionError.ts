import type { RepliableInteraction } from "discord.js";
import { errorContainer } from "./containers.js";
import { replyOrFollowUpContainer } from "./discord.js";
import { logger } from "./logger.js";
import { isBotError } from "../errors/index.js";
import { t, tk } from "./i18n.js";

const GENERIC_MESSAGE = tk("Ocorreu um erro inesperado. Tenta novamente daqui a pouco.");

/**
 * Central place to turn a thrown error into a Discord response. Expected errors
 * (`BotError`) show their `userMessage`; anything else is logged in full (with the
 * current correlationId) and shown to the user as a generic message.
 */
export async function handleInteractionError(interaction: RepliableInteraction, error: unknown): Promise<void> {
    const message = isBotError(error) ? error.userMessage : t(GENERIC_MESSAGE);

    if (isBotError(error)) {
        logger.debug(`BotError [${error.code}]: ${error.userMessage}`);
    } else {
        logger.error("Erro não tratado numa interação:", error);
    }

    await replyOrFollowUpContainer(interaction, errorContainer(message)).catch(() => null);
}
