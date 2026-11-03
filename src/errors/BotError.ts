export interface BotErrorOptions {
    code?: string;
    cause?: unknown;
}

/**
 * Base class for expected, user-facing errors. `userMessage` is safe to show in
 * Discord; `code` is a stable machine-readable identifier for logs/metrics.
 */
export class BotError extends Error {
    readonly userMessage: string;
    readonly code: string;

    constructor(userMessage: string, options: BotErrorOptions = {}) {
        super(userMessage, options.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = new.target.name;
        this.userMessage = userMessage;
        this.code = options.code ?? "BOT_ERROR";
    }
}

export function isBotError(error: unknown): error is BotError {
    return error instanceof BotError;
}
