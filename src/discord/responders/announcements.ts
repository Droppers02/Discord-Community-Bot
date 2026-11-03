import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags, PermissionFlagsBits, type TextChannel } from "discord.js";
import { randomUUID } from "node:crypto";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { timestamp } from "../../lib/time.js";
import { deleteAnnouncement, insertAnnouncement } from "../../repositories/scheduleRepository.js";
import { announcementDrafts } from "../../modules/utility/announcementDrafts.js";
import { buildAnnouncement, isHttpImage } from "../../modules/utility/scheduler.js";

const REPEAT_TEXT = { none: "", daily: " · todos os dias", weekly: " · todas as semanas" } as const;

// Texto do anúncio (modal aberto pelo /anuncio agendar).
createResponder({
    customId: "ann/new/:draft",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { draft: draftId }) {
        if (!interaction.inCachedGuild()) return;
        const draft = announcementDrafts.take(draftId);
        if (!draft || draft.userId !== interaction.user.id) {
            return void interaction.reply({ components: [errorContainer(t("O formulário expirou — volta a usar `/anuncio agendar`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const image = interaction.fields.getTextInputValue("image").trim() || null;
        if (image && !isHttpImage(image)) {
            return void interaction.reply({ components: [errorContainer(t("O link da imagem tem de começar por https://"))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const entry = {
            id: randomUUID().slice(0, 12),
            guild_id: draft.guildId,
            channel_id: draft.channelId,
            author_id: draft.userId,
            title: interaction.fields.getTextInputValue("title").trim() || null,
            content: interaction.fields.getTextInputValue("content").trim(),
            mention_role: draft.mentionRole,
            image_url: image,
            send_at: draft.sendAt,
            repeat: draft.repeat,
            created_at: Date.now(),
        };

        if (draft.immediate && draft.repeat === "none") {
            const channel = interaction.guild.channels.cache.get(draft.channelId);
            if (!channel?.isTextBased()) return void interaction.reply({ components: [errorContainer(t("Esse canal já não existe."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            await (channel as TextChannel).send({
                components: [buildAnnouncement(entry)],
                flags: CV2_FLAG,
                allowedMentions: entry.mention_role === "everyone" ? { parse: ["everyone"] } : entry.mention_role ? { roles: [entry.mention_role] } : { parse: [] },
            });
            return void interaction.reply({ components: [successContainer(t("Anúncio publicado em {channel}.", { channel: `<#${draft.channelId}>` }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }

        await insertAnnouncement(entry);
        await interaction.reply({
            components: [
                buildContainer({
                    color: COLORS.success,
                    title: `${e("success")} ${t("Anúncio agendado")}`,
                    description: t("Sai em {channel} a {at} ({rel}){repeat}.", { channel: `<#${entry.channel_id}>`, at: timestamp(entry.send_at, "f"), rel: timestamp(entry.send_at, "R"), repeat: REPEAT_TEXT[entry.repeat] }),
                    footerText: t("Pré-visualização abaixo · cancela com /anuncio lista"),
                }),
                buildAnnouncement(entry),
            ],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        });
    },
});

// /anuncio lista → menu "Cancelar um anúncio…".
createResponder({
    customId: "ann/cancel",
    types: [ResponderType.StringSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) return void interaction.deferUpdate();
        const removed = await deleteAnnouncement(interaction.guildId, interaction.values[0] ?? "");
        await interaction.update({ components: [removed ? successContainer(t("Anúncio cancelado.")) : errorContainer(t("Esse anúncio já não existe."))] });
    },
});
