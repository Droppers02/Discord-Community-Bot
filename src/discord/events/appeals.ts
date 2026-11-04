import { createEvent, createRawEvent } from "#base";
import { AuditLogEvent } from "discord.js";
import { loadRuntimeConfig } from "../../config.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { appealsOf } from "../../repositories/appealRepository.js";
import { fetchAuditExecutor } from "../../modules/logs/eventLogger.js";
import { isAppealGuild } from "../../modules/appeals/appealGuild.js";
import { appealInviteForBan, appealStatusView, banAppealNotice, checkEligibility } from "../../modules/appeals/appealService.js";

// Banimentos feitos fora do /mod (menu do Discord, outro bot): o /mod já mandou a DM com o
// convite para o servidor de apelos antes de banir; aqui tenta-se o mesmo para os outros. Depois
// do ban o bot já não partilha o servidor com a pessoa, por isso esta DM costuma falhar.
createEvent({
    name: "Ban appeal: DM em bans de fora do /mod",
    event: "guildBanAdd",
    async run(ban) {
        if (ban.user.bot) return;
        const invite = await appealInviteForBan(ban.guild);
        if (!invite) return;
        const executor = await fetchAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        if (executor?.id === ban.client.user.id) return;
        const notice = banAppealNotice(invite);
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

// Servidor de apelos: quem entra e está banido do servidor principal recebe logo por DM o estado
// do pedido e o botão (agora partilham um servidor, por isso a DM e o clique já funcionam).
// createRawEvent porque o nosso createEvent ignora servidores fora da lista — e este está fora.
createRawEvent({
    name: "Servidor de apelos: formulário a quem entra",
    event: "guildMemberAdd",
    async run(member) {
        if (member.user.bot || !(await isAppealGuild(member.guild.id))) return;
        const main = member.client.guilds.cache.get(loadRuntimeConfig().mainGuildId);
        if (!main) return;
        const banned = await main.bans.fetch(member.id).catch(() => null);
        if (!banned) return;
        const [appeals, eligibility] = await Promise.all([appealsOf(main.id, member.id), checkEligibility(main, member.id)]);
        await member.send({ components: [appealStatusView(main, appeals, eligibility)], flags: CV2_FLAG })
            .catch(() => logger.info(`Servidor de apelos: não consegui mandar DM a ${member.user.tag} (tem as DMs fechadas?) — pode usar o /apelo lá.`));
    },
});
