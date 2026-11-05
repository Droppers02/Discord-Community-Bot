import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags, PermissionFlagsBits, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { humanizeDuration } from "../../lib/time.js";
import { casesOf } from "../../repositories/modCaseRepository.js";
import { parseDuration } from "../../modules/giveaways/giveawayCreator.js";
import { addStaffNote, buildAllCasesView, buildMemberFile, buildNoteModal, buildTimeoutModal, buildWarnModal, deleteLastStaffNote } from "../../modules/moderation/memberFile.js";
import { hasModAccess, hierarchyProblem, MAX_TIMEOUT_MS, rankProblem, removeTimeout, timeoutMember, warnMember } from "../../modules/moderation/moderationService.js";
import { NO_FILTER } from "../../modules/moderation/purgeFilters.js";
import { startPurge, wideChannels } from "../../modules/moderation/purgeService.js";

// Ficha do membro: ficha/<ação>/<userId>.

async function deny(interaction: ButtonInteraction<"cached"> | ModalSubmitInteraction<"cached">, text: string): Promise<void> {
    const payload = { components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral } as const;
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
}

createResponder({
    customId: "ficha/:action/:userId",
    types: [ResponderType.Button],
    async run(interaction, { action, userId }) {
        if (!interaction.inCachedGuild()) return;
        if (!(await hasModAccess(interaction.member, PermissionFlagsBits.ModerateMembers))) return void deny(interaction, t("Só a equipa usa a ficha."));
        const guild = interaction.guild;

        switch (action) {
            case "note": return void interaction.showModal(buildNoteModal(userId));
            case "warn": return void interaction.showModal(buildWarnModal(userId));
            case "timeout": return void interaction.showModal(buildTimeoutModal(userId));
            case "purge": {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const since = Date.now() - 86_400_000;
                return void startPurge(interaction, {
                    channelIds: wideChannels(guild, interaction.member, since),
                    wide: true,
                    scope: { type: "periodo", since },
                    filter: { ...NO_FILTER, userId },
                    confirm: true,
                    authorHint: null,
                    fromUrl: null,
                    toUrl: null,
                });
            }
        }

        await interaction.deferUpdate();
        const user = await interaction.client.users.fetch(userId).catch(() => null);
        if (!user) return void deny(interaction, t("Não encontrei esse utilizador."));
        if (action === "cases") {
            return void interaction.editReply({ components: [buildAllCasesView(user, await casesOf(guild.id, userId, 50))], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        }
        if (action === "untimeout") {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member?.isCommunicationDisabled()) {
                const problem = hierarchyProblem(interaction.member, member, "moderate");
                if (problem) return void deny(interaction, problem);
                await removeTimeout(member, interaction.member, t("Pela ficha do membro"));
            }
        }
        if (action === "delnote") await deleteLastStaffNote(guild.id, userId);
        await interaction.editReply({ components: [await buildMemberFile(guild, user)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

createResponder({
    customId: "ficha/:action/:userId",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { action, userId }) {
        if (!interaction.inCachedGuild()) return;
        if (!(await hasModAccess(interaction.member, PermissionFlagsBits.ModerateMembers))) return void deny(interaction, t("Só a equipa usa a ficha."));
        const guild = interaction.guild;
        if (interaction.isFromMessage()) await interaction.deferUpdate();
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const user = await interaction.client.users.fetch(userId).catch(() => null);
        if (!user) return void deny(interaction, t("Não encontrei esse utilizador."));
        const member = await guild.members.fetch(userId).catch(() => null);
        let notice: string | null = null;

        if (action === "notesave") {
            await addStaffNote(guild.id, userId, interaction.user.id, interaction.fields.getTextInputValue("note").trim());
        } else if (action === "warnsave") {
            if (!member) return void deny(interaction, t("Esse membro já não está no servidor."));
            const problem = rankProblem(interaction.member, member);
            if (problem) return void deny(interaction, problem);
            const result = await warnMember(member, interaction.member, interaction.fields.getTextInputValue("reason").trim() || null);
            notice = t("Aviso dado — caso #{n}.", { n: result.entry.case_number }) + (result.escalation ? ` ${result.escalation}` : "");
        } else if (action === "timeoutsave") {
            if (!member) return void deny(interaction, t("Esse membro já não está no servidor."));
            const problem = hierarchyProblem(interaction.member, member, "moderate");
            if (problem) return void deny(interaction, problem);
            const ms = parseDuration(interaction.fields.getTextInputValue("duration"));
            if (!ms || ms < 10_000) return void deny(interaction, t("Duração inválida — usa algo como `10m`, `1h` ou `2d`."));
            const result = await timeoutMember(member, interaction.member, ms, interaction.fields.getTextInputValue("reason").trim() || null);
            notice = t("Castigo de {duration} — caso #{n}.", { duration: humanizeDuration(Math.min(ms, MAX_TIMEOUT_MS)), n: result.entry.case_number });
        }

        await interaction.editReply({ components: [await buildMemberFile(guild, user)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        if (notice) await interaction.followUp({ components: [successContainer(notice)], flags: CV2_FLAG | MessageFlags.Ephemeral }).catch(() => null);
    },
});
