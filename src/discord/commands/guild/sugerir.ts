import { createCommand } from "#base";
import {
    ActionRowBuilder,
    ApplicationCommandType,
    ModalBuilder,
    MessageFlags,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { buildCustomId } from "../../../lib/ids.js";
import { getSuggestionSettings } from "../../../modules/suggestions/suggestionSettings.js";
import { t } from "../../../lib/i18n.js";

createCommand({
    name: "sugerir",
    description: t("Enviar uma sugestão para o servidor."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const settings = await getSuggestionSettings(interaction.guildId);

        if (!settings.channel) {
            await interaction.reply({ components: [errorContainer(t("O sistema de sugestões ainda não está configurado. Pede a um admin para definir o canal em `/config → Sugestões`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }
        if (interaction.channelId !== settings.channel) {
            await interaction.reply({ components: [errorContainer(t("O comando `/sugerir` só pode ser usado na sala de sugestões {channel}.", { channel: `<#${settings.channel}>` }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }
        if (settings.required_role && !interaction.member.roles.cache.has(settings.required_role)) {
            await interaction.reply({ components: [errorContainer(t("Precisas do cargo {role} para enviar sugestões.", { role: `<@&${settings.required_role}>` }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(
            new ModalBuilder()
                .setCustomId(buildCustomId("suggestion", "submit", "named"))
                .setTitle(t("Nova sugestão"))
                .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("content")
                        .setLabel(t("A tua sugestão"))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMinLength(8)
                        .setMaxLength(1500)
                        .setPlaceholder(t("Descreve a tua ideia com detalhe…")),
                )),
        );
    },
});
