import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { parseCustomId } from "../../lib/ids.js";
import { gateConfig } from "../../modules/config/panelKit.js";
import { buildModmailContainer, buildModmailTextsModal } from "../../modules/modmail/modmailConfigView.js";
import { getModmailSettings, saveModmailSettings } from "../../modules/modmail/modmailSettings.js";

// /config → Modmail.

createResponder({
    customId: "mmcfg/**",
    types: [ResponderType.Button, ResponderType.StringSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getModmailSettings(guildId);
        if (interaction.isButton()) {
            if (action === "texts") return void interaction.showModal(buildModmailTextsModal(s));
            if (action === "toggle") await saveModmailSettings(guildId, { enabled: !s.enabled });
            if (action === "anon") await saveModmailSettings(guildId, { anonymous_replies: !s.anonymous_replies });
        } else if (interaction.isStringSelectMenu() && action === "category") {
            await saveModmailSettings(guildId, { category: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildModmailContainer(guildId)] });
    },
});

createResponder({
    customId: "mmcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        await saveModmailSettings(guildId, {
            greeting: interaction.fields.getTextInputValue("greeting").trim() || null,
            closing: interaction.fields.getTextInputValue("closing").trim() || null,
            note_prefix: interaction.fields.getTextInputValue("prefix").trim() || "!",
        });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildModmailContainer(guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
