import { createEvent } from "#base";
import { getAntiSpamSettings } from "../../modules/antispam/antispamSettings.js";
import { applyQuarantineToNewChannel } from "../../modules/antispam/quarantine.js";

createEvent({
    name: "Fecha canais novos ao cargo de castigo do anti-spam",
    event: "channelCreate",
    async run(channel) {
        // Sem isto, qualquer canal criado depois da configuração ficava visível para quem
        // está de castigo — o cargo perdia o efeito à medida que o servidor crescia.
        const settings = await getAntiSpamSettings(channel.guild.id);
        if (!settings.quarantine_role) return;
        await applyQuarantineToNewChannel(channel, settings.quarantine_role);
    },
});
