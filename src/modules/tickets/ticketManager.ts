import { t } from "../../lib/i18n.js";
import { randomUUID } from "node:crypto";
import {
    ChannelType,
    Guild,
    GuildMember,
    PermissionFlagsBits,
    TextChannel,
    User,
} from "discord.js";
import {
    countOpenTicketsByOwner,
    getOpenTicketsByGuild,
    getTicketByChannel,
    insertTicket,
    nextTicketNumber,
    updateTicketByChannel,
} from "../../repositories/ticketRepository.js";
import { COLORS, getEmbedColor, getFooterText } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG, safeFireAndForget } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import type { GuildConfig, TicketCategory, TicketFormResponseEntry, TicketRecord } from "../../types.js";
import { clearCloseRequestState } from "./closeRequestManager.js";
import { sendLog } from "../logs/logManager.js";
import { getCategoryChannelId, getCategoryLabel, getTicketCategories } from "./categories.js";
import { buildTicketChannelName, uniqueTicketChannelName } from "./ticketNaming.js";
import { isSupportOffline, buildOfflineNotice } from "./officeHours.js";
import { maybeSendRatingPrompt } from "./rating.js";
import { buildTicketResponseFields, buildTicketSemanticFields, getTicketForm, serializeTicketFormResponses } from "./forms.js";
import { generateTranscript } from "../transcripts/transcriptManager.js";
import { buildTicketOverviewContainer, formatTicketNumber, syncTicketOverviewMessage } from "./ticketOverview.js";
import { BotError, NotFoundError, PermissionError, ValidationError } from "../../errors/index.js";
import { appendAuditLog } from "../../services/auditService.js";
import { isBlacklisted } from "../../repositories/ticketBlacklistRepository.js";
import { deleteTicketVoiceChannel } from "../voice/tempVoiceManager.js";
import { repostFormAttachments, type FormFile } from "../../lib/formAttachments.js";

export const ticketCooldowns = new Map<string, number>();

export const openTickets = new Map<string, TicketRecord>();

export function hasCooldown(userId: string): boolean {
    const expiresAt = ticketCooldowns.get(userId);
    return Boolean(expiresAt && expiresAt > Date.now());
}

export function setCooldown(userId: string, seconds = 60): void {
    const now = Date.now();
    // Esquece os cooldowns já expirados — sem isto o mapa guardava todos os membros que
    // alguma vez abriram um ticket, até ao próximo reinício.
    if (ticketCooldowns.size > 500) {
        for (const [id, expiresAt] of ticketCooldowns) if (expiresAt <= now) ticketCooldowns.delete(id);
    }
    ticketCooldowns.set(userId, now + Math.max(0, seconds) * 1000);
}

// Abrir/fechar em curso. Um duplo clique (ou dois membros da staff ao mesmo tempo) chegava
// ao bot como dois pedidos que passavam ambos as verificações — dois canais, ou dois
// transcripts e duas mensagens de fecho. Uma instância só (lock na BD), por isso basta memória.
const ticketsBeingOpened = new Set<string>();
const ticketsBeingClosed = new Set<string>();

async function exclusively<T>(running: Set<string>, key: string, busyMessage: string, task: () => Promise<T>): Promise<T> {
    if (running.has(key)) throw new ValidationError(busyMessage);
    running.add(key);
    try {
        return await task();
    } finally {
        running.delete(key);
    }
}

export function createTicket(
    guild: Guild,
    user: User,
    category: TicketCategory,
    reason: string,
    config: GuildConfig,
    clipUrl: string | null = null,
    formResponses: TicketFormResponseEntry[] = [],
    attachments: FormFile[] = [],
    options: OpenTicketOptions = {},
): Promise<TextChannel> {
    return exclusively(ticketsBeingOpened, `${guild.id}:${user.id}`, t("Já estamos a abrir um ticket para ti — aguarda um instante."), () =>
        openTicket(guild, user, category, reason, config, clipUrl, formResponses, attachments, options));
}

