import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildGameModal, buildLfgContainer, buildLfgLimitsModal } from "../../modules/lfg/lfgConfigView.js";
import { getGroup, groupAction, importGamesFromRolePanels } from "../../modules/lfg/lfgService.js";
import { getLfgSettings, MAX_LFG_GAMES, normalizeGame, saveLfgSettings } from "../../modules/lfg/lfgSettings.js";
import { hasModAccess } from "../../modules/moderation/moderationService.js";

// ─── Botões dos grupos ───────────────────────────────────────────────────────

createResponder({
    customId: "lfg/:action/:id",
    types: [ResponderType.Button],
    async run(interaction, { action, id }) {
        if (!interaction.inCachedGuild()) return;
        const group = await getGroup(id);
        if (!group || group.guild_id !== interaction.guildId) {
            return void interaction.reply({ components: [errorContainer(t("Este grupo já não existe."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const staff = await hasModAccess(interaction.member, PermissionFlagsBits.ManageMessages);
        const result = await groupAction(interaction.member, group, action, staff);
        if (!result.ok) return void interaction.editReply({ components: [errorContainer(result.reason)], flags: CV2_FLAG });
        const done: Record<string, string> = { join: t("Estás dentro! 🎮"), leave: t("Saíste do grupo."), start: t("Bom jogo! 🚀"), close: t("Grupo fechado.") };
        await interaction.editReply({ components: [successContainer(result.notice ?? done[action] ?? t("Feito."))], flags: CV2_FLAG });
    },
});

// ─── /config → Procurar grupo ────────────────────────────────────────────────

createResponder({
    customId: "lfgcfg/**",
    types: [ResponderType.Button, ResponderType.StringSelect, ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getLfgSettings(guildId);
        if (interaction.isButton()) {
            if (action === "add") return void interaction.showModal(buildGameModal(null));
            if (action === "limits") return void interaction.showModal(buildLfgLimitsModal(s));
            if (action === "toggle") await saveLfgSettings(guildId, { enabled: !s.enabled });
            if (action === "ping") await saveLfgSettings(guildId, { ping_role: !s.ping_role });
            if (action === "import") {
                const added = await importGamesFromRolePanels(guildId);
                await interaction.update({ components: [await buildLfgContainer(guildId)] });
                return void interaction.followUp({ components: [added ? successContainer(t("{n} jogos importados dos auto-cargos.", { n: added })) : errorContainer(t("Não encontrei jogos novos nos painéis de auto-cargos."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            }
        } else if (interaction.isStringSelectMenu() && action === "game") {
            const [verb, key] = (interaction.values[0] ?? "").split(":");
            const game = s.games.find((entry) => entry.key === key);
            if (game && verb === "edit") return void interaction.showModal(buildGameModal(game));
            if (game && verb === "delete") await saveLfgSettings(guildId, { games: s.games.filter((entry) => entry.key !== key) });
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "channel") await saveLfgSettings(guildId, { channel: interaction.values[0] ?? null });
            if (action === "category") await saveLfgSettings(guildId, { voice_category: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildLfgContainer(guildId)] });
    },
});

createResponder({
    customId: "lfgcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action, systemId } = parseCustomId(interaction.customId);
        const s = await getLfgSettings(guildId);
        if (action === "limitssave") {
            await saveLfgSettings(guildId, {
                max_open_per_user: clampInt(interaction.fields.getTextInputValue("max"), s.max_open_per_user, 1, 10),
                expire_hours: clampInt(interaction.fields.getTextInputValue("hours"), s.expire_hours, 1, 48),
            });
        } else if (action === "gamesave") {
            const existing = s.games.find((entry) => entry.key === systemId);
            const role = interaction.fields.getSelectedRoles("role")?.first()?.id ?? null;
            const game = normalizeGame({
                key: existing?.key,
                name: interaction.fields.getTextInputValue("name"),
                emoji: interaction.fields.getTextInputValue("emoji"),
                size: Number(interaction.fields.getTextInputValue("size")),
                role_id: role,
            });
            if (!game) return void replyContainer(interaction, errorContainer(t("Dá um nome ao jogo.")));
            if (!existing && s.games.length >= MAX_LFG_GAMES) return void replyContainer(interaction, errorContainer(t("Já tens {max} jogos.", { max: MAX_LFG_GAMES })));
            const games = existing ? s.games.map((entry) => entry.key === existing.key ? game : entry) : [...s.games.filter((entry) => entry.key !== game.key), game];
            await saveLfgSettings(guildId, { games });
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildLfgContainer(guildId)] });
        else await replyContainer(interaction, successContainer(t("Guardado.")));
    },
});
