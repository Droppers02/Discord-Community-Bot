import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { errorContainer } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { hasModAccess } from "../../modules/moderation/moderationService.js";
import { isLockable, locksOfGuild, lockStatusView, unlockChannel, unlockServer } from "../../modules/moderation/lockdown.js";
import { buildLockdownContainer, buildQuietRuleModal, buildRaidMinutesModal, parseHours, QUIET_MODE_CHOICES } from "../../modules/moderation/lockdownConfigView.js";
import { getLockdownSettings, MAX_QUIET_RULES, normalizeQuietRule, parseDays, saveLockdownSettings } from "../../modules/moderation/lockdownSettings.js";

// ─── /config → Trancas e horário de silêncio ─────────────────────────────────

createResponder({
    customId: "lockcfg/**",
    types: [ResponderType.Button, ResponderType.StringSelect, ResponderType.RoleSelect, ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getLockdownSettings(guildId);

        if (interaction.isButton()) {
            if (action === "addrule") return void interaction.showModal(buildQuietRuleModal(null));
            if (action === "raidmin") return void interaction.showModal(buildRaidMinutesModal(s.raid_lockdown_minutes));
            if (action === "quiet") await saveLockdownSettings(guildId, { quiet_enabled: !s.quiet_enabled });
            if (action === "announce") await saveLockdownSettings(guildId, { announce: !s.announce });
            if (action === "invites") await saveLockdownSettings(guildId, { pause_invites: !s.pause_invites });
            if (action === "raid") await saveLockdownSettings(guildId, { raid_lockdown: !s.raid_lockdown });
        } else if (interaction.isStringSelectMenu() && action === "rule") {
            const [verb, id] = (interaction.values[0] ?? "").split(":");
            const rule = s.quiet_rules.find((entry) => entry.id === id);
            if (!rule) return void interaction.update({ components: [await buildLockdownContainer(guildId)] });
            if (verb === "edit") return void interaction.showModal(buildQuietRuleModal(rule));
            if (verb === "toggle") await saveLockdownSettings(guildId, { quiet_rules: s.quiet_rules.map((entry) => entry.id === id ? { ...entry, enabled: !entry.enabled } : entry) });
            if (verb === "delete") await saveLockdownSettings(guildId, { quiet_rules: s.quiet_rules.filter((entry) => entry.id !== id) });
        } else if (interaction.isRoleSelectMenu() && action === "roles") {
            await saveLockdownSettings(guildId, { roles: interaction.values.filter((id) => id !== guildId) });
        } else if (interaction.isChannelSelectMenu() && action === "exclude") {
            await saveLockdownSettings(guildId, { excluded_channels: [...interaction.values] });
        }
        await interaction.update({ components: [await buildLockdownContainer(guildId)] });
    },
});

createResponder({
    customId: "lockcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action, systemId } = parseCustomId(interaction.customId);
        const s = await getLockdownSettings(guildId);

        if (action === "raidminsave") {
            await saveLockdownSettings(guildId, { raid_lockdown_minutes: clampInt(interaction.fields.getTextInputValue("minutes"), s.raid_lockdown_minutes, 5, 1440) });
        } else if (action === "rulesave") {
            const hours = parseHours(interaction.fields.getTextInputValue("hours"));
            if (!hours) return void replyContainer(interaction, errorContainer(t("Não percebi as horas — escreve como `03:00-08:00`.")));
            const days = parseDays(interaction.fields.getTextInputValue("days"));
            if (!days) return void replyContainer(interaction, errorContainer(t("Não percebi os dias — usa `todos`, `úteis`, `fds` ou `seg,qua,sex`.")));
            const choice = QUIET_MODE_CHOICES.find((entry) => entry.value === interaction.fields.getStringSelectValues("mode")[0]) ?? QUIET_MODE_CHOICES[0]!;
            const channels = [...(interaction.fields.getSelectedChannels("channels")?.keys() ?? [])];
            const existing = s.quiet_rules.find((rule) => rule.id === systemId);
            if (!existing && s.quiet_rules.length >= MAX_QUIET_RULES) return void replyContainer(interaction, errorContainer(t("Já tens {max} horários.", { max: MAX_QUIET_RULES })));
            const rule = normalizeQuietRule({
                ...existing,
                id: existing?.id,
                name: interaction.fields.getTextInputValue("name"),
                start: hours[0],
                end: hours[1],
                days,
                mode: choice.mode,
                slowmode: choice.slowmode,
                channels,
            });
            const rules = existing ? s.quiet_rules.map((entry) => entry.id === rule.id ? rule : entry) : [...s.quiet_rules, rule];
            await saveLockdownSettings(guildId, { quiet_rules: rules, quiet_enabled: s.quiet_enabled || !existing });
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildLockdownContainer(guildId)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});

// ─── Botões do /trancar estado ────────────────────────────────────────────────

createResponder({
    customId: "lock/:action",
    types: [ResponderType.Button],
    async run(interaction, { action }) {
        if (!interaction.inCachedGuild()) return;
        if (!(await hasModAccess(interaction.member, PermissionFlagsBits.ManageChannels))) {
            return void interaction.reply({ components: [errorContainer(t("Não tens permissão para isto."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        await interaction.deferUpdate();
        if (action === "unlockserver") await unlockServer(interaction.guild, interaction.user.id);
        if (action === "unlockmanual") {
            const locks = (await locksOfGuild(interaction.guildId)).filter((lock) => lock.source === "manual");
            for (const channelId of new Set(locks.map((lock) => lock.channel_id))) {
                const channel = interaction.guild.channels.cache.get(channelId);
                await unlockChannel(isLockable(channel) ? channel : null, interaction.guildId, channelId, locks);
            }
        }
        await interaction.editReply({ components: [await lockStatusView(interaction.guild)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});
