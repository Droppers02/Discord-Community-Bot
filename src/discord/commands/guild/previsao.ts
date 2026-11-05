import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags } from "discord.js";
import { errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { parseStart } from "../../../modules/lfg/lfgLogic.js";
import { parseOptions } from "../../../modules/predictions/predictionLogic.js";
import { createPrediction, predictionsListView } from "../../../modules/predictions/predictionService.js";

createCommand({
    name: "previsao",
    description: t("Previsões com EPA Coins: aposta no resultado e quem acerta divide o bolo."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "criar",
            description: t("Lança uma previsão neste canal."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "pergunta", description: t("Ex.: Quem ganha a final de hoje?"), type: ApplicationCommandOptionType.String, required: true, maxLength: 200 },
                { name: "opcoes", description: t("2 a 8 opções separadas por | (ex.: Porto | Benfica | Empate)"), type: ApplicationCommandOptionType.String, required: true, maxLength: 500 },
                { name: "fecha", description: t("Quando fecham as apostas: 21h, amanhã 18:00, daqui a 30m (vazio = à mão)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 30 },
            ],
        },
        { name: "lista", description: t("Previsões abertas."), type: ApplicationCommandOptionType.Subcommand },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (interaction.options.getSubcommand() === "lista") {
            return void interaction.reply({ components: [await predictionsListView(interaction.guildId)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const fail = (text: string) => interaction.editReply({ components: [errorContainer(text)], flags: CV2_FLAG });
        const options = parseOptions(interaction.options.getString("opcoes", true));
        if (!options) return void fail(t("Dá entre 2 e 8 opções diferentes, separadas por `|`."));
        const closeInput = interaction.options.getString("fecha");
        const locksAt = closeInput ? parseStart(closeInput) : null;
        if (closeInput && !locksAt) return void fail(t("Não percebi quando fecha — usa `21h`, `amanhã 18:00` ou `daqui a 30m`."));
        if (locksAt && locksAt < Date.now() + 60_000) return void fail(t("Dá pelo menos 1 minuto para as apostas."));
        if (!interaction.channel) return void fail(t("Usa o comando num canal de texto."));
        const result = await createPrediction(interaction.member, interaction.channel, interaction.options.getString("pergunta", true).trim(), options, locksAt);
        if (!result.ok) return void fail(result.reason);
        await interaction.editReply({ components: [successContainer(t("Previsão lançada! {link}", { link: result.url }))], flags: CV2_FLAG });
    },
});
