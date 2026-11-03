import { createCommand } from "#base";
import { ApplicationCommandType, GuildMember, MessageFlags } from "discord.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../../lib/discord.js";
import { buildConfigComponents, setConfigState } from "../../../modules/config/configPanel.js";
import { registerEphemeralPanel } from "../../../lib/ephemeralLifecycle.js";
import { t } from "../../../lib/i18n.js";

createCommand({
    name: "config",
    description: t("Configuração do EPA BOTCHI: tickets, moderação, níveis, economia, jogos e mais."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role)) {
            await interaction.reply({ components: [errorContainer(t("Apenas super-admin ou `Administrator` pode usar `/config`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        // Abre sempre no hub: cada secção guarda em direto; "Tickets" delega no assistente
        // completo (setupWizard).
        setConfigState(interaction.guildId, interaction.user.id, { section: "hub" });
        const components = await buildConfigComponents("hub", interaction.guildId, interaction.guild, interaction.user.id);
        await interaction.reply({ components, flags: CV2_FLAG | MessageFlags.Ephemeral });
        await registerEphemeralPanel(interaction);
    },
});
