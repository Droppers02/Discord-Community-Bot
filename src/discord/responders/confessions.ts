import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess, replyContainer } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { appendAuditLog } from "../../services/auditService.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildConfessionCooldownModal, buildConfessionsContainer } from "../../modules/confessions/confessionConfigView.js";
import { approveConfession, buildConfessionModal, buildRejectModal, getConfession, rejectConfession, removeConfession, reportConfession, submitConfession } from "../../modules/confessions/confessionService.js";
import { getConfessionSettings, saveConfessionSettings } from "../../modules/confessions/confessionSettings.js";
import { hasModAccess } from "../../modules/moderation/moderationService.js";

const ephemeral = (text: string, ok = false) => ({ components: [ok ? successContainer(text) : errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral } as const);

// ─── Enviar (modal) ──────────────────────────────────────────────────────────

createResponder({
    customId: "confess/submit/:parent",
    types: [ResponderType.Modal],
    async run(interaction, { parent }) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const files = [...(interaction.fields.getUploadedFiles("image")?.values() ?? [])];
        const result = await submitConfession(interaction.member, interaction.fields.getTextInputValue("text"), files, Number(parent) || 0);
        if (!result.ok) return void interaction.editReply(ephemeral(result.reason));
        await interaction.editReply(ephemeral(result.pending
            ? t("Enviada! A **#{n}** vai ser vista pela equipa (sem saberem que foste tu) e recebes uma mensagem quando for publicada.", { n: result.number })
            : t("Publicada como **#{n}**. {link}", { n: result.number, link: result.url ?? "" }), true));
    },
});

// ─── Botões das publicações e da revisão ─────────────────────────────────────

const STAFF_ACTIONS = new Set(["approve", "reject", "block", "remove"]);

createResponder({
    customId: "confess/:action/:number",
    types: [ResponderType.Button],
    async run(interaction, { action, number }) {
        if (!interaction.inCachedGuild()) return;
        const guild = interaction.guild;
        const settings = await getConfessionSettings(guild.id);

        if (action === "new" || action === "reply") {
            if (!settings.enabled) return void interaction.reply(ephemeral(t("As confissões estão desligadas.")));
            return void interaction.showModal(buildConfessionModal(action === "reply" ? Number(number) : 0, settings.allow_images));
        }

        const entry = await getConfession(guild.id, Number(number));
        if (!entry) return void interaction.reply(ephemeral(t("Essa confissão já não existe.")));

        if (action === "report") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const sent = await reportConfession(guild, entry, interaction.user.id);
            return void interaction.editReply(ephemeral(sent ? t("Obrigado — a equipa vai ver a confissão #{n}.", { n: entry.number }) : t("Não há canal da equipa para denúncias de confissões — abre um ticket."), sent));
        }

        if (action === "reveal") {
            const config = await ensureGuildConfig(guild.id);
            if (!hasSuperAdminAccess(interaction.member, config.admin_role)) return void interaction.reply(ephemeral(t("Só a administração pode revelar um autor.")));
            appendAuditLog({ guildId: guild.id, actorId: interaction.user.id, action: "confession.reveal", details: { number: entry.number } });
            const user = await interaction.client.users.fetch(entry.author_id).catch(() => null);
            return void interaction.reply({
                ...ephemeral(t("A #{n} foi escrita por {user}{tag}. Isto ficou registado na auditoria.", { n: entry.number, user: `<@${entry.author_id}>`, tag: user ? ` (\`${user.username}\` · ${user.id})` : "" }), true),
                allowedMentions: { parse: [] },
            });
        }

        if (STAFF_ACTIONS.has(action) && !(await hasModAccess(interaction.member, PermissionFlagsBits.ManageMessages))) {
            return void interaction.reply(ephemeral(t("Só a equipa trata das confissões.")));
        }
        if (action === "reject") return void interaction.showModal(buildRejectModal(entry.number));

        await interaction.deferUpdate();
        if (action === "approve") {
            const problem = await approveConfession(guild, entry, interaction.user.id);
            if (problem) await interaction.followUp(ephemeral(problem)).catch(() => null);
        } else if (action === "block") {
            await rejectConfession(guild, entry, interaction.user.id, null, true);
            await interaction.followUp(ephemeral(t("Autor da #{n} bloqueado — não volta a conseguir enviar confissões.", { n: entry.number }), true)).catch(() => null);
        } else if (action === "remove") {
            await removeConfession(guild, entry, interaction.user.id);
        }
    },
});

createResponder({
    customId: "confess/rejectsave/:number",
    types: [ResponderType.Modal],
    async run(interaction, { number }) {
        if (!interaction.inCachedGuild()) return;
        if (!(await hasModAccess(interaction.member, PermissionFlagsBits.ManageMessages))) return void interaction.reply(ephemeral(t("Só a equipa trata das confissões.")));
        const entry = await getConfession(interaction.guildId, Number(number));
        if (!entry) return void interaction.reply(ephemeral(t("Essa confissão já não existe.")));
        await interaction.deferUpdate().catch(() => null);
        await rejectConfession(interaction.guild, entry, interaction.user.id, interaction.fields.getTextInputValue("reason").trim() || null);
    },
});

// ─── /config → Confissões ────────────────────────────────────────────────────

createResponder({
    customId: "confesscfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getConfessionSettings(guildId);
        if (interaction.isButton()) {
            if (action === "cooldown") return void interaction.showModal(buildConfessionCooldownModal(s));
            if (action === "toggle") await saveConfessionSettings(guildId, { enabled: !s.enabled });
            if (action === "images") await saveConfessionSettings(guildId, { allow_images: !s.allow_images });
            if (action === "replies") await saveConfessionSettings(guildId, { allow_replies: !s.allow_replies });
            if (action === "filter") await saveConfessionSettings(guildId, { use_word_filter: !s.use_word_filter });
            if (action === "unblock") await saveConfessionSettings(guildId, { blocked: [] });
        } else if (interaction.isChannelSelectMenu()) {
            if (action === "channel") await saveConfessionSettings(guildId, { channel: interaction.values[0] ?? null });
            if (action === "review") await saveConfessionSettings(guildId, { review_channel: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildConfessionsContainer(guildId)] });
    },
});

createResponder({
    customId: "confesscfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const s = await getConfessionSettings(interaction.guildId);
        await saveConfessionSettings(interaction.guildId, { cooldown_minutes: clampInt(interaction.fields.getTextInputValue("minutes"), s.cooldown_minutes, 0, 1440) });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildConfessionsContainer(interaction.guildId)] });
        else await replyContainer(interaction, successContainer(t("Guardado.")));
    },
});
