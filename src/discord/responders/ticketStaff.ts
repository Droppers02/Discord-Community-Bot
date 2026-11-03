import { t } from "../../lib/i18n.js";
import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { getEmbedColor } from "../../lib/branding.js";
import { buildContainer, errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { getTicketByChannel, updateTicketByChannel } from "../../repositories/ticketRepository.js";
import { ensureStaff, loadTicketContext, type TicketContext } from "../../modules/tickets/interactionHelpers.js";
import { getCategoryChannelId, getCategoryLabel, sanitizeChannelName } from "../../modules/tickets/categories.js";
import { syncTicketOverviewMessage } from "../../modules/tickets/ticketOverview.js";
import { ticketChannelNameFor } from "../../modules/tickets/ticketManager.js";
import { requestTicketClosure } from "../../modules/tickets/closeRequestManager.js";
import {
    addTicketMember,
    fetchTargetMember,
    removeTicketMember,
} from "../../modules/tickets/memberManage.js";
import {
    buildAssignUserSelect,
    buildMemberManageActionSelector,
    buildMemberManageManualButton,
    buildMemberManageModal,
    buildMemberManageUserSelector,
    buildMoveCategorySelect,
    buildNoteModal,
    buildPlayerModal,
    buildRenameModal,
    buildRequestCloseModal,
    isMemberManageAction,
} from "../../modules/tickets/staffPanelUi.js";
import { isTicketPriority, priorityLabel } from "../../modules/tickets/priorities.js";
import { findMacro } from "../../modules/tickets/macros.js";
import { appendAuditLog } from "../../services/auditService.js";
import type { TicketCategory } from "../../types.js";

async function requireTicket(interaction: import("discord.js").RepliableInteraction, ticketId: string) {
    const context = await loadTicketContext(interaction);
    if (!context) return null;
    if (!(await ensureStaff(interaction, context))) return null;
    const ticket = await getTicketByChannel(context.channelId);
    if (!ticket || ticket.id !== ticketId) {
        await replyContainer(interaction, errorContainer(t("Ticket não encontrado.")));
        return null;
    }
    return { context, ticket };
}

function infoContainer(context: TicketContext, title: string, description: string) {
    return buildContainer({ color: getEmbedColor(context.config), title, description });
}

// ─── Rename ──────────────────────────────────────────────────────────────────
createResponder({
    customId: "ticket/rename/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        await interaction.showModal(buildRenameModal(id, found.context.channel.name));
    },
});

createResponder({
    customId: "ticket/rename-modal/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        if (!(await ensureStaff(interaction, context))) return;

        const newName = sanitizeChannelName(interaction.fields.getTextInputValue("name"));
        await context.channel.setName(newName);
        appendAuditLog({ guildId: context.channelId ? interaction.guildId : null, actorId: interaction.user.id, action: "ticket.rename", details: { channelId: context.channelId, name: newName } });
        await replyContainer(interaction, successContainer(t("Canal renomeado para `{name}`.", { name: newName })));
    },
});

// ─── Move category ───────────────────────────────────────────────────────────
createResponder({
    customId: "ticket/move/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        await interaction.reply({
            components: [infoContainer(found.context, `${emoji.move} ${t("Mover ticket")}`, t("Escolhe a nova categoria.")), buildMoveCategorySelect(id, found.context.config)] as never,
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});

createResponder({
    customId: "ticket/move-select/:id",
    types: [ResponderType.StringSelect],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        const { context, ticket } = found;
        const category = interaction.values[0] as TicketCategory;
        await context.channel.setParent(getCategoryChannelId(context.config, category) ?? null, { lockPermissions: false });
        // Volta a dar o nome no formato configurado, com a nova categoria. Antes cortava-se o
        // nome no primeiro hífen, o que estragava categorias com hífen no nome.
        const username = await interaction.client.users.fetch(ticket.owner_id).then((user) => user.username).catch(() => ticket.owner_tag.split("#")[0]);
        await context.channel.setName(await ticketChannelNameFor(context.channel.guild, context.config, category, ticket.ticket_number, ticket.owner_id, username, context.channelId));
        await updateTicketByChannel(context.channelId, { category });
        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "ticket.move", details: { ticketId: id, category } });
        await syncTicketOverviewMessage(context.channel, context.config);
        await interaction.update({ components: [successContainer(t("Ticket movido para **{category}**.", { category: getCategoryLabel(context.config, category) }))] });
    },
});

