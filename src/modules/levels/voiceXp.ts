import { ChannelType, type Client, type VoiceBasedChannel } from "discord.js";
import { recordVoicePairs } from "../wrapped/wrappedTracker.js";
import { isAllowedGuild, ourGuilds } from "../../config.js";
import { logger } from "../../lib/logger.js";
import { addVoiceTime } from "../../repositories/levelRepository.js";
import { recordVoiceActivity } from "../../repositories/activityRepository.js";
import { handleVoiceMinute, isIgnored } from "./levelService.js";
import { rollXp } from "./levelMath.js";
import { getLevelsSettings } from "./levelSettings.js";

// Tempo em voz: de minuto a minuto, quem está num canal de voz com pelo menos mais uma pessoa
// (sem contar bots), sem estar ensurdecido e fora do canal AFK, ganha um minuto no ranking de
// voz — e XP, se os níveis estiverem ligados. Ficar sozinho num canal não conta.

const TICK_MS = 60_000;
let timer: NodeJS.Timeout | null = null;

function eligibleMembers(channel: VoiceBasedChannel) {
    const humans = channel.members.filter((member) => !member.user.bot);
    if (humans.size < 2) return [];
    return [...humans.values()].filter((member) => !member.voice.selfDeaf && !member.voice.serverDeaf);
}

async function tick(client: Client<true>): Promise<void> {
    for (const guild of ourGuilds(client)) {
        if (!isAllowedGuild(guild.id)) continue;
        const settings = await getLevelsSettings(guild.id);
        const giveXp = settings.enabled && settings.voice_xp_per_minute > 0;
        const channels = guild.channels.cache.filter((channel): channel is VoiceBasedChannel =>
            (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) && channel.id !== guild.afkChannelId);
        for (const channel of channels.values()) {
            const eligible = eligibleMembers(channel);
            recordVoicePairs(guild.id, eligible.map((member) => member.id), 60);
            for (const member of eligible) {
                const ignored = isIgnored(settings, channel.id, channel.parentId, member.roles.cache.keys());
                if (!giveXp || ignored) {
                    recordVoiceActivity(guild.id, member.id, 60);
                    await addVoiceTime(guild.id, member.id, 60, 0);
                    continue;
                }
                // Os multiplicadores por cargo também valem em voz.
                const xp = rollXp({ xp_min: settings.voice_xp_per_minute, xp_max: settings.voice_xp_per_minute, multipliers: settings.multipliers }, member.roles.cache.keys());
                await handleVoiceMinute(member, channel, settings, 60, xp);
            }
        }
    }
}

export function startVoiceXpTracker(client: Client<true>): void {
    if (timer) return;
    timer = setInterval(() => void tick(client).catch((error) => logger.warn("Voz: falha a contar o tempo:", error)), TICK_MS);
    timer.unref?.();
}
