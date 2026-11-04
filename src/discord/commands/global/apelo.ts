import { createCommand } from "#base";
import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { loadRuntimeConfig } from "../../../config.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { appealsOf } from "../../../repositories/appealRepository.js";
import { appealStatusView, checkEligibility } from "../../../modules/appeals/appealService.js";

// /apelo — o único comando que funciona em mensagem privada. Quem foi banido já não partilha o
// servidor com o bot e o Discord só mostra os comandos de um bot em DM a quem partilha um servidor
// com ele... ou a quem ADICIONOU O BOT À CONTA (User Install). Por isso o comando aceita os dois
// tipos de instalação — a DM do ban traz o link para adicionar (ver modules/appeals/appealAccess.ts).
// É aqui que o membro vê o estado, responde às perguntas da equipa e recebe o convite de regresso.
createCommand({
    name: "apelo",
    description: t("Pede a revisão do teu ban no servidor da EPA e vê a resposta da equipa."),
    type: ApplicationCommandType.ChatInput,
    global: true,
    contexts: [InteractionContextType.BotDM],
    integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
    async run(interaction) {
        const guild = interaction.client.guilds.cache.get(loadRuntimeConfig().mainGuildId);
        if (!guild) return void interaction.reply({ components: [errorContainer(t("O servidor não está disponível neste momento."))], flags: CV2_FLAG });
        await interaction.deferReply();
        const [appeals, eligibility] = await Promise.all([appealsOf(guild.id, interaction.user.id), checkEligibility(guild, interaction.user.id)]);
        await interaction.editReply({ components: [appealStatusView(guild, appeals, eligibility)], flags: CV2_FLAG });
    },
});
