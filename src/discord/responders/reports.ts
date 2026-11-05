import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildMemberFile } from "../../modules/moderation/memberFile.js";
import { hasModAccess } from "../../modules/moderation/moderationService.js";
import { buildReportLimitsModal, buildReportsContainer } from "../../modules/reports/reportConfigView.js";
import { claimReport, dismissReport, getReport, isReportReason, resolveReport, submitReport } from "../../modules/reports/reportService.js";
import { getReportSettings, saveReportSettings } from "../../modules/reports/reportSettings.js";

// ─── Denunciar (modal do botão direito) ──────────────────────────────────────

createResponder({
    customId: "report/submit/:channelId/:messageId",
    types: [ResponderType.Modal],
    async run(interaction, { channelId, messageId }) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const fail = (text: string) => interaction.editReply({ components: [errorContainer(text)], flags: CV2_FLAG });
        const reason = interaction.fields.getStringSelectValues("reason")[0] ?? "outro";
        if (!isReportReason(reason)) return void fail(t("Motivo inválido."));
        const channel = interaction.guild.channels.cache.get(channelId);
        const message = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;
        if (!message) return void fail(t("Essa mensagem já foi apagada — se ainda for preciso, abre um ticket."));
        const evidence = interaction.fields.getUploadedFiles("evidence")?.values() ?? [];
        const outcome = await submitReport(interaction.member, message, reason, interaction.fields.getTextInputValue("details").trim() || null, evidence);
        if (!outcome.ok) return void fail(outcome.reason);
        await interaction.editReply({
            components: [successContainer([
                outcome.merged ? t("Juntei a tua denúncia à que já existia (#{id}) — a equipa vai ver. Obrigado!", { id: outcome.id }) : t("Denúncia **#{id}** enviada à equipa. Obrigado por ajudares! 💙", { id: outcome.id }),
                outcome.hidden ? `-# ${t("A mensagem foi escondida até a equipa decidir.")}` : null,
                `-# ${t("Ninguém além da equipa sabe que denunciaste.")}`,
            ].filter(Boolean).join("\n"))],
            flags: CV2_FLAG,
        });
    },
});

// ─── Cartão da equipa ────────────────────────────────────────────────────────

createResponder({
    customId: "report/:action/:id",
    types: [ResponderType.Button, ResponderType.StringSelect],
    async run(interaction, { action, id }) {
        if (!interaction.inCachedGuild()) return;
        if (!(await hasModAccess(interaction.member, PermissionFlagsBits.ModerateMembers))) {
            return void interaction.reply({ components: [errorContainer(t("Só a equipa trata das denúncias."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const report = await getReport(interaction.guildId, Number(id));
        if (!report) return void interaction.reply({ components: [errorContainer(t("Essa denúncia já não existe."))], flags: CV2_FLAG | MessageFlags.Ephemeral });

        if (action === "file") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const user = await interaction.client.users.fetch(report.author_id).catch(() => null);
            if (!user) return void interaction.editReply({ components: [errorContainer(t("Não encontrei o autor."))], flags: CV2_FLAG });
            return void interaction.editReply({ components: [await buildMemberFile(interaction.guild, user)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        }
        if (report.status === "resolved" || report.status === "dismissed") {
            return void interaction.reply({ components: [errorContainer(t("Esta denúncia já foi tratada."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }

        await interaction.deferUpdate();
        if (action === "claim") return void claimReport(interaction.guild, report, interaction.user.id);
        if (action === "dismiss") return void dismissReport(interaction.guild, report, interaction.user.id);
        if (action === "resolve" && interaction.isStringSelectMenu()) {
            const problem = await resolveReport(interaction.guild, report, interaction.member, interaction.values[0] ?? "");
            if (problem) await interaction.followUp({ components: [errorContainer(problem)], flags: CV2_FLAG | MessageFlags.Ephemeral }).catch(() => null);
        }
    },
});

// ─── /config → Denúncias ─────────────────────────────────────────────────────

createResponder({
    customId: "reportcfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getReportSettings(guildId);
        if (interaction.isButton()) {
            if (action === "limits") return void interaction.showModal(buildReportLimitsModal(s));
            if (action === "toggle") await saveReportSettings(guildId, { enabled: !s.enabled });
            if (action === "notify") await saveReportSettings(guildId, { notify_reporter: !s.notify_reporter });
            if (action === "anon") await saveReportSettings(guildId, { anonymous: !s.anonymous });
        } else if (interaction.isChannelSelectMenu()) {
            await saveReportSettings(guildId, { channel: interaction.values[0] ?? null });
        } else if (interaction.isRoleSelectMenu()) {
            await saveReportSettings(guildId, { ping_role: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildReportsContainer(guildId)] });
    },
});

createResponder({
    customId: "reportcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const s = await getReportSettings(interaction.guildId);
        await saveReportSettings(interaction.guildId, {
            cooldown_minutes: clampInt(interaction.fields.getTextInputValue("cooldown"), s.cooldown_minutes, 0, 1440),
            auto_hide: clampInt(interaction.fields.getTextInputValue("autohide"), s.auto_hide, 0, 20),
        });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildReportsContainer(interaction.guildId)] });
        else await replyContainer(interaction, successContainer(t("Guardado.")));
    },
});
