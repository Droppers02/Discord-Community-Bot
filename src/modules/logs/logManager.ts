import { Client, FileBuilder, TextChannel } from "discord.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { COLORS, getFooterText } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e, type EmojiName } from "../../lib/emojis.js";
import { logger } from "../../lib/logger.js";
import { takeTranscriptFile } from "../transcripts/transcriptManager.js";
import type { LogData, LogType } from "../../types.js";
import { t, tk } from "../../lib/i18n.js";

const TITLES: Record<LogType, string> = {
    TICKET_OPEN: tk("Ticket Aberto"),
    TICKET_ASSUMED: tk("Ticket Assumido"),
    TICKET_CLOSED: tk("Ticket Fechado"),
};

const COLORS_BY_TYPE: Record<LogType, number> = {
    TICKET_OPEN: COLORS.primary,
    TICKET_ASSUMED: COLORS.info,
    TICKET_CLOSED: COLORS.danger,
};

// Emoji NAMES (not resolved strings): resolving at module load would freeze the unicode
// fallbacks, because the app-emoji sync only happens later, at clientReady.
const EMOJI_BY_TYPE: Record<LogType, EmojiName> = {
    TICKET_OPEN: "open",
    TICKET_ASSUMED: "staff",
    TICKET_CLOSED: "close",
};

export async function sendLog(client: Client, guildId: string, type: LogType, data: LogData): Promise<void> {
    const config = await ensureGuildConfig(guildId);
    const title = `${e(EMOJI_BY_TYPE[type])} ${data.title ?? t(TITLES[type])}`;
    const description = data.description ?? t("Sem descrição.");

    if (!config.log_channel) {
        takeTranscriptFile(data.transcriptId);
        logger.info(`[${type}]`, description);
        return;
    }

    try {
        const channel = await client.channels.fetch(config.log_channel);
        if (!channel?.isTextBased()) {
            logger.warn(`Canal de logs inválido para guild ${guildId}`);
            return;
        }

        // O transcript do fecho segue como ficheiro HTML anexado (ver transcriptManager).
        const file = takeTranscriptFile(data.transcriptId);

        const container = buildContainer({
            color: COLORS_BY_TYPE[type],
            title,
            description,
            fields: data.fields?.map((field) => ({ name: field.name, value: field.value })),
            footerText: getFooterText(config),
        });
        if (file) container.addFileComponents(new FileBuilder().setURL(`attachment://${file.name}`));

        await (channel as TextChannel).send({ components: [container], files: file ? [file] : [], flags: CV2_FLAG });
    } catch (error) {
        logger.error(`Falha ao enviar log ${type}:`, error);
    }
}
