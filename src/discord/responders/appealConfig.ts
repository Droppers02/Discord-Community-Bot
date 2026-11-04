import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags, type RepliableInteraction } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { parseCustomId } from "../../lib/ids.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildAppealContainer, buildAppealGuildModal, buildAppealQuestionsModal, buildAppealRulesModal } from "../../modules/appeals/appealConfigView.js";
import { appealInviteUrl } from "../../modules/appeals/appealGuild.js";
import { postAppealPanel } from "../../modules/appeals/appealService.js";
import { getAppealSettings, saveAppealSettings } from "../../modules/appeals/appealSettings.js";

// /config → Revisão de bans.

async function note(interaction: RepliableInteraction, ok: boolean, text: string): Promise<void> {
    await interaction.followUp({ components: [ok ? successContainer(text) : errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral }).catch(() => null);
}

/** Convite + painel no servidor de apelos; devolve o texto para mostrar a quem configurou. */
async function setUpAppealGuild(interaction: RepliableInteraction<"cached">): Promise<{ ok: boolean; text: string }> {
    const invite = await appealInviteUrl(interaction.client);
    const panel = await postAppealPanel(interaction.client, interaction.guild);
    if (!panel.ok) return { ok: false, text: panel.reason };
    return {
        ok: Boolean(invite),
        text: [
            t("Painel publicado em <#{channel}>.", { channel: panel.channelId }),
            invite ? t("Convite para quem for banido: {url}", { url: invite }) : t("Não consegui criar o convite — dá ao bot a permissão **Criar convite** nesse servidor."),
        ].join("\n"),
    };
}

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
            if (action === "appealguild") return void interaction.showModal(buildAppealGuildModal(s));
            if (action === "panel") {
                await interaction.deferUpdate();
                const result = await setUpAppealGuild(interaction);
                await interaction.editReply({ components: [await buildAppealContainer(guildId, interaction.client)] });
                return note(interaction, result.ok, result.text);
            }
            if (action === "toggle") await saveAppealSettings(guildId, { enabled: !s.enabled });
            if (action === "invite") await saveAppealSettings(guildId, { invite_on_accept: !s.invite_on_accept });
            if (action === "threads") await saveAppealSettings(guildId, { discussion_threads: !s.discussion_threads });
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "channel") await saveAppealSettings(guildId, { channel: interaction.values[0] ?? null });
            if (action === "invitech") await saveAppealSettings(guildId, { invite_channel: interaction.values[0] ?? null });
        } else if (interaction.isRoleSelectMenu() && action === "ping") {
            await saveAppealSettings(guildId, { ping_role: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildAppealContainer(guildId, interaction.client)] });
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
        // Definir o servidor de apelos cria o convite e publica o painel — pode passar dos 3 s.
        await interaction.deferUpdate().catch(() => null);
        let result: { ok: boolean; text: string } | null = null;
        if (action === "rules") {
            await saveAppealSettings(guildId, {
                min_hours_after_ban: clampInt(value("hours"), s.min_hours_after_ban, 0, 720),
                cooldown_days: clampInt(value("cooldown"), s.cooldown_days, 0, 365),
                max_appeals: clampInt(value("max"), s.max_appeals, 0, 20),
            });
        } else if (action === "questions") {
            await saveAppealSettings(guildId, { questions: [value("q1"), value("q2"), value("q3")] });
        } else if (action === "appealguild") {
            const id = value("guild").trim();
            if (!id) {
                await saveAppealSettings(guildId, { appeal_guild: null, appeal_invite: null });
                result = { ok: true, text: t("Servidor de apelos desligado. Atenção: sem ele, quem for banido não consegue pedir revisão.") };
            } else if (!/^\d{15,25}$/.test(id) || id === guildId || !interaction.client.guilds.cache.has(id)) {
                result = { ok: false, text: t("O bot não está nesse servidor (ou o ID não é válido). Adiciona-o primeiro com o botão **Adicionar o bot a um servidor** e tenta outra vez.") };
            } else {
                await saveAppealSettings(guildId, { appeal_guild: id, appeal_invite: s.appeal_guild === id ? s.appeal_invite : null });
                result = await setUpAppealGuild(interaction);
            }
        }
        if (interaction.isFromMessage()) await interaction.editReply({ components: [await buildAppealContainer(guildId, interaction.client)] }).catch(() => null);
        if (result) await note(interaction, result.ok, result.text);
    },
});
