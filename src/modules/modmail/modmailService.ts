import {
    ButtonBuilder,
    ButtonStyle,
    GuildPremiumTier,
    StringSelectMenuBuilder,
    type ButtonInteraction,
    type Client,
    type Guild,
    type Message,
    type StringSelectMenuInteraction,
    type TextChannel,
} from "discord.js";
import { COLORS, getEmbedColor } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e, emoji } from "../../lib/emojis.js";
import { repostFormAttachments, type FormFile } from "../../lib/formAttachments.js";
import { buildCustomId } from "../../lib/ids.js";
import { t, withGuildLocale } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { updateTicketByChannel } from "../../repositories/ticketRepository.js";
import { isAllowedGuild, ourGuilds } from "../../config.js";
import type { TicketRecord } from "../../types.js";
import { touchTicketActivity } from "../tickets/autoCloseManager.js";
import { getTicketCategories } from "../tickets/categories.js";
import { createTicket, onTicketClosed, openTickets } from "../tickets/ticketManager.js";
import { getModmailSettings } from "./modmailSettings.js";

export const MODMAIL_SOURCE = "modmail";
const PENDING_TTL_MS = 10 * 60_000;
const MAX_PENDING = 5;

interface PendingMessage { content: string; files: FormFile[] }

// Mensagens escritas antes de a pessoa escolher o servidor (em memória, 10 minutos).
const pending = new Map<string, { messages: PendingMessage[]; at: number }>();

function filesOf(message: Message): FormFile[] {
    return [...message.attachments.values()].slice(0, 5).map((a) => ({ name: a.name, url: a.url, size: a.size }));
}

/** A conversa de modmail aberta desta pessoa (a mais recente, se houver várias). */
export function openModmailFor(userId: string, guildId?: string): TicketRecord | null {
    let found: TicketRecord | null = null;
    for (const ticket of openTickets.values()) {
        if (ticket.owner_id !== userId || ticket.source !== MODMAIL_SOURCE) continue;
        if (guildId && ticket.guild_id !== guildId) continue;
        if (!found || ticket.created_at > found.created_at) found = ticket;
    }
    return found;
}

async function eligibleGuilds(client: Client<true>, userId: string): Promise<Guild[]> {
    const out: Guild[] = [];
    for (const guild of ourGuilds(client)) {
        if (!isAllowedGuild(guild.id)) continue;
        const settings = await getModmailSettings(guild.id).catch(() => null);
        if (!settings?.enabled) continue;
        const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
        if (member) out.push(guild);
        if (out.length >= 25) break;
    }
    return out;
}

// ─── Membro → equipa ─────────────────────────────────────────────────────────

async function relayToTicket(client: Client<true>, ticket: TicketRecord, author: Message["author"], entry: PendingMessage): Promise<boolean> {
    const channel = client.channels.cache.get(ticket.channel_id) as TextChannel | undefined;
    if (!channel) return false;
    const sent = entry.content
        ? await channel.send({
            components: [buildContainer({
                color: COLORS.info,
                title: `${e("message")} ${author.username}`,
                thumbnailUrl: author.displayAvatarURL({ size: 128 }),
                description: entry.content.slice(0, 3800),
            })],
            flags: CV2_FLAG,
            allowedMentions: { parse: [] },
        }).then(() => true).catch(() => false)
        : true;
    if (entry.files.length) await repostFormAttachments(channel, channel.guild.premiumTier, entry.files, `${emoji.attach} ${t("Anexos de {user}", { user: author.username })}`).catch(() => null);
    touchTicketActivity(channel.id);
    return sent;
}

