import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { GuildMember, MessageFlags, type RepliableInteraction } from "discord.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getEmbedColor, getFooterText } from "../../lib/branding.js";
import { buildContainer, errorContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { parseCustomId } from "../../lib/ids.js";
import { getReactionRoleSettings } from "../../modules/community/communitySettings.js";
import { applyRoleSelection } from "../../modules/community/reactionRoles.js";
import type { RoleToggleResult } from "../../modules/community/reactionRoles.js";
import { t } from "../../lib/i18n.js";

// rr/toggle/<panelId>/<roleId> (botões) e rr/select/<panelId> (menu).

/** Resposta ao membro, em container — o resto do bot não fala por texto solto. */
async function respond(interaction: RepliableInteraction, guildId: string, result: RoleToggleResult): Promise<void> {
    const config = await ensureGuildConfig(guildId);
    const fields = [
        ...(result.added.length ? [{ name: `${emoji.add} ${t("Cargos recebidos")}`, value: result.added.map((id) => `<@&${id}>`).join(", ") }] : []),
        ...(result.removed.length ? [{ name: `${emoji.remove} ${t("Cargos removidos")}`, value: result.removed.map((id) => `<@&${id}>`).join(", ") }] : []),
        ...(result.failed.length ? [{ name: `${emoji.warn} ${t("Sem permissão para")}`, value: result.failed.map((id) => `<@&${id}>`).join(", ") }] : []),
    ];

    await interaction.reply({
        components: [buildContainer({
            color: getEmbedColor(config),
            thumbnailUrl: config.branding_logo,
            title: fields.length ? `${emoji.role} ${t("Cargos atualizados")}` : `${emoji.info} ${t("Sem alterações")}`,
            description: fields.length ? null : t("Os teus cargos ficaram exatamente como estavam."),
            fields,
            footerText: getFooterText(config),
        })],
        flags: CV2_FLAG | MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
    });
}

createResponder({
    customId: "rr/**",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const { action, systemId, extra } = parseCustomId(interaction.customId);
        const entityId = extra;
        if (action !== "toggle" || !systemId || !entityId) return;

        const settings = await getReactionRoleSettings(interaction.guildId);
        const panel = settings.panels.find((entry) => entry.id === systemId);
        if (!panel || !panel.roles.some((entry) => entry.role_id === entityId)) {
            await interaction.reply({ components: [errorContainer(t("Este painel já não está ativo."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }
        const result = await applyRoleSelection(interaction.member as GuildMember, panel, [], entityId);
        await respond(interaction, interaction.guildId, result);
    },
});

createResponder({
    customId: "rr/**",
    types: [ResponderType.StringSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const { action, systemId } = parseCustomId(interaction.customId);
        if (action !== "select" || !systemId) return;

        const settings = await getReactionRoleSettings(interaction.guildId);
        const panel = settings.panels.find((entry) => entry.id === systemId);
        if (!panel) {
            await interaction.reply({ components: [errorContainer(t("Este painel já não está ativo."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }
        const result = await applyRoleSelection(interaction.member as GuildMember, panel, interaction.values);
        await respond(interaction, interaction.guildId, result);
    },
});
