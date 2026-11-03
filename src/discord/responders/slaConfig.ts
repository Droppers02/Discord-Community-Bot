import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { parseCustomId } from "../../lib/ids.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildSlaContainer, buildSlaTargetsModal, slaPriorityField } from "../../modules/sla/slaConfigView.js";
import { getSlaSettings, saveSlaSettings, type SlaSettings } from "../../modules/sla/slaSettings.js";
import { PRIORITY_ORDER } from "../../modules/tickets/priorities.js";
import type { TicketPriority } from "../../types.js";

// /config → Avisos de SLA.

createResponder({
    customId: "slacfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const settings = await getSlaSettings(guildId);
        const flip: Partial<Record<string, keyof SlaSettings>> = { toggle: "enabled", inticket: "alert_in_ticket", resolution: "resolution_alert", hours: "office_hours_only" };

        if (interaction.isButton()) {
            if (action === "targets") {
                return void interaction.showModal(buildSlaTargetsModal(settings, await ensureGuildConfig(guildId)));
            }
            const key = flip[action];
            if (key) await saveSlaSettings(guildId, { [key]: !settings[key] } as Partial<SlaSettings>);
        } else if (interaction.isChannelSelectMenu() && action === "channel") {
            await saveSlaSettings(guildId, { alert_channel: interaction.values[0] ?? null });
        } else if (interaction.isRoleSelectMenu()) {
            const role = interaction.values[0] ?? null;
            if (action === "mention") await saveSlaSettings(guildId, { mention_role: role });
            if (action === "escrole") await saveSlaSettings(guildId, { escalate_role: role });
        }
        await interaction.update({ components: [await buildSlaContainer(guildId)] });
    },
});

createResponder({
    customId: "slacfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const priority_minutes = Object.fromEntries(PRIORITY_ORDER.map((p) => {
            const raw = interaction.fields.getTextInputValue(slaPriorityField(p)).trim();
            return [p, raw ? clampInt(raw, 0, 1, 10_080) : null];
        })) as Record<TicketPriority, number | null>;
        const escalate = clampInt(interaction.fields.getTextInputValue("escalate") || "0", 0, 0, 10_080);
        await saveSlaSettings(guildId, { priority_minutes, escalate_after_minutes: escalate });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildSlaContainer(guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
