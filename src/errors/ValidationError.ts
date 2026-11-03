import { BotError, type BotErrorOptions } from "./BotError.js";

export class ValidationError extends BotError {
    constructor(userMessage: string, options: BotErrorOptions = {}) {
        super(userMessage, { code: "VALIDATION_ERROR", ...options });
    }
}
