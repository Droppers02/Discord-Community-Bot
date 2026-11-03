import { createEvent } from "#base";
import { AuditLogEvent } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { fetchAuditExecutor } from "../../modules/logs/eventLogger.js";
import { appealButtonRow, appealsOpen } from "../../modules/appeals/appealService.js";

// Banimentos feitos fora do /mod (menu do Discord, outro bot): o /mod já mandou a DM com o
// botão de revisão antes de banir; aqui tenta-se o mesmo para os outros. Depois do ban o bot já
// não partilha o servidor com a pessoa, por isso a DM pode falhar — fica o /apelo por DM.
createEvent({
    name: "Ban appeal: DM em bans de fora do /mod",
    event: "guildBanAdd",
    async run(ban) {
        if (ban.user.bot || !(await appealsOpen(ban.guild.id))) return;
        const executor = await fetchAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        if (executor?.id === ban.client.user.id) return;
        await ban.user.send({
            components: [buildContainer({
                color: COLORS.danger,
                title: `${e("ban")} ${t("Banimento")}`,
                description: [
                    t("**Servidor:** {server}", { server: ban.guild.name }),
                    ban.reason ? t("**Motivo:** {reason}", { reason: ban.reason }) : null,
                    "",
                    t("Achas que foi injusto? Pede a revisão do ban no botão abaixo (ou mais tarde com `/apelo` aqui na DM)."),
                ].filter((line) => line !== null).join("\n"),
                rows: [appealButtonRow(ban.guild.id)],
            })],
            flags: CV2_FLAG,
        }).catch(() => null);
    },
});
