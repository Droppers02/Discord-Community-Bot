import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { getEmbedColor } from "../../lib/branding.js";
import { buildContainer, errorContainer, successContainer } from "../../lib/containers.js";
import { hasStaffAccess, replyContainer } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { getTicketByChannel } from "../../repositories/ticketRepository.js";
import { loadTicketContext } from "../../modules/tickets/interactionHelpers.js";
import { clearCloseRequestState } from "../../modules/tickets/closeRequestManager.js";
import { closeTicket } from "../../modules/tickets/ticketManager.js";
import { syncTicketOverviewMessage } from "../../modules/tickets/ticketOverview.js";
import { t } from "../../lib/i18n.js";

createResponder({
    customId: "ticket/requestclose-accept/:id",
    types: [ResponderType.Button],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        const ticket = await getTicketByChannel(context.channelId);
        if (!ticket) {
            await replyContainer(interaction, errorContainer(t("Ticket não encontrado.")));
            return;
        }

        const isOwner = interaction.user.id === ticket.owner_id;
        if (!isOwner && !hasStaffAccess(context.member, context.config.staff_role, context.config.admin_role)) {
            await replyContainer(interaction, errorContainer(t("Apenas o dono do ticket pode aceitar este fecho.")));
            return;
        }

        await clearCloseRequestState(context.channelId);
        await interaction.update({ components: [successContainer(t("Pedido aceite. O ticket vai ser encerrado."))] });
        await closeTicket(context.channel, context.member, context.config);
    },
});

createResponder({
    customId: "ticket/requestclose-decline/:id",
    types: [ResponderType.Button],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        const ticket = await getTicketByChannel(context.channelId);
        if (!ticket) {
            await replyContainer(interaction, errorContainer(t("Ticket não encontrado.")));
            return;
        }

        const isOwner = interaction.user.id === ticket.owner_id;
        if (!isOwner && !hasStaffAccess(context.member, context.config.staff_role, context.config.admin_role)) {
            await replyContainer(interaction, errorContainer(t("Apenas o dono do ticket pode recusar este fecho.")));
            return;
        }

        await clearCloseRequestState(context.channelId);
        await syncTicketOverviewMessage(context.channel, context.config);
        await interaction.update({
            components: [buildContainer({ color: getEmbedColor(context.config), title: `${emoji.decline} ${t("Fecho recusado")}`, description: `${interaction.user} ${t("decidiu manter o ticket aberto.")}` })],
        });
    },
});
