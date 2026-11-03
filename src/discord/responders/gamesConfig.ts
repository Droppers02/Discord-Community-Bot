import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { parseCustomId } from "../../lib/ids.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { parseRange } from "../../modules/economy/economyConfigView.js";
import { buildGamesContainer, buildGamesValuesModal } from "../../modules/games/gamesConfigView.js";
import { getGamesSettings, saveGamesSettings } from "../../modules/games/gamesSettings.js";

// /config → Mini-jogos.

createResponder({
    customId: "gamecfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getGamesSettings(guildId);
        if (interaction.isButton()) {
            if (action === "values") return void interaction.showModal(buildGamesValuesModal(s));
            if (action === "toggle") await saveGamesSettings(guildId, { enabled: !s.enabled });
        } else if (interaction.isChannelSelectMenu() && action === "channels") {
            await saveGamesSettings(guildId, { channels: [...interaction.values] });
        }
        await interaction.update({ components: [await buildGamesContainer(guildId)] });
    },
});

createResponder({
    customId: "gamecfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const s = await getGamesSettings(guildId);
        const bets = parseRange(interaction.fields.getTextInputValue("bets"));
        await saveGamesSettings(guildId, {
            min_bet: bets?.[0] ?? s.min_bet,
            max_bet: bets?.[1] ?? s.max_bet,
            win_reward: clampInt(interaction.fields.getTextInputValue("win"), s.win_reward, 0, 1_000_000),
            quiz_reward: clampInt(interaction.fields.getTextInputValue("quiz"), s.quiz_reward, 0, 1_000_000),
            word_reward: clampInt(interaction.fields.getTextInputValue("word"), s.word_reward, 0, 1_000_000),
            daily_word_reward: clampInt(interaction.fields.getTextInputValue("daily"), s.daily_word_reward, 0, 1_000_000),
        });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildGamesContainer(guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
