import { BotError, type BotErrorOptions } from "./BotError.js";

export class NotFoundError extends BotError {
    constructor(userMessage: string, options: BotErrorOptions = {}) {
        super(userMessage, { code: "NOT_FOUND", ...options });
    }
}