export interface OpenTicketOptions {
    /** De onde vem o ticket (fica em `tickets.source`); "modmail" = conversa por mensagem privada. */
    source?: string | null;
    /** O autor não vê o canal (modmail: fala com a equipa por DM, o bot encaminha). */
    hideFromOwner?: boolean;
}

/**
 * Nome do canal no formato configurado. Só leva `-2`, `-3`… quando a mesma pessoa já tem
 * outro ticket aberto com esse nome (`exceptChannelId` = o próprio canal, ao mudar de categoria).
 */
export async function ticketChannelNameFor(
    guild: Guild,
    config: GuildConfig,
    category: TicketCategory,
    ticketNumber: number | null,
    ownerId: string,
    username: string,
    exceptChannelId?: string,
): Promise<string> {
    const base = buildTicketChannelName({
        format: config.ticket_name_format,
        category: getCategoryLabel(config, category),
        categoryId: category,
        number: ticketNumber,
        username,
    });
    const taken = (await getOpenTicketsByGuild(guild.id).catch(() => []))
        .filter((open) => open.owner_id === ownerId && open.channel_id !== exceptChannelId)
        .map((open) => guild.channels.cache.get(open.channel_id)?.name)
        .filter((name): name is string => Boolean(name));
    return uniqueTicketChannelName(base, taken);
}

type TicketClosedListener = (ticket: TicketRecord, channel: TextChannel) => unknown;
const closedListeners: TicketClosedListener[] = [];

/** Avisa outros módulos (ex.: modmail) quando um ticket é fechado, sem dependências circulares. */
export function onTicketClosed(listener: TicketClosedListener): void {
    closedListeners.push(listener);
}

