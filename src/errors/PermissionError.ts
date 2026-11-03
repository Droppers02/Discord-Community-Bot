import { BotError, type BotErrorOptions } from "./BotError.js";

export class PermissionError extends BotError {
    constructor(userMessage: string, options: BotErrorOptions = {}) {
        super(userMessage, { code: "PERMISSION_DENIED", ...options });
    }
}
