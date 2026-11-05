import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { successContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { gateConfig } from "../../modules/config/panelKit.js";
import { buildFreeGamesContainer } from "../../modules/freegames/freeGamesConfigView.js";
import { checkFreeGamesNow, seedSeenOffers } from "../../modules/freegames/freeGamesService.js";
import { getFreeGamesSettings, saveFreeGamesSettings } from "../../modules/freegames/freeGamesSettings.js";
import type { PlatformKey } from "../../modules/freegames/freeGamesSources.js";

// /config → Jogos grátis.

createResponder({
    customId: "freecfg/**",
    types: [ResponderType.Button, ResponderType.StringSelect, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getFreeGamesSettings(guildId);
        if (interaction.isButton()) {
            if (action === "now") {
                await interaction.deferUpdate();
                const posted = await checkFreeGamesNow(interaction.guild);
                return void interaction.followUp({ components: [successContainer(posted ? t("Publiquei {n} jogos grátis novos.", { n: posted }) : t("Não há jogos grátis novos agora — já está tudo publicado."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            }
            if (action === "toggle") {
                await saveFreeGamesSettings(guildId, { enabled: !s.enabled });
                if (!s.enabled) await interaction.deferUpdate().then(() => seedSeenOffers(interaction.guild)).catch(() => null);
                const view = await buildFreeGamesContainer(guildId);
                return void (interaction.deferred ? interaction.editReply({ components: [view] }) : interaction.update({ components: [view] }));
            }
            if (action === "dlc") await saveFreeGamesSettings(guildId, { include_dlc: !s.include_dlc });
            if (action === "beta") await saveFreeGamesSettings(guildId, { include_beta: !s.include_beta });
            if (action === "weekly") await saveFreeGamesSettings(guildId, { weekly_epic: !s.weekly_epic });
        } else if (interaction.isStringSelectMenu() && action === "platforms") {
            await saveFreeGamesSettings(guildId, { platforms: interaction.values as PlatformKey[] });
        } else if (interaction.isChannelSelectMenu()) {
            await saveFreeGamesSettings(guildId, { channel: interaction.values[0] ?? null });
        } else if (interaction.isRoleSelectMenu()) {
            await saveFreeGamesSettings(guildId, { ping_role: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildFreeGamesContainer(guildId)] });
    },
});