function chooser(guilds: Guild[]) {
    const rows = guilds.length <= 4
        ? [row(...guilds.map((g) => new ButtonBuilder().setCustomId(buildCustomId("mm", "open", g.id)).setLabel(g.name.slice(0, 80)).setStyle(ButtonStyle.Primary)))]
        : [row(new StringSelectMenuBuilder().setCustomId(buildCustomId("mm", "pick")).setPlaceholder(t("Escolhe o servidor")).addOptions(guilds.map((g) => ({ label: g.name.slice(0, 100), value: g.id }))))];
    rows.push(row(new ButtonBuilder().setCustomId(buildCustomId("mm", "cancel")).setLabel(t("Cancelar")).setStyle(ButtonStyle.Secondary)));
    return buildContainer({
        color: COLORS.primary,
        title: `${e("message")} ${t("Falar com a equipa")}`,
        description: guilds.length === 1
            ? t("Queres enviar esta mensagem à equipa de **{server}**? A conversa continua aqui, por mensagem privada.", { server: guilds[0].name })
            : t("A que servidor queres enviar esta mensagem? A conversa continua aqui, por mensagem privada."),
        rows,
    });
}

/** Mensagem privada ao bot: encaminha para a conversa aberta, ou pergunta para que servidor é. */
export async function handleDirectMessage(message: Message): Promise<void> {
    if (message.author.bot || message.inGuild()) return;
    const entry: PendingMessage = { content: message.content.trim(), files: filesOf(message) };
    if (!entry.content && entry.files.length === 0) return;
    const client = message.client as Client<true>;

    const open = openModmailFor(message.author.id);
    if (open) {
        const ok = await withGuildLocale(open.guild_id, () => relayToTicket(client, open, message.author, entry));
        await message.react(ok ? "✅" : "❌").catch(() => null);
        return;
    }

    const now = Date.now();
    const current = pending.get(message.author.id);
    if (current && now - current.at < PENDING_TTL_MS) {
        // Já há uma pergunta à espera de resposta: junta a mensagem e não repete a pergunta.
        if (current.messages.length < MAX_PENDING) current.messages.push(entry);
        return;
    }
    const guilds = await eligibleGuilds(client, message.author.id);
    if (guilds.length === 0) return;
    pending.set(message.author.id, { messages: [entry], at: now });
    await withGuildLocale(guilds[0].id, () => message.reply({ components: [chooser(guilds)], flags: CV2_FLAG, allowedMentions: { repliedUser: false } })).catch(() => null);
}

/** A pessoa escolheu o servidor: abre a conversa (ticket escondido dela) e entrega o que escreveu. */
export async function openModmail(interaction: ButtonInteraction | StringSelectMenuInteraction, guildId: string): Promise<void> {
    const client = interaction.client as Client<true>;
    const guild = client.guilds.cache.get(guildId);
    await withGuildLocale(guildId, async () => {
        const fail = (text: string) => interaction.update({ components: [buildContainer({ color: COLORS.danger, description: `${emoji.error} ${text}` })] });
        const waiting = pending.get(interaction.user.id);
        if (!guild || !waiting || Date.now() - waiting.at > PENDING_TTL_MS) return void fail(t("Esta pergunta expirou. Escreve outra vez a tua mensagem."));
        const settings = await getModmailSettings(guildId);
        if (!settings.enabled || !isAllowedGuild(guildId)) return void fail(t("Este servidor já não recebe mensagens privadas."));

        let ticket = openModmailFor(interaction.user.id, guildId);
        if (!ticket) {
            const config = await ensureGuildConfig(guildId);
            const categories = getTicketCategories(config);
            const category = categories.find((c) => c.id === settings.category) ?? categories[0];
            if (!category) return void fail(t("Este servidor ainda não está pronto para receber mensagens. Tenta mais tarde."));
            let channel: TextChannel;
            try {
                channel = await createTicket(guild, interaction.user, category.id, t("Conversa por mensagem privada"), config, null, [], [], { source: MODMAIL_SOURCE, hideFromOwner: true });
            } catch (error) {
                return void fail(error instanceof Error ? error.message : t("Não foi possível abrir a conversa."));
            }
            await channel.send({
                components: [buildContainer({
                    color: COLORS.info,
                    title: `${e("message")} ${t("Conversa por mensagem privada")}`,
                    description: t("{user} escreveu ao bot. Tudo o que escreveres aqui chega-lhe por mensagem privada — exceto mensagens começadas por `{prefix}`, que ficam só para a equipa.", { user: `<@${interaction.user.id}>`, prefix: settings.note_prefix }),
                })],
                flags: CV2_FLAG,
                allowedMentions: { parse: [] },
            }).catch(() => null);
            ticket = openTickets.get(channel.id) ?? null;
        }
        pending.delete(interaction.user.id);
        if (!ticket) return void fail(t("Não foi possível abrir a conversa."));
        for (const entry of waiting.messages) await relayToTicket(client, ticket, interaction.user, entry);

        const config = await ensureGuildConfig(guildId);
        await interaction.update({
            components: [buildContainer({
                color: getEmbedColor(config),
                title: `${emoji.success} ${t("Mensagem entregue à equipa de {server}", { server: guild.name })}`,
                description: settings.greeting ?? t("Vamos responder aqui, nesta conversa. Podes continuar a escrever — cada mensagem chega à equipa."),
            })],
        });
    });
}

