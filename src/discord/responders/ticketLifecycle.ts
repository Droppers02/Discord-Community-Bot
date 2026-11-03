import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { getEmbedColor, COLORS } from "../../lib/branding.js";
import { buildContainer, errorContainer, row, successContainer } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { getTicketByChannel } from "../../repositories/ticketRepository.js";
import { ensureStaff, loadTicketContext } from "../../modules/tickets/interactionHelpers.js";
import { assumeTicket, closeTicket } from "../../modules/tickets/ticketManager.js";
import { buildStaffControlsContainer } from "../../modules/tickets/staffPanelUi.js";
import { t } from "../../lib/i18n.js";

createResponder({
    customId: "ticket/assume/:id",
    types: [ResponderType.Button],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        if (!(await ensureStaff(interaction, context))) return;

        try {
            await assumeTicket(context.channel, context.member, context.config);
            await replyContainer(interaction, successContainer(t("Ticket assumido com sucesso.")));
        } catch (error) {
            await replyContainer(interaction, errorContainer(error instanceof Error ? error.message : t("Não foi possível assumir o ticket.")));
        }
    },
});

createResponder({
    customId: "ticket/staffpanel/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        if (!(await ensureStaff(interaction, context))) return;

        const ticket = await getTicketByChannel(context.channelId);
        if (!ticket || ticket.id !== id) {
            await replyContainer(interaction, errorContainer(t("Ticket não encontrado.")));
            return;
        }

        await replyContainer(interaction, buildStaffControlsContainer(ticket, context.config));
    },
});

createResponder({
    customId: "ticket/close/:id",
    types: [ResponderType.Button],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        if (!(await ensureStaff(interaction, context))) return;

        const ticket = await getTicketByChannel(context.channelId);
        if (!ticket || ticket.status === "closed") {
            await replyContainer(interaction, errorContainer(t("Este ticket já se encontra fechado.")));
            return;
        }

        await replyContainer(interaction, buildContainer({
            color: getEmbedColor(context.config),
            title: `${emoji.warn} ${t("Confirmar fecho")}`,
            description: t("Tens a certeza que pretendes fechar este ticket?"),
            rows: [row(
                new ButtonBuilder().setCustomId(buildCustomId("ticket", "closeconfirm", ticket.id)).setLabel(t("Confirmar")).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(buildCustomId("ticket", "closecancel", ticket.id)).setLabel(t("Cancelar")).setStyle(ButtonStyle.Secondary),
            )],
        }));
    },
});

createResponder({
    customId: "ticket/closecancel/:id",
    types: [ResponderType.Button],
    async run(interaction) {
        await interaction.update({ components: [successContainer(t("Fecho cancelado."))] });
    },
});

createResponder({
    customId: "ticket/closeconfirm/:id",
    types: [ResponderType.Button],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        if (!(await ensureStaff(interaction, context))) return;

        await interaction.update({ components: [buildContainer({ color: COLORS.danger, title: `${emoji.close} ${t("A fechar ticket...")}`, description: t("O ticket vai ser encerrado e o transcript guardado.") })] });
        try {
            await closeTicket(context.channel, context.member, context.config);
        } catch (error) {
            await interaction.followUp({ components: [errorContainer(error instanceof Error ? error.message : t("Não foi possível fechar o ticket."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
    },
});
