import { t } from "../../lib/i18n.js";
import {
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { getEmbedColor } from "../../lib/branding.js";
import { buildContainer, row, type Row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { buildTextInputModal } from "../../lib/modals.js";
import type { GuildConfig, TicketRecord } from "../../types.js";
import { getCategoryLabel, getCategoryLabels } from "./categories.js";
import { PRIORITY_ORDER, priorityLabel, priorityMeta } from "./priorities.js";
import { getTicketMacros } from "./macros.js";

export type MemberManageAction = "add" | "remove";

export function isMemberManageAction(value: string): value is MemberManageAction {
    return value === "add" || value === "remove";
}

export function buildStaffControlsContainer(ticket: TicketRecord, config: GuildConfig): ContainerPlusBuilder {
    const controls: Row[] = [
        row(
            new ButtonBuilder().setCustomId(buildCustomId("ticket", "rename", ticket.id)).setLabel(t("Renomear")).setEmoji(emoji.rename).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(buildCustomId("ticket", "move", ticket.id)).setLabel(t("Mover categoria")).setEmoji(emoji.move).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(buildCustomId("ticket", "assign", ticket.id)).setLabel(t("Reatribuir staff")).setEmoji(emoji.user).setStyle(ButtonStyle.Secondary),
        ),
        row(
            new ButtonBuilder().setCustomId(buildCustomId("ticket", "note", ticket.id)).setLabel(t("Nota interna")).setEmoji(emoji.note).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(buildCustomId("ticket", "player", ticket.id)).setLabel(t("Referência")).setEmoji(emoji.id).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(buildCustomId("ticket", "requestclose", ticket.id)).setLabel(t("Pedir fecho")).setEmoji(emoji.open).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(buildCustomId("ticket", "close", ticket.id)).setLabel(t("Fechar")).setEmoji(emoji.close).setStyle(ButtonStyle.Danger),
        ),
        row(
            new ButtonBuilder().setCustomId(buildCustomId("ticket", "membermanage", ticket.id)).setLabel(t("Gerir membros")).setEmoji(emoji.users).setStyle(ButtonStyle.Success),
        ),
        buildPrioritySelect(ticket),
    ];

    const macros = getTicketMacros(config);
    if (macros.length > 0) {
        controls.push(buildMacroSelect(ticket.id, config));
    }

    return buildContainer({
        color: getEmbedColor(config),
        title: `${emoji.settings} ${t("Painel operacional")}`,
        description: t("Ferramentas reservadas a staff para gerir o ticket com contexto, prioridade e rastreio interno."),
        fields: [
            { name: t("Dono do ticket"), value: `<@${ticket.owner_id}>` },
            { name: t("Responsável"), value: ticket.staff_id ? `<@${ticket.staff_id}>` : t("Por assumir") },
            { name: t("Categoria"), value: getCategoryLabel(config, ticket.category) },
            { name: t("Prioridade"), value: priorityLabel(ticket.priority) },
            { name: t("Referência externa"), value: ticket.player_identifier ?? t("Não definida") },
            { name: t("Nota interna"), value: ticket.internal_note?.slice(0, 1024) ?? t("Sem notas adicionais.") },
        ],
        footerText: t("Ticket {id}", { id: ticket.id }),
        rows: controls,
    });
}

export function buildPrioritySelect(ticket: TicketRecord): Row {
    return row(
        new StringSelectMenuBuilder()
            .setCustomId(buildCustomId("ticket", "priority-select", ticket.id))
            .setPlaceholder(t("Definir prioridade do ticket"))
            .addOptions(PRIORITY_ORDER.map((value) => {
                const meta = priorityMeta(value);
                return { label: t(meta.label), value, emoji: meta.icon, default: (ticket.priority ?? "normal") === value };
            })),
    );
}

export function buildMacroSelect(ticketId: string, config: GuildConfig): Row {
    const macros = getTicketMacros(config).slice(0, 25);
    return row(
        new StringSelectMenuBuilder()
            .setCustomId(buildCustomId("ticket", "macro-select", ticketId))
            .setPlaceholder(t("Enviar resposta rápida…"))
            .addOptions(macros.map((macro) => ({
                label: macro.name.slice(0, 100),
                value: macro.id,
                description: macro.content.replace(/\s+/g, " ").slice(0, 100),
            }))),
    );
}

export function buildMoveCategorySelect(ticketId: string, config: GuildConfig): Row {
    const labels = getCategoryLabels(config);
    return row(
        new StringSelectMenuBuilder()
            .setCustomId(buildCustomId("ticket", "move-select", ticketId))
            .setPlaceholder(t("Seleciona a nova categoria"))
            .addOptions(Object.entries(labels).map(([value, label]) => ({ label, value }))),
    );
}

export function buildAssignUserSelect(ticketId: string): Row {
    return row(
        new UserSelectMenuBuilder().setCustomId(buildCustomId("ticket", "assign-select", ticketId)).setPlaceholder(t("Seleciona o novo staff")),
    );
}

export function buildMemberManageActionSelector(ticketId: string): Row {
    return row(
        new StringSelectMenuBuilder()
            .setCustomId(buildCustomId("ticket", "mm-action", ticketId))
            .setPlaceholder(t("Seleciona se queres adicionar ou remover"))
            .addOptions(
                { label: t("Adicionar membro"), value: "add", description: t("Dá acesso ao utilizador a este ticket."), emoji: emoji.add },
                { label: t("Remover membro"), value: "remove", description: t("Retira o acesso do utilizador a este ticket."), emoji: emoji.remove },
            ),
    );
}

export function buildMemberManageUserSelector(ticketId: string, action: MemberManageAction): Row {
    const placeholder = action === "add" ? t("Seleciona o membro a adicionar") : t("Seleciona o membro a remover");
    return row(
        new UserSelectMenuBuilder().setCustomId(buildCustomId("ticket", "mm-select", action, ticketId)).setPlaceholder(placeholder),
    );
}

export function buildMemberManageManualButton(ticketId: string, action: MemberManageAction): Row {
    return row(
        new ButtonBuilder()
            .setCustomId(buildCustomId("ticket", "mm-manual", action, ticketId))
            .setLabel(t("Escrever ID ou menção"))
            .setEmoji(emoji.keyboard)
            .setStyle(ButtonStyle.Secondary),
    );
}

export function buildMemberManageModal(ticketId: string, action: MemberManageAction): ModalBuilder {
    return buildTextInputModal(buildCustomId("ticket", "mm-modal", action, ticketId), action === "add" ? t("Adicionar membro") : t("Remover membro"), [
        { customId: "member", label: t("ID ou menção do utilizador"), style: TextInputStyle.Short, required: true, placeholder: t("Ex: 123456789012345678 ou @utilizador"), maxLength: 50 },
    ]);
}

export function buildRenameModal(ticketId: string, currentName: string): ModalBuilder {
    return buildTextInputModal(buildCustomId("ticket", "rename-modal", ticketId), t("Renomear ticket"), [
        { customId: "name", label: t("Novo nome"), placeholder: t("ex: bugs-joao"), required: true, style: TextInputStyle.Short, value: currentName.slice(0, 100), maxLength: 100 },
    ]);
}

export function buildNoteModal(ticketId: string, currentNote: string): ModalBuilder {
    return buildTextInputModal(buildCustomId("ticket", "note-modal", ticketId), t("Nota interna"), [
        { customId: "note", label: t("Nota"), style: TextInputStyle.Paragraph, value: currentNote.slice(0, 4000), maxLength: 4000 },
    ]);
}

export function buildPlayerModal(ticketId: string, currentPlayer: string): ModalBuilder {
    return buildTextInputModal(buildCustomId("ticket", "player-modal", ticketId), t("Referência externa"), [
        { customId: "player", label: t("Referência (nº encomenda, ID, link…)"), style: TextInputStyle.Short, value: currentPlayer, maxLength: 200 },
    ]);
}

export function buildRequestCloseModal(ticketId: string): ModalBuilder {
    return buildTextInputModal(buildCustomId("ticket", "requestclose-modal", ticketId), t("Pedir fecho do ticket"), [
        { customId: "message", label: t("Mensagem final para o utilizador"), style: TextInputStyle.Paragraph, required: true, placeholder: t("Explica ao utilizador o que foi concluído e porque pedes para encerrar."), maxLength: 1000 },
        { customId: "hours", label: t("Horas até fecho automático"), style: TextInputStyle.Short, placeholder: t("Default 120. Mínimo 12"), value: "120", maxLength: 4 },
    ]);
}

export const CATEGORY_CHANNEL_TYPE = ChannelType.GuildCategory;
