import { t } from "../../lib/i18n.js";
import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { ButtonBuilder, ButtonStyle, GuildMember, MessageFlags } from "discord.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { buildContainer, errorContainer, row } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { getEmbedColor } from "../../lib/branding.js";
import { getTicketCategories } from "../../modules/tickets/categories.js";
import { getTicketForm } from "../../modules/tickets/forms.js";
import { buildCategorySelectorContainer } from "../../modules/tickets/ticketPanel.js";
import { buildPanelCategorySelector, findPanel } from "../../modules/tickets/panels.js";
import { buildOpenTicketModal, parseTicketSubmission } from "../../modules/tickets/ticketForm.js";
import { createTicket, hasCooldown } from "../../modules/tickets/ticketManager.js";
import { NotFoundError } from "../../errors/index.js";

function cooldownMessage(seconds: number): string {
    return t("Tens um cooldown ativo de {seconds, plural, one {# segundo} other {# segundos}} para abrir novos tickets.", { seconds: Math.max(1, seconds) });
}

// Legacy single-panel button (no panel id) — shows all configured categories.
createResponder({
    customId: "ticket/open",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (hasCooldown(interaction.user.id)) {
            await replyContainer(interaction, errorContainer(cooldownMessage(config.ticket_cooldown_seconds)));
            return;
        }
        await replyContainer(interaction, buildCategorySelectorContainer(config));
    },
});

// Multi-panel button — categories are restricted to the panel that was clicked.
createResponder({
    customId: "ticket/open/:panelId",
    types: [ResponderType.Button],
    async run(interaction, { panelId }) {
        if (!interaction.inGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (hasCooldown(interaction.user.id)) {
            await replyContainer(interaction, errorContainer(cooldownMessage(config.ticket_cooldown_seconds)));
            return;
        }
        const panel = findPanel(config, panelId);
        // If the panel was deleted, gracefully fall back to the full category list.
        await replyContainer(interaction, panel ? buildPanelCategorySelector(panel, config) : buildCategorySelectorContainer(config));
    },
});

createResponder({
    customId: "ticket/open-category",
    types: [ResponderType.StringSelect],
    async run(interaction) {
        if (!interaction.inGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (hasCooldown(interaction.user.id)) {
            await replyContainer(interaction, errorContainer(cooldownMessage(config.ticket_cooldown_seconds)));
            return;
        }

        const category = interaction.values[0] ?? null;
        if (!category || !getTicketCategories(config).some((entry) => entry.id === category)) {
            await replyContainer(interaction, errorContainer(t("Categoria inválida. Escolhe uma das categorias atualmente configuradas.")));
            return;
        }

        await interaction.showModal(buildOpenTicketModal(config, category));
    },
});

createResponder({
    customId: "ticket/reason-modal/:category",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { category }) {
        if (!interaction.inGuild() || !interaction.guild) return;

        const config = await ensureGuildConfig(interaction.guildId);
        if (!getTicketCategories(config).some((entry) => entry.id === category)) {
            await replyContainer(interaction, errorContainer(t("Categoria inválida. Escolhe uma das categorias atualmente configuradas.")));
            return;
        }

        try {
            const form = getTicketForm(config, category);
            if (!form) throw new NotFoundError(t("Não foi possível carregar o formulário da categoria selecionada."));

            const submission = parseTicketSubmission(form, interaction);
            await interaction.reply({
                components: [buildContainer({ color: getEmbedColor(config), title: `${emoji.pending} ${t("A criar o teu ticket")}`, description: t("Aguarda um instante enquanto preparamos o canal.") })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });

            const channel = await createTicket(interaction.guild, interaction.user, category, submission.reason, config, submission.clipUrl, submission.responses, submission.attachments);
            const member = interaction.member as GuildMember;
            const ticketUrl = `https://discord.com/channels/${interaction.guildId}/${channel.id}`;

            await interaction.editReply({
                components: [buildContainer({
                    color: getEmbedColor(config),
                    thumbnailUrl: config.branding_logo,
                    title: `${emoji.success} ${t("Ticket aberto")}`,
                    description: t("**{name}**, o teu ticket foi aberto com **sucesso**! Clica no botão abaixo para seres redirecionado.", { name: member.displayName }),
                    rows: [row(
                        new ButtonBuilder().setLabel(t("O teu ticket!")).setEmoji(emoji.ticket).setStyle(ButtonStyle.Link).setURL(ticketUrl),
                    )],
                })],
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : t("Falha inesperada ao criar ticket.");
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ components: [errorContainer(message)] });
            } else {
                await replyContainer(interaction, errorContainer(message));
            }
        }
    },
});
