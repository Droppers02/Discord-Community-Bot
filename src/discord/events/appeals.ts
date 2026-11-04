import { createEvent } from "#base";
import { AuditLogEvent } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { fetchAuditExecutor } from "../../modules/logs/eventLogger.js";
import { banAppealNotice } from "../../modules/appeals/appealAccess.js";
import { appealsOpen } from "../../modules/appeals/appealService.js";

// Banimentos feitos fora do /mod (menu do Discord, outro bot): o /mod já mandou a DM com as
// instruções do pedido antes de banir; aqui tenta-se o mesmo para os outros. Depois do ban o bot
// já não partilha o servidor com a pessoa, por isso esta DM pode não chegar.
createEvent({
    name: "Ban appeal: DM em bans de fora do /mod",
    event: "guildBanAdd",
    async run(ban) {
        if (ban.user.bot || !(await appealsOpen(ban.guild.id))) return;
        const executor = await fetchAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        if (executor?.id === ban.client.user.id) return;
        const notice = banAppealNotice(ban.client, ban.guild.id);
        await ban.user.send({
            components: [buildContainer({
                color: COLORS.danger,
                title: `${e("ban")} ${t("Banimento")}`,
                description: [
                    t("**Servidor:** {server}", { server: ban.guild.name }),
                    ban.reason ? t("**Motivo:** {reason}", { reason: ban.reason }) : null,
                    "",
                    notice.text,
                ].filter((line) => line !== null).join("\n"),
                rows: [notice.row],
            })],
            flags: CV2_FLAG,
        }).catch(() => null);
    },
});
