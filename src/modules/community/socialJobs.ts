import type { Client, Guild, TextChannel } from "discord.js";
import { isAllowedGuild, ourGuilds } from "../../config.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { pruneActivity } from "../../repositories/activityRepository.js";
import { pruneDaily, startDaily } from "../../repositories/gameStatsRepository.js";
import { birthdaysOn, dueAnniversaries, markAnniversary } from "../../repositories/socialRepository.js";
import { lisbonDay } from "../economy/economyService.js";
import { getWelcomeSettings } from "./welcomeMessages.js";
import { ringOf } from "./rings.js";

// Tarefas de meia em meia hora: parabéns aos aniversariantes (às 9h de Lisboa), "mesversários"
// de casamento e limpeza de dados antigos (atividade com mais de 400 dias, termos antigos).

const TICK_MS = 30 * 60_000;
let timer: NodeJS.Timeout | null = null;

const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hourCycle: "h23" });

/** Canal para as celebrações: o das boas-vindas, senão o canal de sistema do servidor. */
async function celebrationChannel(guild: Guild): Promise<TextChannel | null> {
    const welcome = await getWelcomeSettings(guild.id);
    const channel = (welcome.welcome_channel ? guild.channels.cache.get(welcome.welcome_channel) : null) ?? guild.systemChannel;
    return channel?.isTextBased() ? (channel as TextChannel) : null;
}

async function tick(client: Client<true>): Promise<void> {
    const now = Date.now();
    const today = lisbonDay(now);
    const hour = Number(hourFormatter.format(new Date(now)));

    for (const guild of ourGuilds(client)) {
        if (!isAllowedGuild(guild.id)) continue;
        if (hour >= 9 && await startDaily(guild.id, "_", "birthday-announce", today)) {
            const dayMonth = `${today.slice(8, 10)}/${today.slice(5, 7)}`;
            const users = (await birthdaysOn(guild.id, dayMonth)).filter((id) => guild.members.cache.has(id));
            const channel = users.length ? await celebrationChannel(guild) : null;
            if (channel) {
                await channel.send({
                    components: [buildContainer({ color: COLORS.gold, title: `🎂 ${t("Parabéns!")}`, description: t("Hoje é dia de festa: {users}! 🥳🎉", { users: users.map((id) => `<@${id}>`).join(", ") }) })],
                    flags: CV2_FLAG,
                    allowedMentions: { users },
                }).catch(() => null);
            }
        }
    }

    for (const entry of await dueAnniversaries(now)) {
        const guild = client.guilds.cache.get(entry.guild_id);
        if (!guild || !isAllowedGuild(guild.id)) continue;
        const months = Math.round((now - entry.married_at) / (30.44 * 86_400_000));
        const channel = await celebrationChannel(guild);
        await markAnniversary(entry.guild_id, entry.user_a, entry.user_b, now);
        if (!channel) continue;
        const ring = ringOf(entry.ring_tier);
        await channel.send({
            components: [buildContainer({
                color: COLORS.danger,
                title: `💞 ${months % 12 === 0 ? t("Aniversário de casamento!") : t("Mesversário!")}`,
                description: months % 12 === 0
                    ? t("{a} e {b} fazem **{years, plural, one {# ano} other {# anos}}** de casados! {ring}", { a: `<@${entry.user_a}>`, b: `<@${entry.user_b}>`, years: months / 12, ring: ring.icon })
                    : t("{a} e {b} estão casados há **{months} meses**! {ring}", { a: `<@${entry.user_a}>`, b: `<@${entry.user_b}>`, months, ring: ring.icon }),
            })],
            flags: CV2_FLAG,
            allowedMentions: { users: [entry.user_a, entry.user_b] },
        }).catch(() => null);
    }

    if (hour === 4) {
        await pruneActivity(lisbonDay(now - 400 * 86_400_000)).catch(() => null);
        await pruneDaily(lisbonDay(now - 60 * 86_400_000)).catch(() => null);
    }
}

export function startSocialJobs(client: Client<true>): void {
    if (timer) return;
    const run = () => void tick(client).catch((error) => logger.warn("Tarefas sociais: falha:", error));
    timer = setInterval(run, TICK_MS);
    timer.unref?.();
    setTimeout(run, 2 * 60_000).unref?.();
}
