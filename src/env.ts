import { validateEnv } from "@constatic/base";
import { z } from "zod";
import "./constants.js";

// Nomes das variáveis do bot antigo (Python). A Railway ainda as tem com estes nomes: aceitam-se
// como alternativa, para o deploy funcionar sem mexer no painel. Os nomes novos têm prioridade.
const LEGACY_ALIASES: Record<string, string[]> = {
    BOT_TOKEN: ["DISCORD_TOKEN"],
    DATABASE_URL: ["SQL_DATABASE_URL", "NEON_DATABASE_URL"],
    GUILD_ID: ["SERVER_ID"],
    EXTRA_GUILD_IDS: ["SERVER_TESTES"],
};
for (const [name, aliases] of Object.entries(LEGACY_ALIASES)) {
    if (process.env[name]?.trim()) continue;
    const value = aliases.map((alias) => process.env[alias]?.trim()).find(Boolean);
    if (value) process.env[name] = value;
}

// Bot privado: um servidor principal (GUILD_ID) e, opcionalmente, outros onde os comandos
// também ficam registados (EXTRA_GUILD_IDS, ex. o servidor de testes).
export const env = await validateEnv(z.looseObject({
    BOT_TOKEN: z.string("O token do bot (BOT_TOKEN) é obrigatório").min(1),
    CLIENT_ID: z.string().optional(),
    DATABASE_URL: z.string("DATABASE_URL (PostgreSQL) é obrigatório").min(1),
    PGSSLMODE: z.string().optional(),
    GUILD_ID: z.string("GUILD_ID (servidor principal) é obrigatório").min(1),
    EXTRA_GUILD_IDS: z.string().optional(),
    OWNER_IDS: z.string().optional(),
    WEBHOOK_LOGS_URL: z.url().optional(),
    LOG_LEVEL: z.string().optional(),
    // Alertas sociais (opcional). Sem estas chaves, Twitch/Kick ficam desligados;
    // YouTube e TikTok não precisam de chave.
    TWITCH_CLIENT_ID: z.string().optional(),
    TWITCH_CLIENT_SECRET: z.string().optional(),
    KICK_CLIENT_ID: z.string().optional(),
    KICK_CLIENT_SECRET: z.string().optional(),
}));
