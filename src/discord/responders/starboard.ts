import { createEvent, createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { parseEmoji } from "discord.js";
import { errorContainer } from "../../lib/containers.js";
import { replyContainer } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildStarboardContainer, buildStarboardRulesModal, getStarboardSettings, handleStarReaction, saveStarboardSettings } from "../../modules/community/starboard.js";

createResponder({
    customId: "starcfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getStarboardSettings(guildId);
        if (interaction.isButton()) {
            if (action === "rules") return void interaction.showModal(buildStarboardRulesModal(s));
            if (action === "toggle") await saveStarboardSettings(guildId, { enabled: !s.enabled });
            if (action === "self") await saveStarboardSettings(guildId, { self_star: !s.self_star });
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "channel") await saveStarboardSettings(guildId, { channel: interaction.values[0] ?? null });
            if (action === "ignore") await saveStarboardSettings(guildId, { ignored_channels: [...interaction.values] });
        }
        await interaction.update({ components: [await buildStarboardContainer(guildId)] });
    },
});

createResponder({
    customId: "starcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const s = await getStarboardSettings(interaction.guildId);
        const raw = interaction.fields.getTextInputValue("emoji").trim();
        const parsed = parseEmoji(raw);
        const value = parsed?.id ?? parsed?.name ?? raw;
        if (!value) return void replyContainer(interaction, errorContainer(t("Esse emoji não é válido.")));
        await saveStarboardSettings(interaction.guildId, { emoji: value, threshold: clampInt(interaction.fields.getTextInputValue("threshold"), s.threshold, 1, 100) });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildStarboardContainer(interaction.guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});

createEvent({
    name: "Starboard: reação adicionada",
    event: "messageReactionAdd",
    async run(reaction) {
        await handleStarReaction(reaction).catch((error) => logger.warn("Starboard:", error));
    },
});

createEvent({
    name: "Starboard: reação removida",
    event: "messageReactionRemove",
    async run(reaction) {
        await handleStarReaction(reaction).catch((error) => logger.warn("Starboard:", error));
    },
});