// ─── Reassign staff ──────────────────────────────────────────────────────────
createResponder({
    customId: "ticket/assign/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        await interaction.reply({
            components: [infoContainer(found.context, `${emoji.user} ${t("Reatribuir staff")}`, t("Escolhe o membro de staff.")), buildAssignUserSelect(id)] as never,
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});

createResponder({
    customId: "ticket/assign-select/:id",
    types: [ResponderType.UserSelect],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        const { context } = found;
        const staff = await context.channel.guild.members.fetch(interaction.values[0]);
        await updateTicketByChannel(context.channelId, { staff_id: staff.id, staff_tag: staff.user.tag });
        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "ticket.reassign", details: { ticketId: id, staffId: staff.id } });
        await syncTicketOverviewMessage(context.channel, context.config);
        await interaction.update({ components: [successContainer(t("Staff reatribuído para {staff}.", { staff: String(staff) }))] });
    },
});

// ─── Internal note ───────────────────────────────────────────────────────────
createResponder({
    customId: "ticket/note/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        await interaction.showModal(buildNoteModal(id, found.ticket.internal_note ?? ""));
    },
});

createResponder({
    customId: "ticket/note-modal/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        if (!(await ensureStaff(interaction, context))) return;
        const note = interaction.fields.getTextInputValue("note").trim() || null;
        await updateTicketByChannel(context.channelId, { internal_note: note });
        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "ticket.note", details: { channelId: context.channelId } });
        await replyContainer(interaction, successContainer(t("Nota interna atualizada com sucesso.")));
    },
});

// ─── External reference ──────────────────────────────────────────────────────
createResponder({
    customId: "ticket/player/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        await interaction.showModal(buildPlayerModal(id, found.ticket.player_identifier ?? ""));
    },
});

createResponder({
    customId: "ticket/player-modal/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        if (!(await ensureStaff(interaction, context))) return;
        const player = interaction.fields.getTextInputValue("player").trim() || null;
        await updateTicketByChannel(context.channelId, { player_identifier: player });
        await replyContainer(interaction, successContainer(t("Referência atualizada.")));
    },
});

// ─── Member management ───────────────────────────────────────────────────────
createResponder({
    customId: "ticket/membermanage/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        await interaction.reply({
            components: [infoContainer(found.context, `${emoji.users} ${t("Gerir membros")}`, t("Escolhe primeiro a ação que queres executar neste ticket.")), buildMemberManageActionSelector(id)] as never,
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});

createResponder({
    customId: "ticket/mm-action/:id",
    types: [ResponderType.StringSelect],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        const action = interaction.values[0];
        if (!isMemberManageAction(action)) {
            await interaction.update({ components: [errorContainer(t("Ação inválida para gestão de membros."))] });
            return;
        }
        await interaction.update({
            components: [
                infoContainer(found.context, action === "add" ? `${emoji.add} ${t("Adicionar membro")}` : `${emoji.remove} ${t("Remover membro")}`, t("Seleciona o utilizador no dropdown ou escreve manualmente o ID/menção.")),
                buildMemberManageUserSelector(id, action),
                buildMemberManageManualButton(id, action),
            ] as never,
        });
    },
});

