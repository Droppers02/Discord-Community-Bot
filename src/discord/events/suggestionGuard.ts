import { createEvent } from "#base";
import { type TextChannel } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG, safeFireAndForget } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { getSuggestionSettings } from "../../modules/suggestions/suggestionSettings.js";
import { t } from "../../lib/i18n.js";

/** Só usado quando o membro tem as DMs fechadas — e mesmo aí o aviso sai da sala em 6s. */
const FALLBACK_LIFETIME_MS = 6_000;

// O canal de sugestões é só para sugestões (criadas por /sugerir e publicadas pelo bot).
// Tudo o resto que lá apareça — texto, imagens, links e mensagens de outros bots — é
// removido. A discussão acontece nas threads de cada sugestão (que têm channelId próprio,
// por isso nunca são afetadas aqui).
createEvent({
    name: "Suggestions channel guard",
    event: "messageCreate",
    async run(message) {
        if (!message.inGuild()) return;

        const settings = await getSuggestionSettings(message.guildId);
        if (!settings.channel || message.channelId !== settings.channel) return;

        // As sugestões publicadas pelo bot ficam.
        if (message.author.id === message.client.user.id) return;

        safeFireAndForget(message.delete());

        // Outros bots não levam sermão — a mensagem deles é apagada e fica por aí.
        if (message.author.bot) return;

        const container = buildContainer({
            color: COLORS.warning,
            title: `${emoji.megaphone} ${t("Sala de sugestões")}`,
            description: t("Esta sala é **apenas para sugestões** — não podes escrever lá diretamente.\n\n• Para **criar uma sugestão** usa o comando **/sugerir**.\n• Para **comentar/opinar**, usa a **thread** de cada sugestão."),
        });

        // Mensagens verdadeiramente efémeras só existem em interações (slash/botões). Num
        // evento de mensagem, o mais próximo disso é avisar por DM: o aviso chega só a quem
        // escreveu e não deixa rasto na sala. Se o membro tiver as DMs fechadas, cai-se no
        // aviso na própria sala, que se apaga sozinho.
        const dm = await message.author.send({ components: [container], flags: CV2_FLAG }).catch(() => null);
        if (dm) return;

        const channel = message.channel as TextChannel;
        const notice = await channel.send({
            components: [container],
            flags: CV2_FLAG,
            allowedMentions: { users: [message.author.id] },
        }).catch(() => null);
        if (notice) setTimeout(() => safeFireAndForget(notice.delete()), FALLBACK_LIFETIME_MS);
    },
});
