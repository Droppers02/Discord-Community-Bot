import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags } from "discord.js";
import { errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { createGroup, groupsListView } from "../../../modules/lfg/lfgService.js";
import { getLfgSettings } from "../../../modules/lfg/lfgSettings.js";
import { parseStart, slugify } from "../../../modules/lfg/lfgLogic.js";

// /grupo — procurar gente para jogar.

createCommand({
    name: "grupo",
    description: t("Procura gente para jogar: grupo com vagas, lista de espera e sala de voz."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "criar",
            description: t("Cria um grupo para um jogo."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "jogo", description: t("O jogo (escolhe da lista ou escreve outro)"), type: ApplicationCommandOptionType.String, required: true, autocomplete: true, maxLength: 40 },
                { name: "vagas", description: t("Quantos jogadores no total, contigo (por defeito, o do jogo)"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 2, maxValue: 20 },
                { name: "quando", description: t("Ex.: 21h, 21:30, amanhã 18:00, daqui a 30m (vazio = agora)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 30 },
                { name: "modo", description: t("Ex.: Ranked, Casual, Torneio"), type: ApplicationCommandOptionType.String, required: false, maxLength: 40 },
                { name: "nota", description: t("Algo a dizer (rank mínimo, mic obrigatório…)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 300 },
            ],
        },
        { name: "lista", description: t("Grupos abertos agora."), type: ApplicationCommandOptionType.Subcommand },
    ],
    async autocomplete(interaction) {
        if (!interaction.inCachedGuild()) return;
        const settings = await getLfgSettings(interaction.guildId);
        const typed = interaction.options.getFocused().trim();
        const slug = slugify(typed);
        const matches = settings.games
            .filter((game) => !typed || slugify(game.name).includes(slug))
            .slice(0, 24)
            .map((game) => ({ name: `${game.name} · ${game.size} ${t("jogadores")}`.slice(0, 100), value: game.key }));
        if (typed && !matches.some((option) => slugify(option.name).startsWith(slug))) matches.push({ name: typed.slice(0, 100), value: typed.slice(0, 40) });
        await interaction.respond(matches.slice(0, 25)).catch(() => null);
    },
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (interaction.options.getSubcommand() === "lista") {
            return void interaction.reply({ components: [await groupsListView(interaction.guild, interaction.user.id)], flags: CV2_FLAG | MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const fail = (text: string) => interaction.editReply({ components: [errorContainer(text)], flags: CV2_FLAG });
        if (!interaction.channel) return void fail(t("Usa o comando num canal de texto."));
        const whenInput = interaction.options.getString("quando");
        const startsAt = whenInput ? parseStart(whenInput) : null;
        if (whenInput && startsAt === null && !/^(agora|ja|já)$/i.test(whenInput.trim())) return void fail(t("Não percebi a hora — usa `21h`, `21:30`, `amanhã 18:00` ou `daqui a 30m`."));
        if (startsAt && startsAt > Date.now() + 7 * 86_400_000) return void fail(t("Só dá para marcar até 7 dias à frente."));
        const result = await createGroup({
            host: interaction.member,
            gameInput: interaction.options.getString("jogo", true),
            size: interaction.options.getInteger("vagas"),
            startsAt,
            mode: interaction.options.getString("modo")?.trim() || null,
            note: interaction.options.getString("nota")?.trim() || null,
            channel: interaction.channel,
        });
        if (!result.ok) return void fail(result.reason);
        await interaction.editReply({ components: [successContainer(t("Grupo de **{game}** criado! {link}", { game: result.group.game_name, link: result.url }))], flags: CV2_FLAG });
    },
});
