import type { Client } from "discord.js";
import { closeDatabase, releaseLock } from "#database";
import { logger } from "./logger.js";

let registered = false;
let shuttingDown = false;

async function shutdown(client: Client, signal: string, exitCode: number): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Sinal ${signal} recebido — a encerrar o EPA BOTCHI…`);
    try {
        releaseLock();
        await closeDatabase();
        client.destroy();
    } catch (err) {
        logger.error("Erro durante o shutdown:", err);
    } finally {
        process.exit(exitCode);
    }
}

/**
 * Wires process-level lifecycle handling: graceful shutdown on SIGTERM/SIGINT
 * (release advisory lock, close the DB pool, destroy the Discord client) and
 * global error handlers so an unexpected rejection/exception is logged instead
 * of silently killing the process.
 */
export function registerProcessLifecycle(client: Client): void {
    if (registered) return;
    registered = true;

    process.on("SIGTERM", () => void shutdown(client, "SIGTERM", 0));
    process.on("SIGINT", () => void shutdown(client, "SIGINT", 0));

    process.on("unhandledRejection", (reason) => {
        logger.error("unhandledRejection:", reason);
    });

    process.on("uncaughtException", (error) => {
        logger.error("uncaughtException:", error);
        // The process state may be corrupt — shut down in a controlled way.
        void shutdown(client, "uncaughtException", 1);
    });
}
