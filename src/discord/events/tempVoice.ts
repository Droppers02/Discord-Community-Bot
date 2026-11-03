import { createEvent } from "#base";
import { logger } from "../../lib/logger.js";
import { getVoiceSettings } from "../../modules/voice/voiceSettings.js";
import { cleanupIfEmpty, createHubTempChannel } from "../../modules/voice/tempVoiceManager.js";
import { isAllowedGuild } from "../../config.js";

// Join-to-create + limpeza de salas vazias. Um único listener cobre os dois lados
// da transição de voz (entrada no hub e saída de uma sala temporária).

createEvent({
    name: "Temp voice: hub join-to-create e limpeza",
    event: "voiceStateUpdate",
    async run(oldState, newState) {
        try {
            const guild = newState.guild;

            // Saiu de (ou mudou de) uma sala temporária → apagar se ficou vazia.
            if (oldState.channel && oldState.channelId !== newState.channelId) {
                await cleanupIfEmpty(oldState.channel);
            }

            // Entrou no hub → criar sala pessoal.
            if (!newState.channel || !newState.member || newState.member.user.bot) return;
            if (!isAllowedGuild(guild.id)) return;

            const settings = await getVoiceSettings(guild.id);
            if (!settings.hub_channel || newState.channelId !== settings.hub_channel) return;

            await createHubTempChannel(newState.member, newState.channel);
        } catch (error) {
            logger.warn("Temp voice: falha no voiceStateUpdate:", error);
        }
    },
});
