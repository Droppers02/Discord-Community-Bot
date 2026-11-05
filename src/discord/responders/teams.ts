import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildTeamLimitsModal, buildTeamsContainer } from "../../modules/teams/teamConfigView.js";
import { acceptInvite, declineInvite, getTeam, joinTeam } from "../../modules/teams/teamService.js";
import { getTeamSettings, saveTeamSettings } from "../../modules/teams/teamSettings.js";

const ephemeral = (text: string, ok = false) => ({ components: [ok ? successContainer(text) : errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral } as const);

// ─── Convites e "Entrar na equipa" ───────────────────────────────────────────

createResponder({
    customId: "team/:action/:teamId/:userId",
    types: [ResponderType.Button],
    async run(interaction, { action, teamId, userId }) {
        if (!interaction.inCachedGuild()) return;
        if (action === "join") {
            const team = await getTeam(interaction.guildId, Number(teamId));
            if (!team) return void interaction.reply(ephemeral(t("Essa equipa já não existe.")));
            const result = await joinTeam(interaction.member, team);
            return void interaction.reply(result.ok ? ephemeral(result.text, true) : ephemeral(result.reason));
        }
        if (interaction.user.id !== userId) return void interaction.reply(ephemeral(t("Este convite não é para ti.")));
        if (action === "decline") {
            await declineInvite(interaction.guildId, Number(teamId), userId);
            return void interaction.update({ components: [successContainer(t("{user} recusou o convite.", { user: `<@${userId}>` }))], allowedMentions: { parse: [] } });
        }
        if (action === "accept") {
            const result = await acceptInvite(interaction.member, Number(teamId));
            if (!result.ok) return void interaction.reply(ephemeral(result.reason));
            return void interaction.update({ components: [successContainer(t("{user} entrou na equipa! 🎉", { user: `<@${userId}>` }))], allowedMentions: { parse: [] } });
        }
    },
});

// ─── /config → Equipas ───────────────────────────────────────────────────────

createResponder({
    customId: "teamcfg/**",
    types: [ResponderType.Button, ResponderType.RoleSelect, ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getTeamSettings(guildId);
        if (interaction.isButton()) {
            if (action === "limits") return void interaction.showModal(buildTeamLimitsModal(s));
            if (action === "toggle") await saveTeamSettings(guildId, { enabled: !s.enabled });
            if (action === "roles") await saveTeamSettings(guildId, { create_roles: !s.create_roles });
            if (action === "war") await saveTeamSettings(guildId, { weekly_war: !s.weekly_war });
        } else if (interaction.isRoleSelectMenu()) {
            await saveTeamSettings(guildId, { role_anchor: interaction.values[0] ?? null });
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "category") await saveTeamSettings(guildId, { channel_category: interaction.values[0] ?? null });
            if (action === "announce") await saveTeamSettings(guildId, { announce_channel: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildTeamsContainer(guildId)] });
    },
});

createResponder({
    customId: "teamcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const s = await getTeamSettings(interaction.guildId);
        const field = (id: string, fallback: number, min: number, max: number) => clampInt(interaction.fields.getTextInputValue(id), fallback, min, max);
        await saveTeamSettings(interaction.guildId, {
            create_cost: field("cost", s.create_cost, 0, 100_000_000),
            max_members: field("members", s.max_members, 2, 50),
            max_teams: field("teams", s.max_teams, 1, 100),
            weekly_reward: field("reward", s.weekly_reward, 0, 10_000_000),
        });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildTeamsContainer(interaction.guildId)] });
        else await replyContainer(interaction, successContainer(t("Guardado.")));
    },
});
