import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { parseCustomId } from "../../lib/ids.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildProtectionContainer, buildRaidModal, buildSlowmodeModal, buildWordsModal } from "../../modules/protection/protectionConfigView.js";
import { FILTER_ACTIONS, getProtectionSettings, RAID_ACTIONS, saveProtectionSettings, type FilterAction, type RaidAction } from "../../modules/protection/protectionSettings.js";

// /config → Proteção.

createResponder({
    customId: "protcfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getProtectionSettings(guildId);
        if (interaction.isButton()) {
            if (action === "wordsedit") return void interaction.showModal(buildWordsModal(s));
            if (action === "raidedit") return void interaction.showModal(buildRaidModal(s));
            if (action === "slowedit") return void interaction.showModal(buildSlowmodeModal(s));
            if (action === "words") await saveProtectionSettings(guildId, { word_filter_enabled: !s.word_filter_enabled });
            if (action === "adult") await saveProtectionSettings(guildId, { adult_filter_enabled: !s.adult_filter_enabled });
            if (action === "raid") await saveProtectionSettings(guildId, { raid_enabled: !s.raid_enabled });
            if (action === "slow") await saveProtectionSettings(guildId, { slowmode_enabled: !s.slowmode_enabled });
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "exemptch") await saveProtectionSettings(guildId, { exempt_channels: [...interaction.values] });
            if (action === "slowch") await saveProtectionSettings(guildId, { slowmode_channels: [...interaction.values] });
        } else if (interaction.isRoleSelectMenu() && action === "exemptrole") {
            await saveProtectionSettings(guildId, { exempt_roles: [...interaction.values] });
        }
        await interaction.update({ components: [await buildProtectionContainer(guildId)] });
    },
});

createResponder({
    customId: "protcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getProtectionSettings(guildId);
        const value = (id: string) => interaction.fields.getTextInputValue(id);
        if (action === "wordsedit") {
            const chosen = interaction.fields.getStringSelectValues("action")[0] ?? s.filter_action;
            await saveProtectionSettings(guildId, {
                words: value("words").split(/[\n,;]+/).map((word) => word.trim()).filter(Boolean),
                filter_action: (FILTER_ACTIONS as readonly string[]).includes(chosen) ? (chosen as FilterAction) : s.filter_action,
                filter_timeout_minutes: clampInt(value("minutes"), s.filter_timeout_minutes, 1, 40_320),
            });
        } else if (action === "raidedit") {
            const chosen = interaction.fields.getStringSelectValues("action")[0] ?? s.raid_action;
            await saveProtectionSettings(guildId, {
                raid_joins: clampInt(value("joins"), s.raid_joins, 3, 100),
                raid_seconds: clampInt(value("seconds"), s.raid_seconds, 5, 3600),
                raid_action: (RAID_ACTIONS as readonly string[]).includes(chosen) ? (chosen as RaidAction) : s.raid_action,
                raid_pause_minutes: clampInt(value("pause"), s.raid_pause_minutes, 5, 1440),
            });
        } else if (action === "slowedit") {
            await saveProtectionSettings(guildId, {
                slowmode_messages: clampInt(value("messages"), s.slowmode_messages, 5, 200),
                slowmode_window_seconds: clampInt(value("window"), s.slowmode_window_seconds, 3, 120),
                slowmode_seconds: clampInt(value("seconds"), s.slowmode_seconds, 1, 21_600),
                slowmode_duration_minutes: clampInt(value("minutes"), s.slowmode_duration_minutes, 1, 1440),
            });
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildProtectionContainer(guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
