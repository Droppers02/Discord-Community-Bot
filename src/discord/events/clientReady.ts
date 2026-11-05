import { commandPayload, createEvent } from "#base";
import { isAllowedGuild, loadRuntimeConfig } from "../../config.js";
import { registerProcessLifecycle } from "../../lib/lifecycle.js";
import { logger } from "../../lib/logger.js";
import { startSocialAlertsPoller } from "../../modules/community/socialAlerts.js";
import { startStatsChannelsUpdater } from "../../modules/community/statsAndBroadcast.js";
import { startEconomyJobs } from "../../modules/economy/economyService.js";
import { restoreGiveawaySchedulers } from "../../modules/giveaways/giveawayManager.js";
import { cacheAllInvites } from "../../modules/logs/inviteTracker.js";
import { startTempRoleSweep } from "../../modules/roles/tempRoleManager.js";
import { startSlaMonitor } from "../../modules/sla/slaService.js";
import { startInactivitySweep } from "../../modules/tickets/autoCloseManager.js";
import { restoreCloseRequestSchedulers } from "../../modules/tickets/closeRequestManager.js";
import { warmTicketCache } from "../../modules/tickets/ticketManager.js";
import { startVerifyMonitor } from "../../modules/verification/verifyService.js";
import { startTempVoiceSweep, sweepOrphanTempChannels } from "../../modules/voice/tempVoiceManager.js";
import { startVoiceXpTracker } from "../../modules/levels/voiceXp.js";
import { syncApplicationEmojis } from "../../services/emojiService.js";
import { startScheduler } from "../../modules/utility/scheduler.js";
import { startSocialJobs } from "../../modules/community/socialJobs.js";
import { musicAvailable } from "../../modules/music/ytdlp.js";
import { startLockdownJobs } from "../../modules/moderation/lockdown.js";

createEvent({
    name: "Arranque: emojis, caches e tarefas de fundo",
    event: "clientReady",
    once: true,
    async run(client) {
        registerProcessLifecycle(client);
        await syncApplicationEmojis(client);

        const { mainGuildId } = loadRuntimeConfig();
        if (!client.guilds.cache.has(mainGuildId)) {
            logger.warn(`O bot não está no servidor principal (GUILD_ID=${mainGuildId}). Convida-o com o link do Developer Portal.`);
        }
        // Servidores extra (ex.: o de testes): os mesmos comandos, se o bot lá estiver.
        for (const guildId of loadRuntimeConfig().commandGuildIds) {
            if (guildId === mainGuildId) continue;
            if (!client.guilds.cache.has(guildId)) {
                logger.warn(`O bot não está no servidor extra ${guildId} — comandos não registados lá.`);
                continue;
            }
            await client.application.commands.set(commandPayload(), guildId)
                .then(() => logger.info(`Comandos registados no servidor extra ${guildId}.`))
                .catch((error) => logger.warn(`Falha a registar os comandos no servidor ${guildId}:`, error));
        }
        const foreign = client.guilds.cache.filter((guild) => !isAllowedGuild(guild.id));
        if (foreign.size) logger.warn(`O bot está em ${foreign.size} servidor(es) fora da lista — ignorados: ${[...foreign.keys()].join(", ")}`);

        const guilds = client.guilds.cache.filter((guild) => isAllowedGuild(guild.id));
        let openTickets = 0;
        for (const guild of guilds.values()) openTickets += await warmTicketCache(guild.id);
        await restoreCloseRequestSchedulers(client);
        startInactivitySweep(client);

        const restoredGiveaways = await restoreGiveawaySchedulers(client);
        if (restoredGiveaways > 0) logger.info(`${restoredGiveaways} sorteio(s) ativo(s) restaurado(s).`);
        const cachedInvites = await cacheAllInvites(client);
        if (cachedInvites > 0) logger.info(`${cachedInvites} convite(s) em cache para o rastreio de entradas.`);

        startTempRoleSweep(client);
        for (const guild of guilds.values()) void sweepOrphanTempChannels(guild).catch(() => null);
        startTempVoiceSweep(client);
        startSocialAlertsPoller(client);
        startSlaMonitor(client);
        startVerifyMonitor(client);
        startStatsChannelsUpdater(client);
        startVoiceXpTracker(client);
        startEconomyJobs(client);
        startScheduler(client);
        startSocialJobs(client);
        startLockdownJobs(client);
        musicAvailable();

        logger.info(`EPA BOTCHI pronto como ${client.user.tag} — ${openTickets} ticket(s) aberto(s) em cache.`);
    },
});
