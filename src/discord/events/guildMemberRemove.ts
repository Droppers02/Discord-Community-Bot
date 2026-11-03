import { createEvent } from "#base";
import type { GuildMember, TextChannel } from "discord.js";
import { closeTicket, openTickets } from "../../modules/tickets/ticketManager.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { logger } from "../../lib/logger.js";
import { t } from "../../lib/i18n.js";

// Se quem sai do servidor tem um ticket aberto, fecha-o automaticamente (com transcript
// e log, como qualquer outro fecho) em vez de o deixar pendurado para sempre — usa a
// cache em memória (já mantida por createTicket/closeTicket) para não bater na BD no
// caminho comum (a maioria de quem sai não tem ticket aberto).
createEvent({
    name: "Fechar tickets automaticamente ao sair um membro",
    event: "guildMemberRemove",
    async run(member) {
        const own = [...openTickets.values()].filter((t) => t.guild_id === member.guild.id && t.owner_id === member.id && t.status === "open");
        if (own.length === 0) return;

        const config = await ensureGuildConfig(member.guild.id);
        for (const ticket of own) {
            const channel = await member.guild.channels.fetch(ticket.channel_id).catch(() => null);
            if (!channel?.isTextBased() || channel.isDMBased()) continue;
            // guildMemberRemove pode entregar um PartialGuildMember (pouco comum, membro
            // não totalmente em cache) — o caminho autoReason só usa `.id`, seguro em ambos.
            await closeTicket(channel as TextChannel, member as GuildMember, config, t("o membro saiu do servidor"))
                .catch((error) => logger.error(`Falha ao fechar ticket ${ticket.id} após saída do membro:`, error));
        }
    },
});
