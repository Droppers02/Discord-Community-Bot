import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContext {
    correlationId: string;
    route?: string;
    guildId?: string;
    userId?: string;
}

// Structural shape covering both command and component/modal interactions.
interface ContextInteraction {
    guildId: string | null;
    user: { id: string };
    commandName?: string;
    customId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
    return storage.getStore();
}

/**
 * Contexto de uma interação, para o middleware (correlationId e rota nos logs). O `enterWith`
 * corre ANTES de qualquer `await`: o @constatic/base faz `await middleware()` e só depois chama
 * o handler — um `enterWith` depois de um `await` ficava numa continuação e o handler perdia-o.
 */
export function enterInteractionContext(interaction: ContextInteraction): RequestContext {
    const context = createInteractionRequestContext(interaction);
    storage.enterWith(context);
    return context;
}

export function createInteractionRequestContext(interaction: ContextInteraction): RequestContext {
    const route = typeof interaction.commandName === "string"
        ? `cmd:${interaction.commandName}`
        : typeof interaction.customId === "string"
            ? interaction.customId
            : undefined;

    return {
        correlationId: randomUUID(),
        route,
        guildId: interaction.guildId ?? undefined,
        userId: interaction.user.id,
    };
}