export function clearPendingModmail(userId: string): void {
    pending.delete(userId);
}

// ─── Equipa → membro ─────────────────────────────────────────────────────────

/** Mensagem da equipa num canal de modmail: segue para o membro por DM (salvo notas internas). */
export async function handleStaffMessage(message: Message<true>): Promise<void> {
    if (message.author.bot || message.system || message.webhookId) return;
    const ticket = openTickets.get(message.channelId);
    if (!ticket || ticket.source !== MODMAIL_SOURCE) return;
    const settings = await getModmailSettings(message.guildId);
    const content = message.content.trim();
    if (content.startsWith(settings.note_prefix)) return;
    const files = filesOf(message);
    if (!content && files.length === 0) return;

    const user = await message.client.users.fetch(ticket.owner_id).catch(() => null);
    const config = await ensureGuildConfig(message.guildId);
    const who = settings.anonymous_replies
        ? t("Equipa de {server}", { server: message.guild.name })
        : t("{name} · equipa de {server}", { name: message.member?.displayName ?? message.author.username, server: message.guild.name });
    let ok = false;
    if (user) {
        const dm = await user.createDM().catch(() => null);
        if (dm) {
            ok = content
                ? await dm.send({ components: [buildContainer({ color: getEmbedColor(config), title: `${e("message")} ${who}`, description: content.slice(0, 3800) })], flags: CV2_FLAG }).then(() => true).catch(() => false)
                : true;
            if (ok && files.length) await repostFormAttachments(dm, GuildPremiumTier.None, files, `${emoji.attach} ${who}`).catch(() => null);
        }
    }
    await message.react(ok ? "✅" : "❌").catch(() => null);
    if (!ok) {
        await message.reply({ content: `-# ${t("Não consegui entregar: o membro saiu ou tem as mensagens privadas fechadas.")}`, allowedMentions: { repliedUser: false } }).catch(() => null);
        return;
    }
    // A primeira resposta da equipa conta para o SLA (num ticket normal, conta o "assumir").
    if (!ticket.first_response_at) {
        const at = new Date().toISOString();
        openTickets.set(message.channelId, { ...ticket, first_response_at: at });
        await updateTicketByChannel(message.channelId, { first_response_at: at }).catch(() => null);
    }
}

// Ao fechar uma conversa de modmail, o membro fica a saber por DM.
onTicketClosed(async (ticket, channel) => {
    if (ticket.source !== MODMAIL_SOURCE) return;
    await withGuildLocale(ticket.guild_id, async () => {
        const settings = await getModmailSettings(ticket.guild_id);
        const user = await channel.client.users.fetch(ticket.owner_id).catch(() => null);
        await user?.send({
            components: [buildContainer({
                color: COLORS.neutral,
                title: `${emoji.close} ${t("Conversa encerrada")}`,
                description: settings.closing ?? t("A conversa com a equipa de **{server}** foi encerrada. Se precisares de mais alguma coisa, é só escreveres outra vez.", { server: channel.guild.name }),
            })],
            flags: CV2_FLAG,
        }).catch(() => null);
    }).catch((error) => logger.warn("Modmail: não consegui avisar o fecho:", error));
});
