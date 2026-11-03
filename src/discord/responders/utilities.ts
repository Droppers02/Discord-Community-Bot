import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { ButtonBuilder, ButtonStyle } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, errorContainer, row, successContainer } from "../../lib/containers.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { deleteReminder } from "../../repositories/scheduleRepository.js";
import { deleteNote, listNotes } from "../../repositories/utilityRepository.js";

// /lembrete lista → apagar.
createResponder({
    customId: "rem/delete/:owner",
    types: [ResponderType.StringSelect],
    async run(interaction, { owner }) {
        if (owner !== interaction.user.id) return void interaction.deferUpdate();
        const removed = await deleteReminder(interaction.values[0] ?? "", interaction.user.id);
        await interaction.update({ components: [removed ? successContainer(t("Lembrete apagado.")) : errorContainer(t("Esse lembrete já não existe."))] });
    },
});

// /nota lista → abrir uma nota.
createResponder({
    customId: "note/open/:owner",
    types: [ResponderType.StringSelect],
    async run(interaction, { owner }) {
        if (!interaction.inCachedGuild() || owner !== interaction.user.id) return void interaction.deferUpdate();
        const id = Number(interaction.values[0]);
        const note = (await listNotes(interaction.guildId, interaction.user.id)).find((entry) => entry.id === id);
        if (!note) return void interaction.update({ components: [errorContainer(t("Essa nota já não existe."))] });
        await interaction.update({
            components: [buildContainer({
                color: COLORS.info,
                title: `${e("notes")} ${note.title}`,
                description: note.content,
                footerText: t("Criada {at}", { at: new Date(note.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) }),
                rows: [row(new ButtonBuilder().setCustomId(`note/delete/${interaction.user.id}/${note.id}`).setLabel(t("Apagar nota")).setEmoji("🗑️").setStyle(ButtonStyle.Danger))],
            })],
        });
    },
});

createResponder({
    customId: "note/delete/:owner/:id",
    types: [ResponderType.Button],
    async run(interaction, { owner, id }) {
        if (!interaction.inCachedGuild() || owner !== interaction.user.id) return void interaction.deferUpdate();
        const removed = await deleteNote(interaction.guildId, interaction.user.id, Number(id));
        await interaction.update({ components: [removed ? successContainer(t("Nota apagada.")) : errorContainer(t("Essa nota já não existe."))] });
    },
});
