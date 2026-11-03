import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, GuildMember, MessageFlags } from "discord.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { buildDashboardPayload, hasDashboardAccess, isDashboardWindow } from "../../../modules/tickets/dashboard.js";
import { registerEphemeralPanel } from "../../../lib/ephemeralLifecycle.js";
import { t } from "../../../lib/i18n.js";

createCommand({
    name: "dashboard-staff",
    description: t("Painel operacional com SLA, carga e métricas de suporte."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "janela",
            description: t("Janela temporal para métricas e histórico"),
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
                { name: t("24 horas"), value: "24h" },
                { name: t("7 dias"), value: "7d" },
                { name: t("30 dias"), value: "30d" },
                { name: t("90 dias"), value: "90d" },
                { name: t("Tudo"), value: "all" },
            ],
        },
        { name: "pagina", description: t("Página do dashboard"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 1, maxValue: 25 },
    ],
    async run(interaction) {
        if (!interaction.inGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasDashboardAccess(interaction.member as GuildMember, config)) {
            await interaction.reply({ components: [errorContainer(t("Apenas super-admin ou `Administrator` pode usar `/dashboard-staff`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        const windowValue = interaction.options.getString("janela") ?? "7d";
        const window = isDashboardWindow(windowValue) ? windowValue : "7d";
        const page = interaction.options.getInteger("pagina") ?? 1;
        const payload = await buildDashboardPayload(interaction.guildId, window, page);

        await interaction.reply({ components: payload.components, flags: CV2_FLAG | MessageFlags.Ephemeral });
        await registerEphemeralPanel(interaction);
    },
});