createResponder({
    customId: "ticket/mm-select/:action/:id",
    types: [ResponderType.UserSelect],
    async run(interaction, { action, id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        if (!isMemberManageAction(action)) {
            await interaction.update({ components: [errorContainer(t("Ação inválida para gestão de membros."))] });
            return;
        }
        const { context, ticket } = found;
        try {
            const target = await fetchTargetMember(context.channel.guild, interaction.values[0]);
            if (action === "add") {
                await addTicketMember(context.channel, target);
                await interaction.update({ components: [successContainer(`${target} ${t("foi adicionado ao ticket.")}`)] });
                return;
            }
            await removeTicketMember(context.channel, ticket.owner_id, target, context.member, context.config);
            await interaction.update({ components: [successContainer(`${target} ${t("foi removido do ticket.")}`)] });
        } catch (error) {
            await interaction.update({ components: [errorContainer(error instanceof Error ? error.message : t("Não foi possível gerir o membro."))] });
        }
    },
});

createResponder({
    customId: "ticket/mm-manual/:action/:id",
    types: [ResponderType.Button],
    async run(interaction, { action, id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        if (!isMemberManageAction(action)) {
            await replyContainer(interaction, errorContainer(t("Ação inválida para gestão de membros.")));
            return;
        }
        await interaction.showModal(buildMemberManageModal(id, action));
    },
});

createResponder({
    customId: "ticket/mm-modal/:action/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { action, id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        if (!isMemberManageAction(action)) {
            await replyContainer(interaction, errorContainer(t("Ação inválida para gestão de membros.")));
            return;
        }
        const { context, ticket } = found;
        try {
            const target = await fetchTargetMember(context.channel.guild, interaction.fields.getTextInputValue("member"));
            if (action === "add") {
                await addTicketMember(context.channel, target);
                await replyContainer(interaction, successContainer(`${target} ${t("foi adicionado ao ticket.")}`));
                return;
            }
            await removeTicketMember(context.channel, ticket.owner_id, target, context.member, context.config);
            await replyContainer(interaction, successContainer(`${target} ${t("foi removido do ticket.")}`));
        } catch (error) {
            await replyContainer(interaction, errorContainer(error instanceof Error ? error.message : t("Não foi possível gerir o membro.")));
        }
    },
});

// ─── Priority ────────────────────────────────────────────────────────────────
createResponder({
    customId: "ticket/priority-select/:id",
    types: [ResponderType.StringSelect],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        const { context } = found;
        const value = interaction.values[0];
        if (!isTicketPriority(value)) {
            await interaction.update({ components: [errorContainer(t("Prioridade inválida."))] });
            return;
        }
        await updateTicketByChannel(context.channelId, { priority: value });
        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "ticket.priority", details: { ticketId: id, priority: value } });
        await syncTicketOverviewMessage(context.channel, context.config);

        // An urgent ticket re-pings the staff role so it doesn't get lost in triage.
        if (value === "urgent" && context.config.staff_role) {
            await context.channel.send({ content: `⚠️ <@&${context.config.staff_role}> — ${t("ticket marcado como **urgente**.")}`, allowedMentions: { parse: ["roles"] } }).catch(() => null);
        }
        await interaction.update({ components: [successContainer(t("Prioridade definida para **{priority}**.", { priority: priorityLabel(value) }))] });
    },
});

// ─── Macros (respostas rápidas) ──────────────────────────────────────────────
createResponder({
    customId: "ticket/macro-select/:id",
    types: [ResponderType.StringSelect],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        const macro = findMacro(found.context.config, interaction.values[0]);
        if (!macro) {
            await interaction.update({ components: [errorContainer(t("Resposta rápida não encontrada."))] });
            return;
        }
        await found.context.channel.send({ content: macro.content.slice(0, 2000), allowedMentions: { parse: ["users"] } }).catch(() => null);
        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "ticket.macro", details: { ticketId: id, macroId: macro.id } });
        await interaction.update({ components: [successContainer(t("Resposta rápida **{name}** enviada.", { name: macro.name }))] });
    },
});

// ─── Request close ───────────────────────────────────────────────────────────
createResponder({
    customId: "ticket/requestclose/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        const found = await requireTicket(interaction, id);
        if (!found) return;
        await interaction.showModal(buildRequestCloseModal(id));
    },
});

createResponder({
    customId: "ticket/requestclose-modal/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        const context = await loadTicketContext(interaction);
        if (!context) return;
        if (!(await ensureStaff(interaction, context))) return;
        const ticket = await getTicketByChannel(context.channelId);
        if (!ticket) {
            await replyContainer(interaction, errorContainer(t("Ticket não encontrado.")));
            return;
        }
        try {
            const message = interaction.fields.getTextInputValue("message").trim();
            const hours = interaction.fields.getTextInputValue("hours").trim();
            await requestTicketClosure(context.channel, ticket, context.member, message, hours || null);
            await replyContainer(interaction, successContainer(t("Pedido de fecho enviado ao utilizador.")));
        } catch (error) {
            await replyContainer(interaction, errorContainer(error instanceof Error ? error.message : t("Não foi possível enviar o pedido de fecho.")));
        }
    },
});
