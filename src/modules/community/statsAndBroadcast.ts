import { t, tk } from "../../lib/i18n.js";
import { ChannelType, type Client, type Guild } from "discord.js";
import { getBroadcastSettings, getStatsSettings, saveStatsSettings } from "./communitySettings.js";
import { isAllowedGuild, ourGuilds } from "../../config.js";
import { PermissionFlagsBits } from "discord.js";
import type { StatKey } from "../../types.js";

// ─── Canais de estatísticas ───────────────────────────────────────────────────
// Renomeia canais (normalmente de voz, trancados) com contadores. Atualização a cada
// 10 min — dentro do rate limit do Discord (2 renomes/10min por canal).

const STATS_INTERVAL_MS = 10 * 60_000;

export const STAT_LABELS: Record<StatKey, string> = {
    members: tk("Membros"), humans: tk("Humanos"), bots: tk("Bots"), channels: tk("Canais"), roles: tk("Cargos"), boosts: tk("Boosts"),
};

export const STAT_DEFAULT_TEMPLATES: Record<StatKey, string> = {
    members: tk("👥 Membros: {value}"),
    humans: tk("🙋 Humanos: {value}"),
    bots: tk("🤖 Bots: {value}"),
    channels: tk("💬 Canais: {value}"),
    roles: tk("🏷️ Cargos: {value}"),
    boosts: tk("🚀 Boosts: {value}"),
};

/**
 * Contagens de membros SEM contar bots.
 *
 * `guild.memberCount` inclui os bots, e contá-los pela cache dava números errados quando a
 * cache estava incompleta (o bot arranca sem todos os membros carregados). Por isso, se a
 * cache não estiver completa, buscamos os membros — só assim a contagem de bots é fiável.
 * Depois disso o intent GuildMembers mantém a cache atualizada sozinho.
 */
export async function memberCounts(guild: Guild): Promise<{ humans: number; bots: number; total: number }> {
    const total = guild.memberCount ?? 0;
    if (guild.members.cache.size < total) {
        await guild.members.fetch().catch(() => null);
    }
    const bots = guild.members.cache.filter((member) => member.user.bot).size;
    // Se a cache continuar incompleta (fetch falhado), não inventamos: o pior caso é
    // mostrar o total, nunca um número negativo.
    const humans = Math.max(0, total - bots);
    return { humans, bots, total };
}

export function statValue(key: StatKey, guild: Guild, counts: { humans: number; bots: number }): number {
    switch (key) {
        // "Membros" conta pessoas — os bots têm o seu próprio contador.
        case "members": return counts.humans;
        case "humans": return counts.humans;
        case "bots": return counts.bots;
        case "channels": return guild.channels.cache.size;
        case "roles": return guild.roles.cache.size;
        case "boosts": return guild.premiumSubscriptionCount ?? 0;
    }
}

/** Cria (se preciso) e renomeia os canais de stats dentro da categoria configurada. */
async function updateGuildStats(guild: Guild): Promise<void> {
    if (!isAllowedGuild(guild.id)) return;
    const settings = await getStatsSettings(guild.id);
    if (!settings.category_id || settings.stats.length === 0) return;
    const category = guild.channels.cache.get(settings.category_id);
    if (!category || category.type !== ChannelType.GuildCategory) return;

    const counts = await memberCounts(guild);

    let changed = false;
    const stats = [...settings.stats];
    for (let i = 0; i < stats.length; i++) {
        const entry = stats[i];
        const name = entry.template.replaceAll("{value}", String(statValue(entry.key, guild, counts))).slice(0, 100);
        let channel = entry.channel_id ? guild.channels.cache.get(entry.channel_id) : undefined;
        if (!channel) {
            channel = await guild.channels.create({
                name,
                type: ChannelType.GuildVoice,
                parent: settings.category_id,
                permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }],
                reason: t("Canal de estatísticas"),
            }).catch(() => undefined);
            if (!channel) continue;
            stats[i] = { ...entry, channel_id: channel.id };
            changed = true;
            continue; // acabou de nascer com o nome certo
        }
        if (channel.name !== name) await channel.setName(name, t("Contador de estatísticas")).catch(() => null);
    }
    if (changed) await saveStatsSettings(guild.id, { stats });
}

export function startStatsChannelsUpdater(client: Client<true>): void {
    const tick = async () => {
        for (const guild of ourGuilds(client)) await updateGuildStats(guild).catch(() => null);
    };
    const timer = setInterval(() => void tick(), STATS_INTERVAL_MS);
    timer.unref?.();
    setTimeout(() => void tick(), 30_000).unref?.();
}

// ─── Auto-publish ────────────────────────────────────────────────────────────
export async function maybeAutoPublish(guildId: string, channelId: string, crosspost: () => Promise<unknown>, channelType: ChannelType): Promise<void> {
    if (channelType !== ChannelType.GuildAnnouncement) return;
    if (!isAllowedGuild(guildId)) return;
    const settings = await getBroadcastSettings(guildId);
    if (!settings.autopublish_channels.includes(channelId)) return;
    await crosspost().catch(() => null);
}
