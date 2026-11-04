import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { roleGrantProblem } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { parseCustomId } from "../../lib/ids.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildVerifyContainer, buildVerifyRulesModal, buildVerifyTextsModal } from "../../modules/verification/verifyConfigView.js";
import { publishVerifyPanel } from "../../modules/verification/verifyService.js";
import { DIFFICULTIES, getVerifySettings, saveVerifySettings, YOUNG_ACTIONS, type Difficulty, type YoungAccountAction } from "../../modules/verification/verifySettings.js";

// /config → Verificação à entrada.

createResponder({
    customId: "vercfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getVerifySettings(guildId);
        let notice: string | null = null;

        if (interaction.isButton()) {
            if (action === "texts") return void interaction.showModal(buildVerifyTextsModal(s));
            if (action === "rules") return void interaction.showModal(buildVerifyRulesModal(s));
            if (action === "toggle") await saveVerifySettings(guildId, { enabled: !s.enabled });
            if (action === "dm") await saveVerifySettings(guildId, { dm_on_join: !s.dm_on_join });
            if (action === "publish") {
                const result = await publishVerifyPanel(interaction.guild);
                notice = result.ok ? `${emoji.success} ${t("Painel publicado em {channel}.", { channel: `<#${result.channelId}>` })}` : `${emoji.error} ${result.reason}`;
            }
        } else if (interaction.isChannelSelectMenu()) {
            const value = interaction.values[0] ?? null;
            // Outro canal = outro painel: o antigo deixa de ser atualizado.
            if (action === "channel") await saveVerifySettings(guildId, { channel: value, panel_message_id: value === s.channel ? s.panel_message_id : null });
            if (action === "log") await saveVerifySettings(guildId, { log_channel: value });
        } else if (interaction.isRoleSelectMenu()) {
            const value = interaction.values[0] ?? null;
            const role = value ? interaction.guild.roles.cache.get(value) : null;
            const grant = role ? roleGrantProblem(interaction.member, role, { automatic: true }) : null;
            if (grant) notice = `${emoji.error} ${grant}`;
            else if (action === "verified") await saveVerifySettings(guildId, { verified_role: value });
            else if (action === "unverified") await saveVerifySettings(guildId, { unverified_role: value });
        }
        await interaction.update({ components: [await buildVerifyContainer(guildId, notice)] });
    },
});

createResponder({
    customId: "vercfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getVerifySettings(guildId);

        if (action === "texts") {
            await saveVerifySettings(guildId, {
                panel_title: interaction.fields.getTextInputValue("title").trim() || null,
                panel_description: interaction.fields.getTextInputValue("description").trim() || null,
            });
        } else if (action === "rules") {
            const difficulty = interaction.fields.getStringSelectValues("difficulty")[0];
            const young = interaction.fields.getStringSelectValues("young")[0];
            await saveVerifySettings(guildId, {
                difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty) ? difficulty as Difficulty : s.difficulty,
                max_attempts: clampInt(interaction.fields.getTextInputValue("attempts"), s.max_attempts, 1, 10),
                kick_after_minutes: clampInt(interaction.fields.getTextInputValue("kick") || "0", 0, 0, 10_080),
                min_account_age_days: clampInt(interaction.fields.getTextInputValue("age") || "0", 0, 0, 365),
                young_account_action: (YOUNG_ACTIONS as readonly string[]).includes(young) ? young as YoungAccountAction : s.young_account_action,
            });
        }
        // Textos novos no painel já publicado.
        let notice: string | null = null;
        if (action === "texts" && s.panel_message_id) {
            const result = await publishVerifyPanel(interaction.guild);
            if (result.ok) notice = `${emoji.success} ${t("Painel atualizado.")}`;
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildVerifyContainer(guildId, notice)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
