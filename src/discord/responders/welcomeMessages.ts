import { createEvent, createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { parseCustomId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";
import { gateConfig } from "../../modules/config/panelKit.js";
import { buildWelcomeMessagesContainer, buildWelcomeTextsModal, getWelcomeSettings, handleGoodbye, handleWelcome, saveWelcomeSettings } from "../../modules/community/welcomeMessages.js";

// /config → Boas-vindas, e os eventos de entrada/saída.

createResponder({
    customId: "wlcfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getWelcomeSettings(guildId);
        if (interaction.isButton()) {
            if (action === "texts") return void interaction.showModal(buildWelcomeTextsModal(s));
            if (action === "welcome") await saveWelcomeSettings(guildId, { welcome_enabled: !s.welcome_enabled });
            if (action === "goodbye") await saveWelcomeSettings(guildId, { goodbye_enabled: !s.goodbye_enabled });
            if (action === "dm") await saveWelcomeSettings(guildId, { dm_enabled: !s.dm_enabled });
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "welcomech") await saveWelcomeSettings(guildId, { welcome_channel: interaction.values[0] ?? null });
            if (action === "goodbyech") await saveWelcomeSettings(guildId, { goodbye_channel: interaction.values[0] ?? null });
        } else if (interaction.isRoleSelectMenu() && action === "roles") {
            await saveWelcomeSettings(guildId, { auto_roles: [...interaction.values] });
        }
        await interaction.update({ components: [await buildWelcomeMessagesContainer(guildId)] });
    },
});

createResponder({
    customId: "wlcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const value = (id: string) => interaction.fields.getTextInputValue(id);
        await saveWelcomeSettings(interaction.guildId, { welcome_title: value("title"), welcome_message: value("welcome"), goodbye_message: value("goodbye"), dm_message: value("dm") });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildWelcomeMessagesContainer(interaction.guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});

createEvent({
    name: "Boas-vindas",
    event: "guildMemberAdd",
    async run(member) {
        await handleWelcome(member).catch((error) => logger.warn("Boas-vindas: falha:", error));
    },
});

createEvent({
    name: "Despedidas",
    event: "guildMemberRemove",
    async run(member) {
        await handleGoodbye(member).catch((error) => logger.warn("Despedidas: falha:", error));
    },
});
