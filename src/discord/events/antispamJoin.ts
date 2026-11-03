import { createEvent } from "#base";
import { getAntiSpamSettings } from "../../modules/antispam/antispamSettings.js";
import { isSuspiciousAccountAge, recordJoin } from "../../modules/antispam/antiSpamEngine.js";

// Tracks new members so the anti-spam raid detector can spot waves of fresh accounts.
createEvent({
    name: "Anti-spam raid join tracker",
    event: "guildMemberAdd",
    async run(member) {
        const settings = await getAntiSpamSettings(member.guild.id);
        if (!settings.enabled) return;
        const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
        recordJoin(member.guild.id, member.id, isSuspiciousAccountAge(accountAgeDays, settings));
    },
});
