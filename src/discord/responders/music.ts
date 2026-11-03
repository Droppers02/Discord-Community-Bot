import { createEvent, createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { canControl, skipOrVote, voiceProblem } from "../../modules/music/musicControl.js";
import { checkAlone, cycleLoop, destroyQueue, nowPlayingView, shuffle, togglePause } from "../../modules/music/player.js";

// Botões do painel "A tocar".
createResponder({
    customId: "music/:action",
    types: [ResponderType.Button],
    async run(interaction, { action }) {
        if (!interaction.inCachedGuild()) return;
        const { queue, problem } = voiceProblem(interaction.member);
        if (problem || !queue) return void interaction.reply({ components: [errorContainer(problem ?? t("Não está a tocar nada."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        if (action === "skip") {
            const text = await skipOrVote(interaction.member, queue);
            return void interaction.reply({ components: [successContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        if (action !== "shuffle" && !(await canControl(interaction.member, queue))) {
            return void interaction.reply({ components: [errorContainer(t("Só a equipa ou quem pediu a música pode fazer isso."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        if (action === "stop") {
            destroyQueue(interaction.guildId, t("Parado por {user}.", { user: interaction.member.displayName }));
            return void interaction.deferUpdate();
        }
        if (action === "toggle") togglePause(queue);
        if (action === "shuffle") shuffle(queue);
        if (action === "loop") cycleLoop(queue);
        await interaction.update({ components: [nowPlayingView(queue)], allowedMentions: { parse: [] } });
    },
});

// Sair quando o bot fica sozinho no canal.
createEvent({
    name: "Música: canal vazio",
    event: "voiceStateUpdate",
    async run(oldState, newState) {
        checkAlone(newState.guild ?? oldState.guild);
    },
});
