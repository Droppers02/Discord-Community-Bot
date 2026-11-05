import { createCommand } from "#base";
import { ApplicationCommandType, MessageFlags } from "discord.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { buildReportModal } from "../../../modules/reports/reportService.js";
import { getReportSettings } from "../../../modules/reports/reportSettings.js";

// Botão direito numa mensagem → Apps → Reportar mensagem (qualquer membro).

createCommand({
    name: "Reportar mensagem",
    type: ApplicationCommandType.Message,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const fail = (text: string) => interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const settings = await getReportSettings(interaction.guildId);
        if (!settings.enabled || !settings.channel) return void fail(t("As denúncias não estão ligadas neste servidor — fala com a equipa por ticket."));
        const message = interaction.targetMessage;
        if (message.author.id === interaction.user.id) return void fail(t("Não podes denunciar uma mensagem tua. 🙂"));
        if (message.author.id === interaction.client.user.id) return void fail(t("Essa mensagem é do bot — se algo está mal, abre um ticket."));
        await interaction.showModal(buildReportModal(message.channelId, message.id));
    },
});
