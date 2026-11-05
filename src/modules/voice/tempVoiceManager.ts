import { ChannelType, PermissionFlagsBits, type Client, type Guild, type GuildMember, type VoiceBasedChannel, type VoiceChannel } from "discord.js";
import { logger } from "../../lib/logger.js";
import { getVoiceSettings } from "./voiceSettings.js";
import type { GuildConfig, TicketRecord } from "../../types.js";
import { t } from "../../lib/i18n.js";

// Canais de voz temporários (estilo TempVoice):
//  • Hub "join-to-create": entrar no canal hub cria uma sala pessoal e move o membro;
//    quando a sala fica vazia, é apagada.
//  • Voz por ticket: sala privada (dono do ticket + staff) criada com /voz dentro do
//    ticket; apagada quando fica vazia ou quando o ticket fecha.
// A verdade vive em memória (tempChannels) — órfãos pós-restart são apanhados pelo
// sweepOrphanTempChannels no clientReady (salas vazias criadas pelo bot na categoria).

/** Prefixo das salas de voz criadas por /voz dentro de um ticket. */
const TICKET_VOICE_PREFIX = "🎫・voz-";
/** Prefixo das salas dos grupos (/grupo) — também temporárias. */
export const LFG_VOICE_PREFIX = "🎮・";

/**
 * Tempo que uma sala temporária pode ficar vazia antes de ser apagada.
 *
 * O `voiceStateUpdate` só limpa salas de onde alguém SAIU — uma sala criada por /voz onde
 * ninguém chegou a entrar nunca gerava esse evento e ficava lá para sempre. A varredura
 * periódica abaixo fecha esse buraco, dando na mesma uns minutos para alguém entrar.
 */
const EMPTY_GRACE_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

/** channelId → instante em que passou a estar vazia (null = tem gente). */
const tempChannels = new Map<string, number | null>();
const ticketVoiceByTicketChannel = new Map<string, string>();

export function isTempVoiceChannel(channelId: string): boolean {
    return tempChannels.has(channelId);
}

function trackTempChannel(channelId: string, emptySince: number | null = Date.now()): void {
    tempChannels.set(channelId, emptySince);
}

function untrackTempChannel(channelId: string): void {
    tempChannels.delete(channelId);
    for (const [ticketId, voiceId] of ticketVoiceByTicketChannel) {
        if (voiceId === channelId) ticketVoiceByTicketChannel.delete(ticketId);
    }
}

/** Passa a seguir uma sala criada noutro sítio (ex.: grupos): é apagada quando ficar vazia. */
export function adoptTempChannel(channelId: string): void {
    trackTempChannel(channelId, Date.now());
}

export function getTicketVoiceChannel(ticketChannelId: string): string | null {
    return ticketVoiceByTicketChannel.get(ticketChannelId) ?? null;
}

function formatName(template: string, memberName: string): string {
    return template.replaceAll("{user}", memberName).slice(0, 100);
}

/** Hub join-to-create: cria a sala pessoal e move o membro para lá. */
export async function createHubTempChannel(member: GuildMember, hubChannel: VoiceBasedChannel): Promise<void> {
    const settings = await getVoiceSettings(member.guild.id);

    const overwrites = settings.owner_can_manage
        ? [{ id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers] }]
        : undefined;

    const channel = await member.guild.channels.create({
        name: formatName(settings.name_template, member.displayName),
        type: ChannelType.GuildVoice,
        parent: settings.category_id ?? hubChannel.parentId ?? undefined,
        userLimit: settings.user_limit > 0 ? settings.user_limit : undefined,
        permissionOverwrites: overwrites,
        reason: t("Sala temporária de {user}", { user: member.user.tag }),
    });
    trackTempChannel(channel.id);
    await member.voice.setChannel(channel).catch(async () => {
        // Se o membro já saiu de voz entretanto, não deixar a sala órfã.
        await channel.delete().catch(() => null);
        untrackTempChannel(channel.id);
    });
}

