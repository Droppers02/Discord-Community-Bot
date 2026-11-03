import chalk from "chalk";
import { getRequestContext } from "./requestContext.js";

type Level = "info" | "warn" | "error" | "debug";

const isProduction = process.env.NODE_ENV === "production";

const levelColor: Record<Level, (text: string) => string> = {
    info: chalk.cyan,
    warn: chalk.yellow,
    error: chalk.red,
    debug: chalk.magenta,
};

function safeStringify(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function buildMessage(args: unknown[]): { message: string; stack?: string } {
    const errorArg = args.find((arg): arg is Error => arg instanceof Error);
    const message = args
        .map((arg) => (arg instanceof Error ? arg.message : safeStringify(arg)))
        .join(" ");
    return errorArg?.stack ? { message, stack: errorArg.stack } : { message };
}

function write(level: Level, args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const context = getRequestContext();
    const { message, stack } = buildMessage(args);
    const stream = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

    if (isProduction) {
        stream(JSON.stringify({
            timestamp,
            level,
            message,
            ...(context?.correlationId ? { correlationId: context.correlationId } : {}),
            ...(context?.route ? { route: context.route } : {}),
            ...(context?.guildId ? { guildId: context.guildId } : {}),
            ...(context?.userId ? { userId: context.userId } : {}),
            ...(stack ? { stack } : {}),
        }));
        return;
    }

    const contextLabel = context
        ? chalk.gray(` [${context.correlationId.slice(0, 8)}${context.route ? ` ${context.route}` : ""}${context.guildId ? ` g:${context.guildId}` : ""}]`)
        : "";
    stream(`${chalk.gray(timestamp)} ${levelColor[level](level)}${contextLabel} ${stack ?? message}`);
}

export const logger = {
    info(...args: unknown[]): void {
        write("info", args);
    },
    warn(...args: unknown[]): void {
        write("warn", args);
    },
    error(...args: unknown[]): void {
        write("error", args);
    },
    debug(...args: unknown[]): void {
        if (process.env.LOG_LEVEL !== "debug") return;
        write("debug", args);
    },
};
