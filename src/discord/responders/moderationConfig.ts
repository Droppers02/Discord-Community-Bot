import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { errorContainer } from "../../lib/containers.js";
import { replyContainer } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { parseCustomId } from "../../lib/ids.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildExpiryModal, buildModerationContainer, buildThresholdModal } from "../../modules/moderation/moderationConfigView.js";
import { ESCALATION_ACTIONS, getModerationSettings, saveModerationSettings, type EscalationAction } from "../../modules/moderation/moderationSettings.js";

// /config → Moderação.

createResponder({
    customId: "modcfg/**",
    types: [ResponderType.Button, ResponderType.StringSelect, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getModerationSettings(guildId);
        if (interaction.isButton()) {
            if (action === "addrule") return void interaction.showModal(buildThresholdModal());
            if (action === "expiry") return void interaction.showModal(buildExpiryModal(s.warn_expiry_days));
            if (action === "dm") await saveModerationSettings(guildId, { dm_on_action: !s.dm_on_action });
        } else if (interaction.isStringSelectMenu() && action === "delrule") {
            const count = Number(interaction.values[0]);
            await saveModerationSettings(guildId, { thresholds: s.thresholds.filter((entry) => entry.count !== count) });
        } else if (interaction.isChannelSelectMenu() && action === "log") {
            await saveModerationSettings(guildId, { log_channel: interaction.values[0] ?? null });
        } else if (interaction.isRoleSelectMenu() && action === "role") {
            await saveModerationSettings(guildId, { mod_role: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildModerationContainer(guildId)] });
    },
});

createResponder({
    customId: "modcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getModerationSettings(guildId);
        if (action === "expiry") {
            await saveModerationSettings(guildId, { warn_expiry_days: clampInt(interaction.fields.getTextInputValue("days"), s.warn_expiry_days, 0, 365) });
        } else if (action === "addrule") {
            const count = clampInt(interaction.fields.getTextInputValue("count"), 0, 1, 50);
            const chosen = interaction.fields.getStringSelectValues("action")[0] ?? "timeout";
            if (!count) return void replyContainer(interaction, errorContainer(t("Indica um número de avisos entre 1 e 50.")));
            if (!(ESCALATION_ACTIONS as readonly string[]).includes(chosen)) return void replyContainer(interaction, errorContainer(t("Escolhe uma ação.")));
            const minutes = clampInt(interaction.fields.getTextInputValue("minutes") || "60", 60, 1, 40_320);
            await saveModerationSettings(guildId, { thresholds: [...s.thresholds.filter((entry) => entry.count !== count), { count, action: chosen as EscalationAction, minutes }] });
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildModerationContainer(guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
