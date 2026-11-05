import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType } from "discord.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { buildMemberWrapped, buildServerWrapped, getWrappedSettings } from "../../../modules/wrapped/wrappedService.js";
import type { WrappedPeriod } from "../../../modules/wrapped/wrappedStats.js";

const periodOpt = {
    name: "periodo",
    description: t("Que período (por defeito, este mês)"),
    type: ApplicationCommandOptionType.String as const,
    required: false,
    choices: [
        { name: t("Este mês"), value: "mes" },
        { name: t("Mês passado"), value: "mes-passado" },
        { name: t("Este ano"), value: "ano" },
        { name: t("Ano passado"), value: "ano-passado" },
    ],
};

createCommand({
    name: "wrapped",
    description: t("EPA Wrapped: a tua retrospetiva (ou a do servidor) em imagem."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "membro",
            description: t("A retrospetiva de alguém (por defeito, a tua)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "membro", description: t("De quem"), type: ApplicationCommandOptionType.User, required: false }, periodOpt],
        },
        { name: "servidor", description: t("A retrospetiva do servidor inteiro."), type: ApplicationCommandOptionType.Subcommand, options: [periodOpt] },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const settings = await getWrappedSettings(interaction.guildId);
        if (!settings.enabled) return void interaction.reply({ components: [errorContainer(t("O EPA Wrapped está desligado neste servidor."))], flags: CV2_FLAG });
        await interaction.deferReply();
        const period = (interaction.options.getString("periodo") as WrappedPeriod | null) ?? "mes";
        if (interaction.options.getSubcommand() === "servidor") {
            return void interaction.editReply({ components: [await buildServerWrapped(interaction.guild, period)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        }
        const user = interaction.options.getUser("membro") ?? interaction.user;
        const { container, files } = await buildMemberWrapped(interaction.guild, user, period);
        await interaction.editReply({ components: [container], files, flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});
