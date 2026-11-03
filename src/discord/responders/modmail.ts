import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { buildContainer } from "../../lib/containers.js";
import { COLORS } from "../../lib/branding.js";
import { t } from "../../lib/i18n.js";
import { parseCustomId } from "../../lib/ids.js";
import { clearPendingModmail, openModmail } from "../../modules/modmail/modmailService.js";

// Escolha do servidor no início de uma conversa por mensagem privada.
createResponder({
    customId: "mm/**",
    types: [ResponderType.Button, ResponderType.StringSelect],
    async run(interaction) {
        const { action, systemId } = parseCustomId(interaction.customId);
        if (action === "cancel") {
            clearPendingModmail(interaction.user.id);
            return void interaction.update({ components: [buildContainer({ color: COLORS.neutral, description: t("Mensagem não enviada.") })] });
        }
        if (action === "open" && interaction.isButton()) return void openModmail(interaction, systemId);
        if (action === "pick" && interaction.isStringSelectMenu()) return void openModmail(interaction, interaction.values[0] ?? "");
    },
});
