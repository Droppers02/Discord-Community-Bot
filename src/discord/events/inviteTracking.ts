import { createEvent } from "#base";
import { trackInviteCreate, trackInviteDelete } from "../../modules/logs/inviteTracker.js";

// Keep the invite-use cache fresh so join logs can attribute the invite used.
createEvent({
    name: "Track invite create",
    event: "inviteCreate",
    async run(invite) {
        trackInviteCreate(invite);
    },
});

createEvent({
    name: "Track invite delete",
    event: "inviteDelete",
    async run(invite) {
        trackInviteDelete(invite);
    },
});
