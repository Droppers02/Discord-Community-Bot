import { createEvent } from "#base";
import { touchTicketActivity } from "../../modules/tickets/autoCloseManager.js";
import { openTickets } from "../../modules/tickets/ticketManager.js";

createEvent({
    name: "Track activity on open ticket channels for auto-close",
    event: "messageCreate",
    async run(message) {
        if (message.author.bot || !message.inGuild()) return;
        // Only touch channels we already know are open tickets (cheap cache lookup, no DB).
        if (!openTickets.has(message.channelId)) return;
        touchTicketActivity(message.channelId);
    },
});
