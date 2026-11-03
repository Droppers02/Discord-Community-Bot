import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { handleBlackjackButton } from "../../modules/games/blackjack.js";
import { handleChallengeButton } from "../../modules/games/challenge.js";
import { handleC4Button } from "../../modules/games/connect4.js";
import { isGameKey } from "../../modules/games/gameCore.js";
import { buildGameRanking } from "../../modules/games/gamesViews.js";
import { handleHangmanButton, handleHangmanModal, handleHangmanSelect } from "../../modules/games/hangman.js";
import { handleMinesButton } from "../../modules/games/mines.js";
import { handleQuizButton } from "../../modules/games/quiz.js";
import { handleRpsButton } from "../../modules/games/rps.js";
import { handleTermoButton, handleTermoModal } from "../../modules/games/termo.js";
import { handleTttButton } from "../../modules/games/tictactoe.js";

// Todos os componentes dos jogos: g/<jogo>/<id da sessão>/<ação>.

createResponder({
    customId: "g/:game/:id/:action",
    types: [ResponderType.Button],
    async run(interaction, { game, id, action }) {
        if (!interaction.inCachedGuild()) return;
        switch (game) {
            case "chal": return handleChallengeButton(interaction, id, action);
            case "ttt": return handleTttButton(interaction, id, action);
            case "c4": return handleC4Button(interaction, id, action);
            case "rps": return handleRpsButton(interaction, id, action);
            case "hm": return handleHangmanButton(interaction, id, action);
            case "quiz": return handleQuizButton(interaction, id, action);
            case "termo": return handleTermoButton(interaction, id, action);
            case "bj": return handleBlackjackButton(interaction, id, action);
            case "mines": return handleMinesButton(interaction, id, action);
            default: return void interaction.deferUpdate();
        }
    },
});

createResponder({
    customId: "g/:game/:id/:action",
    types: [ResponderType.StringSelect],
    async run(interaction, { game, id }) {
        if (!interaction.inCachedGuild()) return;
        if (game === "hm") return handleHangmanSelect(interaction, id);
        await interaction.deferUpdate();
    },
});

createResponder({
    customId: "g/:game/:id/:action",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { game, id }) {
        if (!interaction.inCachedGuild()) return;
        if (game === "hm") return handleHangmanModal(interaction, id);
        if (game === "termo") return handleTermoModal(interaction, id);
        await interaction.deferUpdate().catch(() => null);
    },
});

// /jogos → ranking por jogo.
createResponder({
    customId: "g/hub/rank",
    types: [ResponderType.StringSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const game = interaction.values[0] ?? "";
        if (!isGameKey(game)) return void interaction.deferUpdate();
        await interaction.update({ components: [await buildGameRanking(interaction.guild, game)], allowedMentions: { parse: [] } });
    },
});
