import { createEvent } from "#base";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { humanizeDuration, timestamp } from "../../lib/time.js";
import { recordMessageActivity } from "../../repositories/activityRepository.js";
import { bumpAfkMentions, clearAfk, getAfk } from "../../repositories/utilityRepository.js";

// AFK (quem volta a escrever sai do AFK; quem menciona alguém AFK recebe o aviso) e a contagem
// diária de mensagens para o /atividade.

const recentNotices = new Map<string, number>();
const NOTICE_COOLDOWN_MS = 5 * 60_000;

createEvent({
    name: "AFK e atividade",
    event: "messageCreate",
    async run(message) {
        if (!message.inGuild() || message.author.bot || message.webhookId) return;
        recordMessageActivity(message.guildId, message.author.id);

        const back = await clearAfk(message.guildId, message.author.id);
        if (back) {
            const member = message.member;
            if (member?.manageable && member.nickname?.startsWith("[AFK] ")) {
                await member.setNickname(member.nickname.slice(6) || null, t("Saiu do AFK")).catch(() => null);
            }
            const notice = await message.reply({
                components: [buildContainer({ color: COLORS.success, description: t("👋 Bem-vindo de volta, {user}! Estiveste AFK {time}{mentions}.", {
                    user: `<@${message.author.id}>`,
                    time: humanizeDuration(Date.now() - back.since),
                    mentions: back.mentions ? t(" e foste mencionado {count, plural, one {# vez} other {# vezes}}", { count: back.mentions }) : "",
                }) })],
                flags: CV2_FLAG,
                allowedMentions: { parse: [] },
            }).catch(() => null);
            if (notice) setTimeout(() => void notice.delete().catch(() => null), 10_000).unref?.();
        }

        const mentioned = [...message.mentions.users.keys()].filter((id) => id !== message.author.id);
        if (!mentioned.length) return;
        const afk = await getAfk(message.guildId, mentioned);
        if (!afk.length) return;
        await bumpAfkMentions(message.guildId, afk.map((entry) => entry.user_id));
        const now = Date.now();
        const fresh = afk.filter((entry) => {
            const key = `${message.channelId}:${entry.user_id}`;
            if ((recentNotices.get(key) ?? 0) > now) return false;
            recentNotices.set(key, now + NOTICE_COOLDOWN_MS);
            return true;
        });
        if (!fresh.length) return;
        await message.reply({
            components: [buildContainer({
                color: COLORS.neutral,
                description: fresh.map((entry) => `💤 ${t("{user} está AFK desde {at}: {reason}", { user: `<@${entry.user_id}>`, at: timestamp(entry.since, "R"), reason: entry.reason })}`).join("\n"),
            })],
            flags: CV2_FLAG,
            allowedMentions: { parse: [] },
        }).catch(() => null);
    },
});
