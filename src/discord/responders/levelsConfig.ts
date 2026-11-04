import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { errorContainer } from "../../lib/containers.js";
import { replyContainer, roleGrantProblem } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { parseCustomId } from "../../lib/ids.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { ANNOUNCE_MODES, getLevelsSettings, saveLevelsSettings, type AnnounceMode } from "../../modules/levels/levelSettings.js";
import { buildLevelsContainer, buildLevelsXpModal, buildMultiplierModal, buildRewardModal } from "../../modules/levels/levelsConfigView.js";

// /config → Níveis e XP.

createResponder({
    customId: "lvlcfg/**",
    types: [ResponderType.Button, ResponderType.StringSelect, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getLevelsSettings(guildId);

        if (interaction.isButton()) {
            if (action === "xp") return void interaction.showModal(buildLevelsXpModal(s));
            if (action === "reward") return void interaction.showModal(buildRewardModal());
            if (action === "mult") return void interaction.showModal(buildMultiplierModal());
            if (action === "toggle") await saveLevelsSettings(guildId, { enabled: !s.enabled });
            if (action === "stack") await saveLevelsSettings(guildId, { stack_rewards: !s.stack_rewards });
        } else if (interaction.isStringSelectMenu()) {
            const value = interaction.values[0] ?? "";
            if (action === "mode" && (ANNOUNCE_MODES as readonly string[]).includes(value)) await saveLevelsSettings(guildId, { announce_mode: value as AnnounceMode });
            if (action === "remove") {
                const [kind, roleId] = value.split(":");
                if (kind === "r") await saveLevelsSettings(guildId, { rewards: s.rewards.filter((r) => r.role_id !== roleId) });
                if (kind === "m") await saveLevelsSettings(guildId, { multipliers: s.multipliers.filter((m) => m.role_id !== roleId) });
            }
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "channel") await saveLevelsSettings(guildId, { announce_channel: interaction.values[0] ?? null });
            if (action === "ignchan") await saveLevelsSettings(guildId, { ignored_channels: [...interaction.values] });
        } else if (interaction.isRoleSelectMenu() && action === "ignrole") {
            await saveLevelsSettings(guildId, { ignored_roles: [...interaction.values] });
        }
        await interaction.update({ components: [await buildLevelsContainer(guildId)] });
    },
});

createResponder({
    customId: "lvlcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getLevelsSettings(guildId);

        if (action === "xp") {
            const min = clampInt(interaction.fields.getTextInputValue("min"), s.xp_min, 1, 500);
            await saveLevelsSettings(guildId, {
                xp_min: min,
                xp_max: Math.max(min, clampInt(interaction.fields.getTextInputValue("max"), s.xp_max, 1, 500)),
                cooldown_seconds: clampInt(interaction.fields.getTextInputValue("cooldown"), s.cooldown_seconds, 0, 3600),
                voice_xp_per_minute: clampInt(interaction.fields.getTextInputValue("voice"), s.voice_xp_per_minute, 0, 100),
                announce_message: interaction.fields.getTextInputValue("message").trim() || null,
            });
        } else if (action === "reward" || action === "mult") {
            const roleId = interaction.fields.getSelectedRoles("role")?.first()?.id;
            const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;
            if (!role) return void replyContainer(interaction, errorContainer(t("Escolhe um cargo.")));
            if (role.managed || role.id === interaction.guild.id) return void replyContainer(interaction, errorContainer(t("Esse cargo não pode ser dado pelo bot.")));
            if (action === "reward") {
                if (!role.editable) return void replyContainer(interaction, errorContainer(t("O cargo {role} está acima do cargo do bot — sobe o cargo do bot na lista de cargos do servidor.", { role: `<@&${role.id}>` })));
                const grant = roleGrantProblem(interaction.member, role, { automatic: true });
                if (grant) return void replyContainer(interaction, errorContainer(grant));
                const level = clampInt(interaction.fields.getTextInputValue("level"), 0, 1, 500);
                if (!level) return void replyContainer(interaction, errorContainer(t("Indica um nível entre 1 e 500.")));
                await saveLevelsSettings(guildId, { rewards: [...s.rewards.filter((r) => r.role_id !== role.id), { level, role_id: role.id }] });
            } else {
                const value = Number(interaction.fields.getTextInputValue("value").replace(",", "."));
                if (!Number.isFinite(value) || value < 1.1 || value > 5) return void replyContainer(interaction, errorContainer(t("O multiplicador tem de estar entre 1.1 e 5.")));
                await saveLevelsSettings(guildId, { multipliers: [...s.multipliers.filter((m) => m.role_id !== role.id), { role_id: role.id, multiplier: value }] });
            }
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildLevelsContainer(guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
