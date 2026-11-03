import { ButtonBuilder, ButtonStyle, TextChannel, type Message } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { getTicketByChannel, updateTicketByChannel } from "../../repositories/ticketRepository.js";
import { getEmbedColor } from "../../lib/branding.js";
import { buildContainer, row, type ContainerField, type Row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import type { GuildConfig, TicketRecord } from "../../types.js";
import { getCategoryLabel } from "./categories.js";
import { priorityColor, priorityLabel } from "./priorities.js";
import { buildTicketResponseFields, buildTicketSemanticFields, getTicketForm, parseTicketFormResponses } from "./forms.js";
import { t } from "../../lib/i18n.js";

function hasActiveCloseRequest(ticket: TicketRecord): boolean {
    return Boolean(ticket.close_request_deadline_at && new Date(ticket.close_request_deadline_at).getTime() > Date.now());
}

function getTicketStatusText(ticket: TicketRecord): string {
    if (ticket.status === "closed") return "Encerrado";
    if (hasActiveCloseRequest(ticket)) return t("A aguardar resposta ao pedido de fecho");
    if (ticket.staff_id) return t("Em atendimento");
    return t("A aguardar triagem");
}

function getTicketDescription(ticket: TicketRecord): string {
    const ownerMention = `<@${ticket.owner_id}>`;
    if (ticket.status === "closed") return `${ownerMention}${t(", o teu pedido foi concluído e encerrado.")}`;
    if (hasActiveCloseRequest(ticket)) return `${ownerMention}${t(", a equipa já tratou do teu pedido e está à espera da tua resposta ao pedido de fecho.")}`;
    if (ticket.staff_id) return `${ownerMention}${t(", o teu pedido já está entregue a um membro da equipa para acompanhamento.")}`;
    return `${ownerMention}${t(", o teu pedido foi registado e está pronto para acompanhamento pela equipa.")}`;
}

export function buildTicketActionRows(ticket: TicketRecord): Row[] {
    const isClosed = ticket.status === "closed";
    const isAssumed = Boolean(ticket.staff_id);

    return [
        row(
            new ButtonBuilder()
                .setCustomId(buildCustomId("ticket", "assume", ticket.id))
                .setLabel(isAssumed ? t("Assumido") : t("Assumir"))
                .setEmoji(emoji.staff)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(isClosed || isAssumed),
            new ButtonBuilder()
                .setCustomId(buildCustomId("ticket", "close", ticket.id))
                .setLabel(t("Fechar ticket"))
                .setEmoji(emoji.close)
                .setStyle(ButtonStyle.Danger)
                .setDisabled(isClosed),
            new ButtonBuilder()
                .setCustomId(buildCustomId("ticket", "staffpanel", ticket.id))
                .setLabel(t("Painel staff"))
                .setEmoji(emoji.settings)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isClosed),
        ),
    ];
}

/** "0042" — quatro dígitos, para os canais ordenarem e lerem bem até ao ticket 9999. */
export function padTicketNumber(n: number): string {
    return String(n).padStart(4, "0");
}

/** "#0042" — como o número aparece no estado do ticket e nos logs. */
export function formatTicketNumber(n: number): string {
    return `#${padTicketNumber(n)}`;
}

export function buildTicketOverviewContainer(ticket: TicketRecord, config: GuildConfig): ContainerPlusBuilder {
    const fields: ContainerField[] = [
        { name: t("Categoria"), value: getCategoryLabel(config, ticket.category) },
        { name: t("Estado"), value: getTicketStatusText(ticket) },
        { name: t("Prioridade"), value: priorityLabel(ticket.priority) },
        { name: t("Responsável"), value: ticket.staff_id ? `<@${ticket.staff_id}>` : t("Por atribuir") },
    ];

    if (hasActiveCloseRequest(ticket)) {
        const deadline = Math.floor(new Date(ticket.close_request_deadline_at as string).getTime() / 1000);
        fields.push({ name: t("Fecho automático"), value: `<t:${deadline}:F>\n<t:${deadline}:R>` });
    }

    // Só os campos que fazem parte do formulário da categoria (nada de "Clip"/
    // "Motivo" fixos quando o formulário não os tem) — ver buildTicketSemanticFields.
    const responses = parseTicketFormResponses(ticket);
    const form = getTicketForm(config, ticket.category);
    fields.push(...buildTicketSemanticFields(form, { reason: ticket.reason, clipUrl: ticket.clip_url, hasResponses: responses.length > 0 }));
    fields.push(...buildTicketResponseFields(responses));

    return buildContainer({
        color: ticket.status === "closed" ? getEmbedColor(config) : priorityColor(ticket.priority, getEmbedColor(config)),
        thumbnailUrl: config.branding_logo,
        title: ticket.ticket_number ? `${emoji.ticket} ${t("Ticket {id}", { id: formatTicketNumber(ticket.ticket_number) })}` : `${emoji.ticket} ${t("Estado do ticket")}`,
        description: getTicketDescription(ticket),
        fields,
        footerText: t("Ticket {id}", { id: ticket.id }),
        rows: ticket.status === "closed" ? [] : buildTicketActionRows(ticket),
    });
}

function isTicketOverviewMessage(message: Message, ticket: TicketRecord, botId: string | undefined): boolean {
    if (!botId || message.author.id !== botId) return false;
    const target = buildCustomId("ticket", "assume", ticket.id);
    return message.components.some((component) => JSON.stringify(component.toJSON()).includes(target));
}

async function resolveTicketOverviewMessage(channel: TextChannel, ticket: TicketRecord): Promise<Message | null> {
    if (ticket.ticket_message_id) {
        const existing = await channel.messages.fetch(ticket.ticket_message_id).catch(() => null);
        if (existing) return existing;
    }

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const found = messages?.find((message) => isTicketOverviewMessage(message, ticket, channel.client.user?.id)) ?? null;

    if (found && found.id !== ticket.ticket_message_id) {
        await updateTicketByChannel(channel.id, { ticket_message_id: found.id });
    }

    return found;
}

export async function syncTicketOverviewMessage(channel: TextChannel, config: GuildConfig, ticketInput?: TicketRecord | null): Promise<TicketRecord | null> {
    const ticket = ticketInput ?? (await getTicketByChannel(channel.id));
    if (!ticket) return null;

    const message = await resolveTicketOverviewMessage(channel, ticket);
    if (!message) return ticket;

    // The overview message is a Components V2 message; editing only swaps components.
    await message.edit({ components: [buildTicketOverviewContainer(ticket, config)] });

    return (await getTicketByChannel(channel.id)) ?? ticket;
}
