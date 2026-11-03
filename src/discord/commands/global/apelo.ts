import { createCommand } from "#base";
import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { loadRuntimeConfig } from "../../../config.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { appealsOf } from "../../../repositories/appealRepository.js";
import { appealStatusView, checkEligibility } from "../../../modules/appeals/appealService.js";

// /apelo — o único comando que funciona em mensagem privada: quem foi banido já não vê os
// comandos do servidor, mas pode falar com o bot por DM e pedir a revisão do ban.
createCommand({
    name: "apelo",
    description: t("Pede a revisão do teu ban no servidor da EPA (usa em mensagem privada ao bot)."),
    type: ApplicationCommandType.ChatInput,
    global: true,
    contexts: [InteractionContextType.BotDM],
    integrationTypes: [ApplicationIntegrationType.GuildInstall],
    async run(interaction) {
        const guild = interaction.client.guilds.cache.get(loadRuntimeConfig().mainGuildId);
        if (!guild) return void interaction.reply({ components: [errorContainer(t("O servidor não está disponível neste momento."))], flags: CV2_FLAG });
        const [appeals, eligibility] = await Promise.all([appealsOf(guild.id, interaction.user.id), checkEligibility(guild, interaction.user.id)]);
        await interaction.reply({ components: [appealStatusView(guild, appeals, eligibility)], flags: CV2_FLAG });
    },
});
