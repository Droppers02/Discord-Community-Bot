import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { isAllowedGuild } from "../../config.js";
import { errorContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { noteDmInteraction } from "../../lib/dmDiagnostics.js";
import { t } from "../../lib/i18n.js";
import {
    acceptAppeal,
    denyAppeal,
    openAskModal,
    openDenyModal,
    openReplyModal,
    sendQuestion,
    showAppealForm,
    showHistory,
    submitAppeal,
    submitReply,
    voteAppeal,
} from "../../modules/appeals/appealService.js";

// Pedidos de revisão de ban. Os botões do membro (start/reply) vivem em DM; os da equipa no
// canal dos pedidos.

createResponder({
    customId: "appeal/start/:guild",
    types: [ResponderType.Button],
    async run(interaction, { guild: guildId }) {
        noteDmInteraction(interaction, "botao-apelo");
        const guild = isAllowedGuild(guildId) ? interaction.client.guilds.cache.get(guildId) : null;
        if (!guild) return void interaction.reply({ components: [errorContainer(t("Esse servidor já não está disponível."))], flags: CV2_FLAG });
        try {
            await showAppealForm(interaction, guild);
            noteDmInteraction(interaction, "botao-apelo-ok", { replied: interaction.replied });
        } catch (error) {
            noteDmInteraction(interaction, "botao-apelo-falhou", { error: String(error) });
            throw error;
        }
    },
});

createResponder({
    customId: "appeal/submit/:guild",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { guild: guildId }) {
        const guild = isAllowedGuild(guildId) ? interaction.client.guilds.cache.get(guildId) : null;
        if (!guild) return void interaction.reply({ components: [errorContainer(t("Esse servidor já não está disponível."))], flags: CV2_FLAG });
        await submitAppeal(interaction, guild);
    },
});

createResponder({
    customId: "appeal/reply/:id",
    types: [ResponderType.Button],
    async run(interaction, { id }) {
        await openReplyModal(interaction, id);
    },
});

createResponder({
    customId: "appeal/replysubmit/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { id }) {
        await submitReply(interaction, id, interaction.client);
    },
});

// ─── Equipa ──────────────────────────────────────────────────────────────────

createResponder({
    customId: "appeal/:action/:id",
    types: [ResponderType.Button],
    async run(interaction, { action, id }) {
        if (!interaction.inCachedGuild()) return;
        switch (action) {
            case "accept": return acceptAppeal(interaction, id);
            case "deny": return openDenyModal(interaction, id);
            case "ask": return openAskModal(interaction, id);
            case "history": return showHistory(interaction, id);
            default: return void interaction.deferUpdate();
        }
    },
});

createResponder({
    customId: "appeal/vote/:id/:direction",
    types: [ResponderType.Button],
    async run(interaction, { id, direction }) {
        if (!interaction.inCachedGuild() || (direction !== "up" && direction !== "down")) return;
        await voteAppeal(interaction, id, direction);
    },
});

createResponder({
    customId: "appeal/:action/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { action, id }) {
        if (!interaction.inCachedGuild()) return;
        if (action === "denysubmit") return denyAppeal(interaction, id);
        if (action === "asksubmit") return sendQuestion(interaction, id);
        await interaction.deferUpdate().catch(() => null);
    },
});
