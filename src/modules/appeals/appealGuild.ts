import { ButtonBuilder, ButtonStyle, ChannelType, OAuth2Scopes, PermissionFlagsBits, type Client, type Guild, type GuildBasedChannel, type TextChannel } from "discord.js";
import { loadRuntimeConfig } from "../../config.js";
import { row, type Row } from "../../lib/containers.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { getAppealSettings, saveAppealSettings } from "./appealSettings.js";

// Servidor de apelos. O Discord só entrega ao bot os cliques e comandos (e só deixa o bot mandar
// DMs) de quem partilha pelo menos um servidor com ele. Quem é banido do servidor principal perde
// isso — por isso existe um servidor pequeno, só para os pedidos, onde o bot também está. Lá só
// funciona a revisão de bans (/apelo e os botões "appeal/…"); os outros sistemas ignoram-no.

const mainGuildId = () => loadRuntimeConfig().mainGuildId;

/** Permissões que o bot precisa no servidor de apelos (convite, painel, expulsar quem é desbanido). */
export const APPEAL_GUILD_PERMISSIONS = PermissionFlagsBits.ViewChannel
    | PermissionFlagsBits.SendMessages
    | PermissionFlagsBits.EmbedLinks
    | PermissionFlagsBits.ReadMessageHistory
    | PermissionFlagsBits.CreateInstantInvite
    | PermissionFlagsBits.KickMembers;

/** Link para adicionar o bot a um servidor (para o dono criar o servidor de apelos). */
export function addBotUrl(client: Client): string {
    return client.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: APPEAL_GUILD_PERMISSIONS });
}

/** O servidor de apelos, se estiver configurado e o bot lá estiver. */
export async function appealGuild(client: Client): Promise<Guild | null> {
    const settings = await getAppealSettings(mainGuildId());
    return settings.appeal_guild ? client.guilds.cache.get(settings.appeal_guild) ?? null : null;
}

export async function isAppealGuild(guildId: string | null): Promise<boolean> {
    if (!guildId || guildId === mainGuildId()) return false;
    return (await getAppealSettings(mainGuildId())).appeal_guild === guildId;
}

/** Primeiro canal de texto do servidor de apelos onde o bot consegue fazer `permission`. */
export function appealChannel(guild: Guild, permission: bigint): TextChannel | null {
    const me = guild.members.me;
    if (!me) return null;
    const texts = [...guild.channels.cache.values()]
        .filter((channel): channel is TextChannel => channel.type === ChannelType.GuildText)
        .sort((a, b) => a.rawPosition - b.rawPosition);
    const candidates: Array<GuildBasedChannel | null> = [guild.systemChannel, guild.rulesChannel, ...texts];
    const found = candidates.find((channel) => channel?.type === ChannelType.GuildText && channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, permission]));
    return (found as TextChannel | undefined) ?? null;
}

let validatedInvite: { url: string; at: number } | null = null;
const INVITE_RECHECK_MS = 10 * 60_000;

/** Convite permanente para o servidor de apelos (reaproveita o guardado enquanto for válido). */
export async function appealInviteUrl(client: Client): Promise<string | null> {
    const guild = await appealGuild(client);
    if (!guild) return null;
    const settings = await getAppealSettings(mainGuildId());
    if (settings.appeal_invite) {
        if (validatedInvite?.url === settings.appeal_invite && Date.now() - validatedInvite.at < INVITE_RECHECK_MS) return settings.appeal_invite;
        const code = settings.appeal_invite.split("/").pop() ?? "";
        const valid = await client.fetchInvite(code).then((invite) => invite.guild?.id === guild.id).catch(() => false);
        if (valid) {
            validatedInvite = { url: settings.appeal_invite, at: Date.now() };
            return settings.appeal_invite;
        }
    }
    const channel = appealChannel(guild, PermissionFlagsBits.CreateInstantInvite);
    if (!channel) {
        logger.warn(`Servidor de apelos (${guild.name}): o bot não consegue criar convites em nenhum canal de texto.`);
        return null;
    }
    const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: t("Convite do servidor de apelos") }).catch((error: unknown) => {
        logger.warn("Servidor de apelos: falha a criar o convite:", error);
        return null;
    });
    if (!invite) return null;
    await saveAppealSettings(mainGuildId(), { appeal_invite: invite.url });
    validatedInvite = { url: invite.url, at: Date.now() };
    return invite.url;
}

/** Botão (link) para entrar no servidor de apelos — vai na DM do ban. */
export function appealInviteRow(url: string): Row {
    return row(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(t("Entrar no servidor de apelos")).setEmoji("🧾"));
}

/** Depois de aprovado: sai do servidor de apelos (já tem o convite para voltar ao principal). */
export async function leaveAppealGuild(client: Client, userId: string): Promise<void> {
    const guild = await appealGuild(client);
    const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    if (member?.kickable) await member.kick(t("Ban levantado — voltou ao servidor principal.")).catch(() => null);
}
