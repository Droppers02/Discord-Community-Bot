import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, GuildMember, MessageFlags, PermissionFlagsBits } from "discord.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { startBlackjack } from "../../../modules/games/blackjack.js";
import { C4_DIFFICULTIES, C4_DIFFICULTY_LABELS, challengeC4, startC4VsBot, type C4Difficulty } from "../../../modules/games/connect4.js";
import { HANGMAN_CATEGORIES } from "../../../modules/games/data/words.js";
import { QUIZ_CATEGORIES, QUIZ_CATEGORY_LABELS, type QuizCategory } from "../../../modules/games/data/quiz.js";
import { gameGate } from "../../../modules/games/gameCore.js";
import { buildGamesHub } from "../../../modules/games/gamesViews.js";
import { startHangman } from "../../../modules/games/hangman.js";
import { MINE_TILES, startMines } from "../../../modules/games/mines.js";
import { playCoin, playDice, playRoulette, playSlots, ROULETTE_BETS, ROULETTE_LABELS, type RouletteBet } from "../../../modules/games/quickBets.js";
import { startQuiz } from "../../../modules/games/quiz.js";
import { challengeRps, startRpsVsBot } from "../../../modules/games/rps.js";
import { buildShipMessage } from "../../../modules/games/ship.js";
import { startTermo } from "../../../modules/games/termo.js";
import { challengeTtt, startTttVsBot, TTT_DIFFICULTIES, TTT_DIFFICULTY_LABELS, type TttDifficulty } from "../../../modules/games/tictactoe.js";

const betOption = (required = false) => ({
    name: "aposta",
    description: t("Moedas a apostar (opcional)"),
    type: ApplicationCommandOptionType.Integer as const,
    required,
    minValue: 1,
    maxValue: 1_000_000_000,
});

createCommand({
    name: "jogos",
    description: t("Todos os mini-jogos, as tuas estatísticas e os rankings."),
    type: ApplicationCommandType.ChatInput,
    options: [{ name: "membro", description: t("Ver as estatísticas de outro membro"), type: ApplicationCommandOptionType.User, required: false }],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const member = interaction.options.getMember("membro") ?? interaction.member;
        await interaction.reply({ components: [await buildGamesHub(member)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

createCommand({
    name: "galo",
    description: t("Jogo do Galo contra um amigo ou contra o bot."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "adversario", description: t("Quem desafias (vazio = jogas contra o bot)"), type: ApplicationCommandOptionType.User, required: false },
        betOption(),
        { name: "dificuldade", description: t("Dificuldade do bot"), type: ApplicationCommandOptionType.String, required: false, choices: TTT_DIFFICULTIES.map((value) => ({ name: t(TTT_DIFFICULTY_LABELS[value]), value })) },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const opponent = interaction.options.getMember("adversario");
        const bet = interaction.options.getInteger("aposta") ?? 0;
        if (opponent) return challengeTtt(interaction, opponent, bet);
        await startTttVsBot(interaction, (interaction.options.getString("dificuldade") ?? "normal") as TttDifficulty, bet);
    },
});

createCommand({
    name: "4emlinha",
    description: t("4 em Linha contra um amigo ou contra o bot."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "adversario", description: t("Quem desafias (vazio = jogas contra o bot)"), type: ApplicationCommandOptionType.User, required: false },
        betOption(),
        { name: "dificuldade", description: t("Dificuldade do bot"), type: ApplicationCommandOptionType.String, required: false, choices: C4_DIFFICULTIES.map((value) => ({ name: t(C4_DIFFICULTY_LABELS[value]), value })) },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const opponent = interaction.options.getMember("adversario");
        const bet = interaction.options.getInteger("aposta") ?? 0;
        if (opponent) return challengeC4(interaction, opponent, bet);
        await startC4VsBot(interaction, (interaction.options.getString("dificuldade") ?? "normal") as C4Difficulty, bet);
    },
});

createCommand({
    name: "ppt",
    description: t("Pedra, Papel, Tesoura contra um amigo ou contra o bot."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "adversario", description: t("Quem desafias (vazio = jogas contra o bot)"), type: ApplicationCommandOptionType.User, required: false },
        betOption(),
        { name: "melhor_de", description: t("À melhor de quantas rondas"), type: ApplicationCommandOptionType.Integer, required: false, choices: [1, 3, 5].map((n) => ({ name: String(n), value: n })) },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const opponent = interaction.options.getMember("adversario");
        const bet = interaction.options.getInteger("aposta") ?? 0;
        const bestOf = interaction.options.getInteger("melhor_de") ?? 3;
        if (opponent) return challengeRps(interaction, opponent, bestOf, bet);
        await startRpsVsBot(interaction, bestOf, bet);
    },
});

createCommand({
    name: "forca",
    description: t("Jogo da forca — sozinho ou com o canal inteiro."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "aberta", description: t("Toda a gente no canal pode jogar?"), type: ApplicationCommandOptionType.Boolean, required: false },
        { name: "categoria", description: t("Categoria das palavras"), type: ApplicationCommandOptionType.String, required: false, choices: HANGMAN_CATEGORIES.map((value) => ({ name: t(value), value })) },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await startHangman(interaction, interaction.options.getBoolean("aberta") ?? false, interaction.options.getString("categoria"));
    },
});

createCommand({
    name: "quiz",
    description: t("Quiz para o canal inteiro — ganha quem acerta mais e mais depressa."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "categoria", description: t("Categoria (vazio = todas)"), type: ApplicationCommandOptionType.String, required: false, choices: QUIZ_CATEGORIES.map((value) => ({ name: t(QUIZ_CATEGORY_LABELS[value]), value })) },
        { name: "perguntas", description: t("Quantas perguntas (1 a 15)"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 1, maxValue: 15 },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await startQuiz(interaction, (interaction.options.getString("categoria") as QuizCategory | null) ?? null, interaction.options.getInteger("perguntas") ?? 5);
    },
});

createCommand({
    name: "termo",
    description: t("Descobre a palavra de 5 letras em 6 tentativas."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "modo", description: t("Termo do dia (igual para todos) ou livre"), type: ApplicationCommandOptionType.String, required: false, choices: [{ name: t("Termo do dia"), value: "dia" }, { name: t("Livre"), value: "livre" }] },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await startTermo(interaction, (interaction.options.getString("modo") ?? "dia") === "dia");
    },
});

