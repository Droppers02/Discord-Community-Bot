import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { gateConfig } from "../../modules/config/panelKit.js";
import { buildMemberWrapped, buildWrappedContainer, getWrappedSettings, saveWrappedSettings } from "../../modules/wrapped/wrappedService.js";
import type { WrappedPeriod } from "../../modules/wrapped/wrappedStats.js";

// "Ver o meu Wrapped" (na retrospetiva do servidor) → a do membro, só para ele.

createResponder({
    customId: "wrapped/me/:period",
    types: [ResponderType.Button],
    async run(interaction, { period }) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { container, files } = await buildMemberWrapped(interaction.guild, interaction.user, period as WrappedPeriod);
        await interaction.editReply({ components: [container], files, flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

// ─── /config → EPA Wrapped ───────────────────────────────────────────────────

createResponder({
    customId: "wrappedcfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getWrappedSettings(guildId);
        if (interaction.isButton()) {
            if (action === "toggle") await saveWrappedSettings(guildId, { enabled: !s.enabled });
            if (action === "monthly") await saveWrappedSettings(guildId, { monthly_post: !s.monthly_post });
        } else if (interaction.isChannelSelectMenu()) {
            await saveWrappedSettings(guildId, { channel: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildWrappedContainer(guildId)] });
    },
});
