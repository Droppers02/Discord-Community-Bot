import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { GuildMember } from "discord.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { errorContainer } from "../../lib/containers.js";
import { replyContainer } from "../../lib/discord.js";
import { buildDashboardPayload, hasDashboardAccess, isDashboardWindow } from "../../modules/tickets/dashboard.js";
import { t } from "../../lib/i18n.js";

async function guardDashboard(interaction: import("discord.js").RepliableInteraction): Promise<boolean> {
    if (!interaction.inGuild()) return false;
    const config = await ensureGuildConfig(interaction.guildId);
    if (!hasDashboardAccess(interaction.member as GuildMember, config)) {
        await replyContainer(interaction, errorContainer(t("Apenas staff ou super-admin pode usar este dashboard.")));
        return false;
    }
    return true;
}

createResponder({
    customId: "dashboard/nav/:window/:page",
    types: [ResponderType.Button],
    async run(interaction, { window, page }) {
        if (!(await guardDashboard(interaction))) return;
        const safeWindow = isDashboardWindow(window) ? window : "7d";
        const payload = await buildDashboardPayload(interaction.guildId!, safeWindow, Number.parseInt(page, 10) || 1);
        await interaction.update({ components: payload.components });
    },
});

createResponder({
    customId: "dashboard/window/:page",
    types: [ResponderType.StringSelect],
    async run(interaction, { page }) {
        if (!(await guardDashboard(interaction))) return;
        const selected = interaction.values[0];
        const safeWindow = isDashboardWindow(selected) ? selected : "7d";
        const payload = await buildDashboardPayload(interaction.guildId!, safeWindow, Number.parseInt(page, 10) || 1);
        await interaction.update({ components: payload.components });
    },
});
