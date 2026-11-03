import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, GuildMember, MessageFlags, TextChannel } from "discord.js";
import { ensureGuildConfig, upsertGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { buildContainer, errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../../lib/discord.js";
import { emoji } from "../../../lib/emojis.js";
import { getEmbedColor, getFooterText } from "../../../lib/branding.js";
import { postTicketPanel } from "../../../modules/tickets/ticketPanel.js";
import {
    buildPanelContainer,
    createDefaultPanel,
    findPanel,
    findPanelByName,
    getTicketPanels,
    serializeTicketPanels,
    upsertPanel,
} from "../../../modules/tickets/panels.js";
import { t } from "../../../lib/i18n.js";

createCommand({
    name: "painel",
    description: t("Publica um painel de tickets neste canal."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "painel", description: t("Nome do painel a publicar (deixa vazio para o painel principal)"), type: ApplicationCommandOptionType.String, required: false, autocomplete: true },
    ],
    async run(interaction) {
        if (!interaction.inGuild() || !interaction.channel?.isTextBased()) return;
        const config = await ensureGuildConfig(interaction.guildId);

        if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role)) {
            await interaction.reply({ components: [errorContainer(t("Apenas super-admin ou `Administrator` pode publicar o painel."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        const channel = interaction.channel as TextChannel;
        const requested = interaction.options.getString("painel")?.trim() ?? null;
        const panels = getTicketPanels(config);

        // ─── Multi-panel: a specific panel was requested (by id via autocomplete, or by name) ───
        if (requested) {
            const existing = findPanel(config, requested) ?? findPanelByName(config, requested);
            const panel = existing ?? createDefaultPanel(requested);
            const message = await channel.send({ components: [buildPanelContainer(panel, config)], flags: CV2_FLAG });
            const updated = { ...panel, channel_id: channel.id, message_id: message.id };
            await upsertGuildConfig({ guild_id: interaction.guildId, ticket_panels_json: serializeTicketPanels(upsertPanel(panels, updated)) });
            await interaction.reply({ components: [successContainer(`${t("Painel **{panel}** publicado em {channel}.", { panel: updated.name, channel: String(channel) })}${existing ? "" : ` ${t("(novo painel criado — configura as categorias em `/config`)")}`}`)], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        // ─── No panel specified but several exist → ask which one ───
        if (panels.length > 0) {
            await interaction.reply({
                components: [buildContainer({
                    color: getEmbedColor(config),
                    title: `${emoji.ticket} ${t("Escolhe o painel")}`,
                    description: t("Este servidor tem vários painéis configurados. Indica o nome no argumento `painel`."),
                    fields: [{ name: t("Painéis disponíveis"), value: panels.map((panel) => `• ${panel.name}`).join("\n") }],
                    footerText: getFooterText(config),
                })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
            return;
        }

        // ─── Legacy single global panel (backward compatible) ───
        const messageId = await postTicketPanel(channel, config);
        await upsertGuildConfig({ guild_id: interaction.guildId, ticket_channel: channel.id, ticket_panel_message: messageId });
        await interaction.reply({ components: [successContainer(t("Painel de tickets publicado em {channel}.", { channel: String(channel) }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
    },
    async autocomplete(interaction) {
        if (!interaction.inGuild()) return [];
        const config = await ensureGuildConfig(interaction.guildId);
        const focused = String(interaction.options.getFocused(true).value ?? "").toLowerCase();
        return getTicketPanels(config)
            .filter((panel) => panel.name.toLowerCase().includes(focused))
            .slice(0, 25)
            .map((panel) => ({ name: panel.name.slice(0, 100), value: panel.id }));
    },
});