async function openTicket(
    guild: Guild,
    user: User,
    category: TicketCategory,
    reason: string,
    config: GuildConfig,
    clipUrl: string | null,
    formResponses: TicketFormResponseEntry[],
    attachments: FormFile[],
    options: OpenTicketOptions,
): Promise<TextChannel> {
    if (await isBlacklisted(guild.id, user.id)) {
        throw new PermissionError(t("Estás impedido de abrir tickets neste servidor."));
    }

    const maxOpen = Math.max(1, config.ticket_max_open ?? 3);
    const totalOpen = await countOpenTicketsByOwner(guild.id, user.id);
    if (totalOpen >= maxOpen) {
        throw new ValidationError(t("Já atingiste o limite de {count, plural, one {# ticket aberto} other {# tickets abertos}} em simultâneo.", { count: maxOpen }));
    }

    const botId = guild.members.me?.id;
    if (!botId) {
        throw new BotError(t("O bot não conseguiu validar as suas permissões nesta guild."));
    }

    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...(options.hideFromOwner ? [] : [{ id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }]),
        { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    ];

    if (config.staff_role) {
        overwrites.push({ id: config.staff_role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }

    if (config.admin_role && config.admin_role !== config.staff_role) {
        overwrites.push({ id: config.admin_role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] });
    }

    // Número do ticket neste servidor (#0042) — vai no estado e nos logs (e no nome do canal,
    // se o formato o pedir), para a equipa se referir a um ticket sem copiar ids. Uma falha
    // não impede a abertura.
    const ticketNumber = await nextTicketNumber(guild.id).catch(() => null);

    const channel = await guild.channels.create({
        name: await ticketChannelNameFor(guild, config, category, ticketNumber, user.id, user.username),
        type: ChannelType.GuildText,
        parent: getCategoryChannelId(config, category) ?? undefined,
        permissionOverwrites: overwrites,
        reason: t("Ticket {category} aberto por {user}", { category, user: user.tag }),
    });

    const ticket: TicketRecord = {
        id: randomUUID(),
        ticket_number: ticketNumber,
        guild_id: guild.id,
        channel_id: channel.id,
        ticket_message_id: null,
        owner_id: user.id,
        owner_tag: user.tag,
        staff_id: null,
        staff_tag: null,
        category,
        reason,
        clip_url: clipUrl,
        form_responses_json: serializeTicketFormResponses(formResponses),
        status: "open",
        priority: "normal",
        player_identifier: null,
        internal_note: null,
        transcript_id: null,
        first_response_at: null,
        last_activity_at: new Date().toISOString(),
        rating: null,
        rating_comment: null,
        rated_at: null,
        feedback_message_id: null,
        close_request_message: null,
        close_requested_by_id: null,
        close_requested_by_tag: null,
        close_requested_at: null,
        close_request_deadline_at: null,
        close_request_last_reminder_at: null,
        created_at: new Date().toISOString(),
        closed_at: null,
        source: options.source ?? null,
    };

    await insertTicket(ticket);
    setCooldown(user.id, config.ticket_cooldown_seconds ?? 60);

    const message = await channel.send({
        components: [buildTicketOverviewContainer(ticket, config)],
        flags: CV2_FLAG,
    });

    const categoryConfig = getTicketCategories(config).find((entry) => entry.id === category) ?? null;

    // CV2 messages can't carry `content`, so the ping goes in a separate lightweight message.
    // On top of the owner + staff role, ping any category-specific roles.
    const pingRoleIds = [config.staff_role, ...(categoryConfig?.ping_roles ?? [])].filter(Boolean) as string[];
    const uniqueRoleIds = [...new Set(pingRoleIds)];
    // No modmail o autor não está no canal: mencioná-lo só faria um ping sem sentido.
    const mentions = [...(options.hideFromOwner ? [] : [user.toString()]), ...uniqueRoleIds.map((id) => `<@&${id}>`)].join(" ");
    if (mentions) {
        await channel.send({ content: mentions, allowedMentions: { parse: ["users", "roles"] } }).catch(() => null);
    }

    // Optional per-category welcome message inside the ticket.
    if (categoryConfig?.welcome_message?.trim()) {
        await channel.send({
            components: [buildContainer({
                color: getEmbedColor(config),
                thumbnailUrl: config.branding_logo,
                title: `${emoji.ticket} ${t("Bem-vindo(a)!")}`,
                description: categoryConfig.welcome_message.trim().slice(0, 2000),
                footerText: getFooterText(config),
            })],
            flags: CV2_FLAG,
        }).catch(() => null);
    }

    // Outside support hours → informative "team offline" notice (no privileged intents needed).
    if (isSupportOffline(config)) {
        const notice = buildOfflineNotice(config);
        if (notice) await channel.send({ components: [notice], flags: CV2_FLAG }).catch(() => null);
    }

    // Ficheiros anexados no formulário: o link da interação é temporário, por isso voltam a
    // ser enviados para o canal (ficam no ticket e no transcript). Nunca atrasa a abertura.
    if (attachments.length > 0) {
        safeFireAndForget(repostFormAttachments(channel, guild.premiumTier, attachments, `${emoji.attach} ${t("**Anexos do formulário** — enviados por {user}", { user: String(user) })}`));
    }

    // Grant the client/customer role to the ticket owner, if configured.
    if (config.client_role) {
        safeFireAndForget(
            guild.members.fetch(user.id).then((member) => member.roles.add(config.client_role as string, t("Cliente com ticket aberto"))),
        );
    }

    await updateTicketByChannel(channel.id, { ticket_message_id: message.id });
    openTickets.set(channel.id, { ...ticket, ticket_message_id: message.id });

    appendAuditLog({ guildId: guild.id, actorId: user.id, action: "ticket.open", details: { ticketId: ticket.id, channelId: channel.id, category } });

    await sendLog(guild.client, guild.id, "TICKET_OPEN", {
        description: t("{user} abriu um ticket em **{category}**.", { user: String(user), category: getCategoryLabel(config, category) }),
        fields: [
            { name: t("Informação do ticket"), value: `${ticketNumber ? `${t("Número: {number}", { number: formatTicketNumber(ticketNumber) })}\n` : ""}${t("Canal: {channel}\nTicket ID: {id}\nCategoria: {category}", { channel: String(channel), id: ticket.id, category: getCategoryLabel(config, category) })}` },
            { name: t("Informação do criador"), value: t("Criador: {user}\nUsername: {tag}\nID: {id}", { user: String(user), tag: user.tag, id: user.id }) },
            ...buildTicketSemanticFields(getTicketForm(config, category), { reason, clipUrl, hasResponses: formResponses.length > 0 }),
            ...buildTicketResponseFields(formResponses),
        ],
    });

    return channel;
}

function canClose(member: GuildMember, ticket: TicketRecord, config: GuildConfig): boolean {
    if (member.id === ticket.owner_id) return true;
    if (ticket.staff_id && member.id === ticket.staff_id) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (config.admin_role && member.roles.cache.has(config.admin_role)) return true;
    return false;
}

export async function assumeTicket(channel: TextChannel, staff: GuildMember, config: GuildConfig): Promise<void> {
    const ticket = await getTicketByChannel(channel.id);
    if (!ticket || ticket.status !== "open") {
        throw new NotFoundError(t("Ticket não encontrado ou já encerrado."));
    }

    if (ticket.staff_id === staff.id) {
        throw new ValidationError(t("Este ticket já está assumido por ti."));
    }

    if (ticket.staff_id) {
        throw new ValidationError(t("Este ticket já está assumido por {staff}. Usa o painel staff para reatribuir.", { staff: `<@${ticket.staff_id}>` }));
    }

    await updateTicketByChannel(channel.id, {
        staff_id: staff.id,
        staff_tag: staff.user.tag,
        first_response_at: ticket.first_response_at ?? new Date().toISOString(),
    });

    const updatedTicket = (await getTicketByChannel(channel.id)) ?? { ...ticket, staff_id: staff.id, staff_tag: staff.user.tag, first_response_at: ticket.first_response_at ?? new Date().toISOString() };
    openTickets.set(channel.id, updatedTicket);
    await syncTicketOverviewMessage(channel, config, updatedTicket);

    await channel.send({
        components: [buildContainer({ color: getEmbedColor(config), title: `${emoji.staff} ${t("Ticket assumido")}`, description: `${staff} ${t("assumiu a responsabilidade deste ticket.")}`, footerText: t("Ticket {id}", { id: ticket.id }) })],
        flags: CV2_FLAG,
    });

    appendAuditLog({ guildId: channel.guild.id, actorId: staff.id, action: "ticket.assume", details: { ticketId: ticket.id, channelId: channel.id } });

    await sendLog(channel.client, channel.guild.id, "TICKET_ASSUMED", {
        description: t("{staff} assumiu um ticket.", { staff: String(staff) }),
        fields: [
            { name: t("Informação do ticket"), value: t("Canal: {channel}\nTicket ID: {id}\nCategoria: {category}", { channel: String(channel), id: ticket.id, category: getCategoryLabel(config, ticket.category) }) },
            { name: t("Informação do executor"), value: t("Executor: {user}\nUsername: {tag}\nID: {id}", { user: String(staff), tag: staff.user.tag, id: staff.id }) },
        ],
    });
}

/**
 * `autoReason`, quando definido, marca o fecho como AUTOMÁTICO (não uma ação humana):
 * ignora a verificação de permissão de `canClose` (o "executor" já não é necessariamente
 * membro do servidor — ex.: saiu), troca a mensagem/log para o motivo dado, e salta o
 * pedido de avaliação por DM (pouco sentido pedir isso a quem acabou de sair).
 */
export function closeTicket(channel: TextChannel, closedBy: GuildMember, config: GuildConfig, autoReason?: string): Promise<void> {
    return exclusively(ticketsBeingClosed, channel.id, t("Este ticket já está a ser fechado."), () => closeTicketNow(channel, closedBy, config, autoReason));
}

async function closeTicketNow(channel: TextChannel, closedBy: GuildMember, config: GuildConfig, autoReason?: string): Promise<void> {
    const ticket = await getTicketByChannel(channel.id);
    if (!ticket || ticket.status === "closed") {
        throw new ValidationError(t("Este ticket já se encontra fechado."));
    }

    if (!autoReason && !canClose(closedBy, ticket, config)) {
        throw new PermissionError(t("Não tens permissão para fechar este ticket."));
    }

    await clearCloseRequestState(channel.id);

    const transcriptId = await generateTranscript(channel, ticket);
    await updateTicketByChannel(channel.id, {
        status: "closed",
        transcript_id: transcriptId,
        closed_at: new Date().toISOString(),
    });
    const closedTicket = (await getTicketByChannel(channel.id)) ?? { ...ticket, status: "closed", transcript_id: transcriptId, closed_at: new Date().toISOString() };
    await syncTicketOverviewMessage(channel, config, closedTicket);
    openTickets.delete(channel.id);

    await channel.send({
        components: [buildContainer({
            color: COLORS.danger,
            title: `${emoji.close} ${t("Pedido encerrado")}`,
            description: autoReason
                ? t("Este atendimento foi encerrado automaticamente: {reason}.", { reason: autoReason })
                : t("Este atendimento foi concluído por {user}.", { user: String(closedBy) }),
            fields: [{ name: t("Transcript"), value: transcriptId ? t("Registo guardado com o ID `{id}`.", { id: transcriptId }) : t("O transcript não ficou disponível.") }],
            footerText: t("Ticket {id}", { id: ticket.id }),
        })],
        flags: CV2_FLAG,
    });

    appendAuditLog({ guildId: channel.guild.id, actorId: closedBy.id, action: "ticket.close", details: { ticketId: ticket.id, transcriptId, auto: Boolean(autoReason), autoReason } });

    if (!autoReason) await maybeSendRatingPrompt(channel.client, closedTicket, config);

    await sendLog(channel.client, channel.guild.id, "TICKET_CLOSED", {
        description: autoReason ? t("Ticket encerrado automaticamente: {reason}.", { reason: autoReason }) : t("{user} fechou um ticket.", { user: String(closedBy) }),
        fields: [
            { name: t("Informação do ticket"), value: `${ticket.ticket_number ? `${t("Número: {number}", { number: formatTicketNumber(ticket.ticket_number) })}\n` : ""}${t("Nome do ticket: {name}\nID do transcript: `{transcript}`\nMotivo: {reason}", { name: channel.name, transcript: transcriptId, reason: autoReason ?? t("Encerrado manualmente") })}` },
            { name: t("Informação do criador"), value: t("Criador: {user}\nUsername: {tag}\nID: {id}", { user: `<@${ticket.owner_id}>`, tag: ticket.owner_tag, id: ticket.owner_id }) },
            { name: t("Informação do executor"), value: autoReason ? t("Executor: EPA BOTCHI (automático)") : t("Executor: {user}\nUsername: {tag}\nID: {id}", { user: String(closedBy), tag: closedBy.user.tag, id: closedBy.id }) },
        ],
        transcriptId,
    });

    // Sala de voz temporária do ticket (se existir) cai junto com ele.
    safeFireAndForget(deleteTicketVoiceChannel(channel.guild, channel.id));
    for (const listener of closedListeners) safeFireAndForget(Promise.resolve().then(() => listener(closedTicket, channel)));

    setTimeout(() => {
        safeFireAndForget(channel.delete(t("Ticket encerrado automaticamente pelo EPA BOTCHI.")));
    }, 5000);
}

export async function getTicketFromCache(channelId: string): Promise<TicketRecord | null> {
    return openTickets.get(channelId) ?? (await getTicketByChannel(channelId));
}

export async function warmTicketCache(guildId: string): Promise<number> {
    const tickets = await getOpenTicketsByGuild(guildId);
    for (const ticket of tickets) {
        openTickets.set(ticket.channel_id, ticket);
    }
    return tickets.length;
}
