import { createCommand } from "#base";
import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType, MessageFlags } from "discord.js";
import { loadRuntimeConfig } from "../../../config.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { appealsOf } from "../../../repositories/appealRepository.js";
import { appealStatusView, checkEligibility } from "../../../modules/appeals/appealService.js";

// /apelo — pedido de revisão de ban. Quem foi banido já não partilha o servidor principal com o
// bot, e o Discord só lhe entrega comandos de quem partilha um servidor: por isso funciona no
// servidor de apelos (e em DM ao bot enquanto a pessoa lá estiver). É global (contexto Servidor e
// DM); o middleware só o deixa correr nos nossos servidores, no de apelos e em DM.
createCommand({
    name: "apelo",
    description: t("Pede a revisão do teu ban no servidor da EPA (no servidor de apelos ou em DM ao bot)."),
    type: ApplicationCommandType.ChatInput,
    global: true,
    contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
    integrationTypes: [ApplicationIntegrationType.GuildInstall],
    async run(interaction) {
        const flags = interaction.inGuild() ? CV2_FLAG | MessageFlags.Ephemeral : CV2_FLAG;
        const guild = interaction.client.guilds.cache.get(loadRuntimeConfig().mainGuildId);
        if (!guild) return void interaction.reply({ components: [errorContainer(t("O servidor não está disponível neste momento."))], flags });
        await interaction.deferReply(interaction.inGuild() ? { flags: MessageFlags.Ephemeral } : {});
        const [appeals, eligibility] = await Promise.all([appealsOf(guild.id, interaction.user.id), checkEligibility(guild, interaction.user.id)]);
        await interaction.editReply({ components: [appealStatusView(guild, appeals, eligibility)], flags: CV2_FLAG });
    },
});
