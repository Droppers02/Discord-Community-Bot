import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, errorContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { formatCoins } from "../../modules/economy/economyService.js";
import { getEconomySettings } from "../../modules/economy/economySettings.js";
import { executeTrade, trades } from "../../modules/economy/trades.js";

createResponder({
    customId: "trade/:action/:id",
    types: [ResponderType.Button],
    async run(interaction, { action, id }) {
        if (!interaction.inCachedGuild()) return;
        const trade = trades.get(id);
        if (!trade) return void interaction.update({ components: [buildContainer({ color: COLORS.neutral, description: t("⌛ Esta proposta expirou.") })] });
        if (interaction.user.id !== trade.toId && !(action === "decline" && interaction.user.id === trade.fromId)) {
            return void interaction.reply({ components: [errorContainer(t("Esta proposta não é para ti."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        if (action === "decline") {
            trades.delete(id);
            return void interaction.update({ components: [buildContainer({ color: COLORS.neutral, description: t("❌ Troca recusada ({user}).", { user: `<@${interaction.user.id}>` }) })], allowedMentions: { parse: [] } });
        }
        const settings = await getEconomySettings(trade.guildId);
        const problem = await executeTrade(trade.guildId, trade.fromId, trade.toId, trade.offer, trade.ask, settings.start_balance);
        if (problem) return void interaction.reply({ components: [errorContainer(problem)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        trades.delete(id);
        await interaction.update({
            components: [buildContainer({
                color: COLORS.success,
                title: `${e("transfer")} ${t("Troca feita!")}`,
                description: [
                    trade.offer ? t("{from} → {to}: {amount}", { from: `<@${trade.fromId}>`, to: `<@${trade.toId}>`, amount: formatCoins(trade.offer) }) : null,
                    trade.ask ? t("{from} → {to}: {amount}", { from: `<@${trade.toId}>`, to: `<@${trade.fromId}>`, amount: formatCoins(trade.ask) }) : null,
                ].filter(Boolean).join("\n"),
            })],
            allowedMentions: { parse: [] },
        });
    },
});