/** Sala de voz privada de um ticket (dono + staff + admin). Reutiliza se já existir. */
export async function createTicketVoiceChannel(guild: Guild, ticket: TicketRecord, config: GuildConfig): Promise<VoiceChannel | null> {
    const existingId = ticketVoiceByTicketChannel.get(ticket.channel_id);
    if (existingId) {
        const existing = guild.channels.cache.get(existingId);
        if (existing?.type === ChannelType.GuildVoice) return existing;
        ticketVoiceByTicketChannel.delete(ticket.channel_id);
    }

    const botId = guild.members.me?.id;
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ticket.owner_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        ...(botId ? [{ id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] }] : []),
        ...(config.staff_role ? [{ id: config.staff_role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers] }] : []),
        ...(config.admin_role && config.admin_role !== config.staff_role
            ? [{ id: config.admin_role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MoveMembers] }]
            : []),
    ];

    const ticketChannel = guild.channels.cache.get(ticket.channel_id);
    const channel = await guild.channels.create({
        name: `${TICKET_VOICE_PREFIX}${ticket.owner_tag.split("#")[0]}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: (ticketChannel && "parentId" in ticketChannel ? ticketChannel.parentId : null) ?? undefined,
        permissionOverwrites: overwrites,
        reason: t("Sala de voz do ticket {id}", { id: ticket.id.slice(0, 8) }),
    });
    // Nasce vazia: o relógio da varredura começa já, para não ficar lá se ninguém entrar.
    trackTempChannel(channel.id);
    ticketVoiceByTicketChannel.set(ticket.channel_id, channel.id);
    return channel;
}

/** Minutos de tolerância antes de uma sala vazia ser apagada — usado no aviso ao utilizador. */
export const EMPTY_GRACE_MINUTES = EMPTY_GRACE_MS / 60_000;

/** Apaga a sala de voz ligada a um ticket (chamado ao fechar o ticket). */
export async function deleteTicketVoiceChannel(guild: Guild, ticketChannelId: string): Promise<void> {
    const voiceId = ticketVoiceByTicketChannel.get(ticketChannelId);
    if (!voiceId) return;
    untrackTempChannel(voiceId);
    await guild.channels.cache.get(voiceId)?.delete(t("Ticket fechado")).catch(() => null);
}

/** Sala temporária ficou vazia → apagar (chamado no voiceStateUpdate). */
export async function cleanupIfEmpty(channel: VoiceBasedChannel): Promise<void> {
    if (!tempChannels.has(channel.id)) return;
    if (channel.members.size > 0) {
        tempChannels.set(channel.id, null);
        return;
    }
    untrackTempChannel(channel.id);
    await channel.delete(t("Sala temporária vazia")).catch(() => null);
}

/**
 * Varredura periódica das salas temporárias: apaga as que estão vazias há mais do que a
 * tolerância. Apanha os dois casos que o `voiceStateUpdate` deixava passar — a sala de /voz
 * onde ninguém chegou a entrar, e a sala cujo evento de saída se perdeu (bot a reiniciar).
 */
export function startTempVoiceSweep(client: Client<true>): void {
    const tick = async (): Promise<void> => {
        const now = Date.now();
        for (const [channelId, emptySince] of [...tempChannels]) {
            const channel = client.channels.cache.get(channelId);
            if (!channel || channel.type !== ChannelType.GuildVoice) {
                untrackTempChannel(channelId);
                continue;
            }
            if (channel.members.size > 0) {
                tempChannels.set(channelId, null);
                continue;
            }
            if (emptySince === null) {
                tempChannels.set(channelId, now); // acabou de esvaziar: começa a contagem
                continue;
            }
            if (now - emptySince < EMPTY_GRACE_MS) continue;
            untrackTempChannel(channelId);
            await channel.delete(t("Sala temporária vazia")).catch(() => null);
        }
    };
    const timer = setInterval(() => void tick().catch((error) => logger.warn("Varredura de salas temporárias:", error)), SWEEP_INTERVAL_MS);
    timer.unref?.();
}

/**
 * Pós-restart: salas temporárias vazias criadas pelo bot ficariam órfãs (o tracking é
 * em memória). Este sweep apaga canais de voz VAZIOS criados pelo bot — os do hub, na
 * categoria configurada e com o prefixo do template, e as salas de /voz, reconhecíveis
 * pelo prefixo próprio. Nunca toca em canais que não batem com esses critérios.
 */
export async function sweepOrphanTempChannels(guild: Guild): Promise<number> {
    const settings = await getVoiceSettings(guild.id);
    const hubPrefix = settings.name_template.split("{user}")[0].trim();
    let removed = 0;

    for (const channel of guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildVoice) continue;
        if (channel.id === settings.hub_channel) continue;

        const isTicketVoice = channel.name.startsWith(TICKET_VOICE_PREFIX) || channel.name.startsWith(LFG_VOICE_PREFIX);
        const isHubRoom = Boolean(settings.hub_channel)
            && Boolean(settings.category_id)
            && channel.parentId === settings.category_id
            && (!hubPrefix || channel.name.startsWith(hubPrefix));
        if (!isTicketVoice && !isHubRoom) continue;

        // Sala ainda com gente: volta a ser seguida, para a varredura a apanhar quando esvaziar.
        if (channel.members.size > 0) { trackTempChannel(channel.id, null); continue; }
        await channel.delete(t("Sala temporária órfã (pós-restart)")).catch(() => null);
        removed += 1;
    }
    if (removed > 0) logger.info(`Temp voice: ${removed} sala(s) órfã(s) removida(s) em ${guild.name}.`);
    return removed;
}
