import { t } from "../../lib/i18n.js";
import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { errorContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getTicketById, setTicketRating } from "../../repositories/ticketRepository.js";
import {
    MAX_RATING,
    buildRatingCommentModal,
    buildRatingDoneContainer,
    buildRatingExpiredContainer,
    buildRatingThanksContainer,
    isCommentWindowOpen,
    isRatingWindowOpen,
    upsertFeedbackMessage,
} from "../../modules/tickets/rating.js";

// The rating flow runs in the owner's DMs, so there is no guild context here — everything
// is keyed off the ticket id embedded in the customId and resolved from the database.

createResponder({
    customId: "ticketrate/:score/:id",
    types: [ResponderType.Button],
    async run(interaction, { score, id }) {
        const ticket = await getTicketById(id);
        // Só quem abriu o ticket o avalia — o botão vive na DM dele, mas não se confia nisso.
        if (!ticket || ticket.owner_id !== interaction.user.id) {
            await interaction.update({ components: [errorContainer(t("Ticket não encontrado."))] });
            return;
        }
        if (!isRatingWindowOpen(ticket)) {
            await interaction.update({ components: [buildRatingExpiredContainer()] });
            return;
        }

        const value = Math.max(1, Math.min(MAX_RATING, Number.parseInt(score, 10) || 0));
        const now = new Date().toISOString();
        await setTicketRating(id, { rating: value, rated_at: ticket.rated_at ?? now });

        const config = await ensureGuildConfig(ticket.guild_id);
        const updated = { ...ticket, rating: value, rated_at: ticket.rated_at ?? now };
        await interaction.update({ components: [buildRatingThanksContainer(value, id, true)] });
        await upsertFeedbackMessage(interaction.client, updated, config, value, ticket.rating_comment);
    },
});

createResponder({
    customId: "ticketratecomment/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const ticket = await getTicketById(id);
        if (!ticket || ticket.owner_id !== interaction.user.id || ticket.rating == null) {
            await interaction.update({ components: [errorContainer(t("Avalia primeiro o atendimento."))] });
            return;
        }
        if (!isCommentWindowOpen(ticket)) {
            await interaction.update({ components: [buildRatingDoneContainer(ticket.rating, ticket.rating_comment)] });
            return;
        }
        await interaction.showModal(buildRatingCommentModal(id, ticket.rating_comment));
    },
});

createResponder({
    customId: "ticketratecomment/submit/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { id }) {
        const ticket = await getTicketById(id);
        if (!ticket || ticket.owner_id !== interaction.user.id) return;

        const comment = interaction.fields.getTextInputValue("comment").trim() || null;
        await setTicketRating(id, { rating_comment: comment });

        const config = await ensureGuildConfig(ticket.guild_id);
        const score = ticket.rating ?? 0;
        const doneContainer = buildRatingDoneContainer(score, comment);

        if (interaction.isFromMessage()) {
            await interaction.update({ components: [doneContainer] });
        } else {
            await interaction.reply({ components: [doneContainer], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        await upsertFeedbackMessage(interaction.client, { ...ticket, rating_comment: comment }, config, score, comment);
    },
});
