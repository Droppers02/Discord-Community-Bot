import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { buildContainer, errorContainer } from "../../lib/containers.js";
import { COLORS } from "../../lib/branding.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { timestamp } from "../../lib/time.js";
import { accountOf, buyShopItem, formatCoins } from "../../modules/economy/economyService.js";
import { getEconomySettings } from "../../modules/economy/economySettings.js";
import { buildShop } from "../../modules/economy/economyViews.js";

// Compra na /loja (menu da mensagem efémera de quem abriu a loja).
createResponder({
    customId: "eco/buy/:viewer",
    types: [ResponderType.StringSelect],
    async run(interaction, { viewer }) {
        if (!interaction.inCachedGuild()) return;
        if (viewer !== interaction.user.id) {
            return void interaction.reply({ components: [errorContainer(t("Abre a tua própria loja com `/loja`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const outcome = await buyShopItem(interaction.member, interaction.values[0] ?? "");
        const settings = await getEconomySettings(interaction.guildId);
        const account = await accountOf(interaction.guildId, interaction.user.id);
        await interaction.update({ components: [buildShop(settings, account.balance, interaction.user.id)] });
        await interaction.followUp({
            components: [outcome.ok
                ? buildContainer({
                    color: COLORS.success,
                    title: `${e("cart")} ${t("Compra feita!")}`,
                    description: [
                        t("Recebeste {role}.", { role: `<@&${outcome.item.role_id}>` }),
                        outcome.expiresAt ? t("O cargo dura até {at}.", { at: timestamp(outcome.expiresAt, "f") }) : null,
                        t("Saldo: {balance}", { balance: formatCoins(outcome.balance, settings) }),
                    ].filter(Boolean).join("\n"),
                })
                : errorContainer(outcome.reason)],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});
