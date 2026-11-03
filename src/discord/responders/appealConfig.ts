import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { parseCustomId } from "../../lib/ids.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildAppealContainer, buildAppealQuestionsModal, buildAppealRulesModal } from "../../modules/appeals/appealConfigView.js";
import { getAppealSettings, saveAppealSettings } from "../../modules/appeals/appealSettings.js";

// /config → Revisão de bans.

createResponder({
    customId: "appcfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getAppealSettings(guildId);
        if (interaction.isButton()) {
            if (action === "rules") return void interaction.showModal(buildAppealRulesModal(s));
            if (action === "questions") return void interaction.showModal(buildAppealQuestionsModal(s));
            if (action === "toggle") await saveAppealSettings(guildId, { enabled: !s.enabled });
            if (action === "invite") await saveAppealSettings(guildId, { invite_on_accept: !s.invite_on_accept });
            if (action === "threads") await saveAppealSettings(guildId, { discussion_threads: !s.discussion_threads });
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "channel") await saveAppealSettings(guildId, { channel: interaction.values[0] ?? null });
            if (action === "invitech") await saveAppealSettings(guildId, { invite_channel: interaction.values[0] ?? null });
        } else if (interaction.isRoleSelectMenu() && action === "ping") {
            await saveAppealSettings(guildId, { ping_role: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildAppealContainer(guildId)] });
    },
});

createResponder({
    customId: "appcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getAppealSettings(guildId);
        const value = (id: string) => interaction.fields.getTextInputValue(id);
        if (action === "rules") {
            await saveAppealSettings(guildId, {
                min_hours_after_ban: clampInt(value("hours"), s.min_hours_after_ban, 0, 720),
                cooldown_days: clampInt(value("cooldown"), s.cooldown_days, 0, 365),
                max_appeals: clampInt(value("max"), s.max_appeals, 0, 20),
            });
        } else if (action === "questions") {
            await saveAppealSettings(guildId, { questions: [value("q1"), value("q2"), value("q3")] });
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildAppealContainer(guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