createCommand({
    name: "blackjack",
    description: t("Blackjack contra o dealer."),
    type: ApplicationCommandType.ChatInput,
    options: [betOption()],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await startBlackjack(interaction, interaction.options.getInteger("aposta") ?? 0);
    },
});

createCommand({
    name: "minas",
    description: t("Abre casas sem rebentar e levanta quando quiseres."),
    type: ApplicationCommandType.ChatInput,
    options: [
        betOption(true),
        { name: "bombas", description: t("Quantas bombas (mais bombas, mais prémio)"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 1, maxValue: MINE_TILES - 5 },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await startMines(interaction, interaction.options.getInteger("aposta", true), interaction.options.getInteger("bombas") ?? 3);
    },
});

createCommand({
    name: "apostar",
    description: t("Apostas rápidas: moeda, dados, slots e roleta."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "moeda",
            description: t("Cara ou coroa — paga a dobrar."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                betOption(true),
                { name: "lado", description: t("Cara ou coroa"), type: ApplicationCommandOptionType.String, required: true, choices: [{ name: t("Cara"), value: "cara" }, { name: t("Coroa"), value: "coroa" }] },
            ],
        },
        {
            name: "dados",
            description: t("Acerta no número do dado — paga 5,5×."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                betOption(true),
                { name: "numero", description: t("De 1 a 6"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 6 },
            ],
        },
        {
            name: "slots",
            description: t("Três iguais pagam até 250×."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [betOption(true)],
        },
        {
            name: "roleta",
            description: t("Roleta europeia: cor, par/ímpar, metade ou número certo."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                betOption(true),
                { name: "em", description: t("Em que apostas"), type: ApplicationCommandOptionType.String, required: true, choices: ROULETTE_BETS.map((value) => ({ name: t(ROULETTE_LABELS[value]), value })) },
                { name: "numero", description: t("Só para \"Número certo\": de 0 a 36"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 0, maxValue: 36 },
            ],
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const bet = interaction.options.getInteger("aposta", true);
        switch (interaction.options.getSubcommand()) {
            case "moeda": return playCoin(interaction, bet, interaction.options.getString("lado", true) as "cara" | "coroa");
            case "dados": return playDice(interaction, bet, interaction.options.getInteger("numero", true));
            case "slots": return playSlots(interaction, bet);
            case "roleta": {
                const kind = interaction.options.getString("em", true) as RouletteBet;
                const number = interaction.options.getInteger("numero");
                if (kind === "numero" && number === null) {
                    return void interaction.reply({ components: [errorContainer(t("Escolhe o número (0 a 36) na opção `numero`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
                }
                return playRoulette(interaction, bet, kind, number);
            }
        }
    },
});

createCommand({
    name: "ship",
    description: t("Compatibilidade entre dois membros."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "membro", description: t("Primeiro membro"), type: ApplicationCommandOptionType.User, required: true },
        { name: "outro", description: t("Segundo membro (vazio = tu)"), type: ApplicationCommandOptionType.User, required: false },
        { name: "forcar", description: t("(Administração) Forçar a percentagem 😈"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 0, maxValue: 100 },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (!(await gameGate(interaction))) return;
        const a = interaction.options.getMember("membro");
        const b = interaction.options.getMember("outro") ?? interaction.member;
        if (!a) return void interaction.reply({ components: [errorContainer(t("Esse membro não está no servidor."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        let forced = interaction.options.getInteger("forcar");
        if (forced !== null) {
            const config = await ensureGuildConfig(interaction.guildId);
            const allowed = hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role) || interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
            if (!allowed) forced = null;
        }
        // A imagem (avatares + coração) demora um bocadinho a desenhar.
        await interaction.deferReply();
        const { container, files } = await buildShipMessage(a, b, forced, interaction.member);
        await interaction.editReply({ components: [container], files, flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});
