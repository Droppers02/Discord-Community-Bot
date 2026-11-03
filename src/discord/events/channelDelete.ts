import { createEvent } from "#base";
import { clearCloseRequestTimer } from "../../modules/tickets/closeRequestManager.js";
import { openTickets } from "../../modules/tickets/ticketManager.js";

createEvent({
    name: "Clean ticket caches when a ticket channel is deleted",
    event: "channelDelete",
    async run(channel) {
        if (!("id" in channel)) return;
        openTickets.delete(channel.id);
        clearCloseRequestTimer(channel.id);
    },
});
