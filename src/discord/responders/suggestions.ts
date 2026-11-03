import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    GuildMember,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { buildContainer, errorContainer, noticeContainer, row, successContainer } from "../../lib/containers.js";
import { COLORS } from "../../lib/branding.js";
import { CV2_FLAG, hasSuperAdminAccess, replyContainer } from "../../lib/discord.js";
import { registerEphemeralPanel } from "../../lib/ephemeralLifecycle.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId, decodeExtraParts, parseCustomId } from "../../lib/ids.js";
import { applyVote, setSuggestionStatus } from "../../repositories/suggestionRepository.js";
import {
    buildSuggestionContainer,
    buildSuggestionStaffPanel,
    canChangeSuggestionStatus,
    finalizeSuggestionThread,
    getSuggestion,
    isTerminalSuggestion,
    isVotingOpen,
    refreshSuggestionMessage,
    submitSuggestion,
    SUGGESTION_STATUS_LABELS,
} from "../../modules/suggestions/suggestionManager.js";
import { getSuggestionSettings } from "../../modules/suggestions/suggestionSettings.js";
import { SUGGESTION_STATUSES, type SuggestionStatus } from "../../types.js";
import { t } from "../../lib/i18n.js";

async function isManager(guildId: string, member: GuildMember): Promise<boolean> {
    const config = await ensureGuildConfig(guildId);
    if (hasSuperAdminAccess(member, config.admin_role)) return true;
    const settings = await getSuggestionSettings(guildId);
    return settings.manager_role ? member.roles.cache.has(settings.manager_role) : false;
}

function isStatusAction(value: string): value is SuggestionStatus {
    return (SUGGESTION_STATUSES as readonly string[]).includes(value);
}

// ─── Buttons (votes + staff actions) ────────────────────────────────────────
createResponder({
    customId: "suggestion/**",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const { action, systemId: suggestionId } = parseCustomId(interaction.customId);

        const suggestion = await getSuggestion(suggestionId);
        if (!suggestion) {
            await replyContainer(interaction, errorContainer(t("Esta sugestão já não existe.")));
            return;
        }

        if (action === "up" || action === "down") {
            if (!isVotingOpen(suggestion.status)) {
                await replyContainer(interaction, errorContainer(t("A votação desta sugestão já está encerrada.")));
                return;
            }
            const tally = await applyVote(suggestionId, interaction.user.id, action === "up" ? 1 : -1);
            if (!tally) {
                await replyContainer(interaction, errorContainer(t("Não foi possível registar o voto.")));
                return;
            }
            await interaction.update({ components: [buildSuggestionContainer({ ...suggestion, ...tally })] });
            return;
        }

        if (action === "staffpanel") {
            if (!(await isManager(interaction.guildId, interaction.member))) {
                await replyContainer(interaction, errorContainer(t("Apenas a equipa de moderação pode gerir sugestões.")));
                return;
            }
            await interaction.reply({ components: [buildSuggestionStaffPanel(suggestion)] as never, flags: CV2_FLAG | MessageFlags.Ephemeral });
            await registerEphemeralPanel(interaction);
            return;
        }

        if (isStatusAction(action)) {
            if (!(await isManager(interaction.guildId, interaction.member))) {
                await replyContainer(interaction, errorContainer(t("Apenas a equipa de moderação pode alterar o estado das sugestões.")));
                return;
            }
            if (!canChangeSuggestionStatus(suggestion.status, action)) {
                await replyContainer(interaction, errorContainer(t("Uma sugestão aprovada não pode voltar a **Em análise** nem a **Recusada** — só pode ser **Implementada**.")));
                return;
            }
            await interaction.showModal(
                new ModalBuilder()
                    .setCustomId(buildCustomId("suggestion", "reason", action, suggestionId))
                    .setTitle(t("{status} — sugestão", { status: t(SUGGESTION_STATUS_LABELS[action].label) }).slice(0, 45))
                    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder().setCustomId("reason").setLabel(t("Resposta da equipa (opcional)")).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000),
                    )),
            );
            return;
        }

        await interaction.deferUpdate();
    },
});

