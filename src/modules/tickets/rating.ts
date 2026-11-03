import { ButtonBuilder, ButtonStyle, ModalBuilder, TextInputStyle, type Client, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG, safeFireAndForget } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { buildTextInputModal } from "../../lib/modals.js";
import { getFooterText } from "../../lib/branding.js";
import { setTicketFeedbackMessage } from "../../repositories/ticketRepository.js";
import type { GuildConfig, TicketRecord } from "../../types.js";
import { getCategoryLabel } from "./categories.js";
import { t } from "../../lib/i18n.js";

export const MAX_RATING = 5;

// Time windows: the rating itself can be given for 7 days after the ticket closes; once
// rated, the owner has 48h to add (or change) a comment. After that the buttons no-op.
export const RATING_WINDOW_MS = 7 * 86_400_000;
export const COMMENT_WINDOW_MS = 48 * 3_600_000;

export function isRatingWindowOpen(ticket: Pick<TicketRecord, "closed_at">): boolean {
    if (!ticket.closed_at) return true;
    const closed = Date.parse(ticket.closed_at);
    return Number.isNaN(closed) || Date.now() - closed <= RATING_WINDOW_MS;
}

export function isCommentWindowOpen(ticket: Pick<TicketRecord, "rated_at">): boolean {
    if (!ticket.rated_at) return false;
    const rated = Date.parse(ticket.rated_at);
    return !Number.isNaN(rated) && Date.now() - rated <= COMMENT_WINDOW_MS;
}

function stars(score: number): string {
    return `${emoji.star.repeat(Math.max(0, Math.min(MAX_RATING, score)))} **${score}/${MAX_RATING}**`;
}

function buildFeedbackContainer(ticket: TicketRecord, config: GuildConfig, score: number, comment: string | null): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.gold,
        title: `${emoji.star} ${t("Nova avaliação de atendimento")}`,
        fields: [
            { name: t("Avaliação"), value: stars(score) },
            { name: t("Categoria"), value: getCategoryLabel(config, ticket.category) },
            { name: t("Utilizador"), value: `<@${ticket.owner_id}> (\`${ticket.owner_tag}\`)` },
            { name: t("Responsável"), value: ticket.staff_id ? `<@${ticket.staff_id}>` : t("*Sem responsável*") },
            { name: t("Comentário"), value: comment?.slice(0, 1024) || t("*Sem comentário*") },
        ],
        footerText: t("Ticket {id}", { id: ticket.id }),
    });
}

/**
 * Publish (or update) the satisfaction result in the configured feedback channel. The
 * first call sends the message and remembers its id; later calls (e.g. when the owner
 * adds a comment) EDIT that same message instead of posting a second one.
 */
export async function upsertFeedbackMessage(client: Client, ticket: TicketRecord, config: GuildConfig, score: number, comment: string | null): Promise<void> {
    if (!config.feedback_channel) return;
    const channel = await client.channels.fetch(config.feedback_channel).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) return;

    const payload = { components: [buildFeedbackContainer(ticket, config, score, comment)], flags: CV2_FLAG, allowedMentions: { parse: [] } };

    if (ticket.feedback_message_id) {
        const edited = await (channel as TextChannel).messages.edit(ticket.feedback_message_id, payload).catch(() => null);
        if (edited) return; // updated the existing card — no duplicate message
    }
    const message = await (channel as TextChannel).send(payload).catch(() => null);
    if (message) await setTicketFeedbackMessage(ticket.id, message.id).catch(() => null);
}

/** DM card sent to the ticket owner after closing, asking for a 1–5 rating. */
export function buildRatingPromptContainer(ticketId: string, serverName: string): ContainerPlusBuilder {
    const buttons = [1, 2, 3, 4, 5].map((value) =>
        new ButtonBuilder()
            .setCustomId(buildCustomId("ticketrate", value, ticketId))
            .setLabel(String(value))
            .setEmoji(emoji.star)
            .setStyle(ButtonStyle.Secondary),
    );
    return buildContainer({
        color: COLORS.gold,
        title: `${emoji.star} ${t("Como correu o teu atendimento?")}`,
        description: t("O teu ticket em **{server}** foi encerrado. Avalia de **1** a **5** estrelas.\n-# Podes avaliar durante 7 dias.", { server: serverName }),
        rows: [row(...buttons)],
    });
}

/** After rating: thanks + (optionally) a button to add a comment within the 48h window. */
export function buildRatingThanksContainer(score: number, ticketId: string, allowComment = true): ContainerPlusBuilder {
    const rows = allowComment
        ? [row(new ButtonBuilder().setCustomId(buildCustomId("ticketratecomment", ticketId)).setLabel(t("Deixar comentário")).setEmoji(emoji.note).setStyle(ButtonStyle.Primary))]
        : [];
    return buildContainer({
        color: COLORS.success,
        title: `${emoji.success} ${t("Obrigado pela avaliação!")}`,
        description: allowComment
            ? t("Registámos **{score}/{max}** {star}. Queres deixar um comentário? Tens **48h**.", { score, max: MAX_RATING, star: emoji.star })
            : t("Registámos **{score}/{max}** {star}.", { score, max: MAX_RATING, star: emoji.star }),
        rows,
    });
}

/** Final state once a comment is saved (or the comment window closed): no buttons. */
export function buildRatingDoneContainer(score: number, comment: string | null): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.success,
        title: `${emoji.success} ${t("Obrigado pelo feedback!")}`,
        description: t("Avaliação: {stars}", { stars: stars(score) }),
        fields: comment ? [{ name: t("O teu comentário"), value: comment.slice(0, 1024) }] : [],
    });
}

/** Shown when someone clicks a stale rating prompt after the 7-day window. */
export function buildRatingExpiredContainer(): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.neutral,
        title: `${emoji.clock} ${t("Período de avaliação terminado")}`,
        description: t("Já não é possível avaliar este atendimento (o prazo de 7 dias terminou). Obrigado!"),
    });
}

/** Modal for the optional free-text comment attached to a rating. */
export function buildRatingCommentModal(ticketId: string, current: string | null): ModalBuilder {
    return buildTextInputModal(buildCustomId("ticketratecomment", "submit", ticketId), t("Comentário sobre o atendimento"), [
        { customId: "comment", label: t("O teu comentário (opcional)"), style: TextInputStyle.Paragraph, required: false, value: current?.slice(0, 1000) ?? "", maxLength: 1000, placeholder: t("Conta-nos como correu o atendimento.") },
    ]);
}

/** Send the rating prompt DM to the owner if ratings are enabled. Tolerant of closed DMs. */
export async function maybeSendRatingPrompt(client: Client, ticket: TicketRecord, config: GuildConfig): Promise<void> {
    if (!config.ticket_rating_enabled) return;
    const serverName = getFooterText(config);
    safeFireAndForget(
        client.users.fetch(ticket.owner_id).then((user) => user.send({
            components: [buildRatingPromptContainer(ticket.id, serverName)],
            flags: CV2_FLAG,
        })),
    );
}
