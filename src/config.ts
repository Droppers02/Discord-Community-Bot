import { env } from "#env";

export interface RuntimeConfig {
    botToken: string;
    clientId: string | undefined;
    databaseUrl: string;
    /** Servidor principal (o do grupo de amigos). */
    mainGuildId: string;
    /** Servidores onde os comandos também ficam registados (principal + extra). */
    commandGuildIds: string[];
    /** Contas com acesso total ao bot, além de quem tem Administrator. */
    ownerIds: Set<string>;
}

let configCache: RuntimeConfig | null = null;

function idList(raw: string | undefined): string[] {
    return (raw ?? "")
        .split(/[\s,;]+/)
        .map((value) => value.trim())
        .filter((value) => /^\d{15,25}$/.test(value));
}

export function loadRuntimeConfig(): RuntimeConfig {
    if (configCache) return configCache;
    const mainGuildId = env.GUILD_ID.trim();
    configCache = {
        botToken: env.BOT_TOKEN,
        clientId: env.CLIENT_ID,
        databaseUrl: env.DATABASE_URL,
        mainGuildId,
        commandGuildIds: [...new Set([mainGuildId, ...idList(env.EXTRA_GUILD_IDS)])],
        ownerIds: new Set(idList(env.OWNER_IDS)),
    };
    return configCache;
}

export function isOwner(userId: string): boolean {
    return loadRuntimeConfig().ownerIds.has(userId);
}

/** O bot só trabalha nos servidores configurados (é privado). */
export function isAllowedGuild(guildId: string | null | undefined): boolean {
    if (!guildId) return false;
    return loadRuntimeConfig().commandGuildIds.includes(guildId);
}