// ─── Modals (submit + status reason) ────────────────────────────────────────
createResponder({
    customId: "suggestion/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const { action, systemId, extra } = parseCustomId(interaction.customId);

        if (action === "submit") {
            const content = interaction.fields.getTextInputValue("content").trim();
            const result = await submitSuggestion(interaction.client, {
                guildId: interaction.guildId,
                authorId: interaction.user.id,
                authorTag: interaction.user.username,
                content,
            });
            if (!result.ok) {
                await replyContainer(interaction, errorContainer(result.reason === "no_channel" ? t("Canal de sugestões não configurado.") : t("O canal de sugestões configurado é inválido.")));
                return;
            }

            const { suggestion } = result;
            const buttons: ButtonBuilder[] = [];
            if (suggestion.message_id) {
                buttons.push(new ButtonBuilder().setLabel(t("Ver a tua sugestão")).setEmoji(emoji.megaphone).setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${suggestion.guild_id}/${suggestion.channel_id}/${suggestion.message_id}`));
            }
            if (suggestion.thread_id) {
                buttons.push(new ButtonBuilder().setLabel(t("Discutir na thread")).setEmoji(emoji.message).setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${suggestion.guild_id}/${suggestion.thread_id}`));
            }
            await replyContainer(interaction, buildContainer({
                color: COLORS.success,
                title: `${emoji.success} ${t("Sugestão enviada")}`,
                description: t("Obrigado pelo contributo! A tua sugestão já está publicada e aberta a votação."),
                rows: buttons.length ? [row(...buttons)] : undefined,
            }), { persist: buttons.length > 0 });
            return;
        }

        if (action === "reason") {
            if (!(await isManager(interaction.guildId, interaction.member))) {
                await replyContainer(interaction, errorContainer(t("Apenas a equipa de moderação pode alterar o estado das sugestões.")));
                return;
            }
            const status = systemId;
            const [suggestionId] = decodeExtraParts(extra);
            if (!isStatusAction(status) || !suggestionId) {
                await replyContainer(interaction, errorContainer(t("Sugestão inválida.")));
                return;
            }
            const current = await getSuggestion(suggestionId);
            if (current && !canChangeSuggestionStatus(current.status, status)) {
                await replyContainer(interaction, errorContainer(t("Uma sugestão aprovada não pode voltar a **Em análise** nem a **Recusada**.")));
                return;
            }
            const reason = interaction.fields.getTextInputValue("reason").trim() || null;
            await setSuggestionStatus(suggestionId, status, interaction.user.id, reason);
            const updated = await getSuggestion(suggestionId);
            if (!updated) {
                await replyContainer(interaction, errorContainer(t("Sugestão não encontrada.")));
                return;
            }

            // The status modal is opened from the ephemeral staff panel, so always edit the
            // PUBLIC suggestion message, then confirm on the panel/notice.
            await refreshSuggestionMessage(interaction.client, updated);
            const confirm = successContainer(t("Sugestão marcada como **{status}**.", { status: t(SUGGESTION_STATUS_LABELS[status].label) }));
            if (interaction.isFromMessage()) await interaction.update({ components: [confirm] });
            else await replyContainer(interaction, confirm);

            // Implemented/denied = complete: lock & archive the discussion thread.
            if (isTerminalSuggestion(status)) {
                await finalizeSuggestionThread(interaction.client, updated);
            }

            // Best-effort DM to the author with a button linking back to the suggestion.
            const suggestionUrl = updated.message_id ? `https://discord.com/channels/${updated.guild_id}/${updated.channel_id}/${updated.message_id}` : null;
            const dmRows = suggestionUrl ? [row(new ButtonBuilder().setLabel(t("Ver sugestão")).setEmoji(emoji.megaphone).setStyle(ButtonStyle.Link).setURL(suggestionUrl))] : [];
            void interaction.client.users.fetch(updated.author_id)
                .then((user) => user.send({ components: [noticeContainer({ title: `${emoji.megaphone} ${t("Atualização da tua sugestão")}`, description: `${t("A tua sugestão foi marcada como **{status}**.", { status: t(SUGGESTION_STATUS_LABELS[status].label) })}${reason ? `\n\n**${t("Resposta:")}** ${reason}` : ""}`, rows: dmRows })], flags: CV2_FLAG }))
                .catch(() => null);
            return;
        }

        await interaction.deferUpdate();
    },
});
