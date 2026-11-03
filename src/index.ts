import "./lib/secureConsole.js";
import "./lib/modalLabels.js";
import { env } from "#env";
import { bootstrap } from "@constatic/base";
import { GatewayIntentBits, Options, Partials } from "discord.js";
import { initDatabase } from "#database";
import { hydrateGuildConfigCache } from "./repositories/guildConfigRepository.js";

await bootstrap({
    meta: import.meta,
    env,
    // Nenhuma mensagem do bot pinga @everyone/@here a não ser que o peça explicitamente
    // (os sorteios definem as suas próprias allowedMentions).
    allowedMentions: { parse: ["users", "roles"], repliedUser: true },
    // Intents explícitos. GuildMembers + MessageContent são privilegiados e têm de estar
    // ligados no Discord Developer Portal; GuildVoiceStates serve as salas de voz temporárias
    // e o XP de voz; GuildInvites o rastreio de convites; GuildModeration os logs de banimentos.
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
    // Memória estável em uptimes longos: 100 mensagens por canal, varridas ao fim de 24h
    // (o log de mensagens apagadas/editadas só vê mensagens em cache).
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 100,
        GuildMessageManager: 100,
        PresenceManager: 0,
    }),
    sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: { interval: 3600, lifetime: 86_400 },
        users: { interval: 3600, filter: () => (user) => user.id !== user.client.user.id },
    },
    async beforeLoad() {
        await initDatabase();
        await hydrateGuildConfigCache();
    },
});
