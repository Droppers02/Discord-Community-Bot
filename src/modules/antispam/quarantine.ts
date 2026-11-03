import { t, tk } from "../../lib/i18n.js";
import { type Guild, type GuildBasedChannel, type Role } from "discord.js";
import { logger } from "../../lib/logger.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";

// ─── Cargo de castigo (quarentena) ───────────────────────────────────────────
// Um timeout do Discord impede o membro de interagir com TUDO — não consegue sequer
// clicar no botão para abrir um ticket. Ou seja: quem for punido por engano fica sem
// forma de se defender.
//
// A quarentena resolve isso: é um cargo que, por overwrites de canal, retira acesso a
// todos os canais EXCETO ao canal do painel de tickets — onde o membro continua a ver o
// painel e a poder abrir um ticket para recorrer. O canal do ticket que nasce a seguir dá
// permissão ao próprio membro (overwrite de MEMBRO), que no Discord tem prioridade sobre
// o overwrite de cargo — por isso ele consegue lá falar mesmo estando em quarentena.

/** Tudo negado: é isto que transforma o cargo numa quarentena. */
const LOCKED_DOWN = {
    ViewChannel: false,
    SendMessages: false,
    AddReactions: false,
    Speak: false,
    Connect: false,
} as const;

/** No canal do painel: vê e lê (para clicar no botão), mas não escreve. */
const TICKET_CHANNEL_ACCESS = {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: false,
    AddReactions: false,
} as const;

const REASON = tk("Cargo de castigo do anti-spam");

/**
 * Alinha os overwrites do cargo de castigo em todos os canais do servidor: nega tudo em
 * todo o lado e abre uma exceção no canal do painel de tickets.
 *
 * Idempotente — corre quando o cargo é configurado e quando aparece um canal novo.
 */
export async function syncQuarantineRole(guild: Guild, roleId: string): Promise<void> {
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) return;

    const { ticket_channel: ticketChannelId } = await ensureGuildConfig(guild.id);

    for (const channel of guild.channels.cache.values()) {
        // Threads não têm overwrites próprios — herdam-nos do canal-pai, que já tratámos.
        if (channel.isThread()) continue;
        // Canal que o bot não vê (o Discord oculta-o desde 16 nov 2026): não há o que editar.
        if (!channel.viewable) continue;
        const permissions = ticketChannelId && channel.id === ticketChannelId ? TICKET_CHANNEL_ACCESS : LOCKED_DOWN;
        try {
            await channel.permissionOverwrites.edit(role, permissions, { reason: t(REASON) });
        } catch (error) {
            logger.warn(`Quarentena: falha a configurar o canal ${channel.id} em ${guild.id}:`, error);
        }
    }
}

/** Fecha um canal acabado de criar ao cargo de castigo (senão seria uma fuga de acesso). */
export async function applyQuarantineToNewChannel(channel: GuildBasedChannel, roleId: string): Promise<void> {
    if (channel.isThread()) return;
    const role = channel.guild.roles.cache.get(roleId);
    if (!role) return;
    await channel.permissionOverwrites.edit(role, LOCKED_DOWN, { reason: REASON }).catch(() => null);
}

/** Cria o cargo de castigo (sem permissões próprias — o acesso vem todo dos overwrites). */
export async function createQuarantineRole(guild: Guild): Promise<Role | null> {
    const role = await guild.roles.create({
        name: t("Castigo"),
        color: 0x4e5058,
        permissions: [],
        mentionable: false,
        hoist: false,
        reason: `${t(REASON)} ${t("(só vê o canal dos tickets)")}`,
    }).catch((error) => {
        logger.warn(`Quarentena: falha a criar o cargo em ${guild.id}:`, error);
        return null;
    });
    if (role) await syncQuarantineRole(guild, role.id);
    return role;
}
