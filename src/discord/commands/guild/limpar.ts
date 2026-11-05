import { createCommand } from "#base";
import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type GuildMember,
    type GuildTextBasedChannel,
    type Message,
    type RepliableInteraction,
} from "discord.js";
import { errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { parseDuration } from "../../../modules/giveaways/giveawayCreator.js";
import { hasModAccess } from "../../../modules/moderation/moderationService.js";
import { NO_FILTER, PURGE_KINDS, PURGE_KIND_LABELS, parseMessageRef, type PurgeAuthors, type PurgeFilter, type PurgeKind } from "../../../modules/moderation/purgeFilters.js";
import { PURGE_MAX, purgeChannelProblem, rangeMarkedView, startPurge, toggleRangeMark, wideChannels, type PurgeRequest } from "../../../modules/moderation/purgeService.js";

// /limpar — apagar mensagens a sério: as últimas N, a partir de uma, um intervalo, por tempo, ou de
// um membro (neste canal ou em todos), com filtros. E três atalhos no botão direito (Apps).

const MAX_PERIOD_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;
const PURGE_CHANNEL_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
] as const;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const memberOpt = { name: "membro", description: t("Só as mensagens deste membro"), type: ApplicationCommandOptionType.User as const, required: false };
const authorsOpt = {
    name: "autores",
    description: t("Só de bots ou só de pessoas"),
    type: ApplicationCommandOptionType.String as const,
    required: false,
    choices: [{ name: t("Só bots e webhooks"), value: "bots" }, { name: t("Só pessoas (sem bots)"), value: "humanos" }],
};
const kindOpt = {
    name: "tipo",
    description: t("Só mensagens de um tipo"),
    type: ApplicationCommandOptionType.String as const,
    required: false,
    choices: PURGE_KINDS.map((kind) => ({ name: capitalize(t(PURGE_KIND_LABELS[kind])), value: kind })),
};
const containsOpt = { name: "contem", description: t("Só as que têm este texto (não liga a maiúsculas)"), type: ApplicationCommandOptionType.String as const, required: false, maxLength: 100 };
const pinnedOpt = { name: "fixadas", description: t("Apagar também as fixadas (por defeito ficam)"), type: ApplicationCommandOptionType.Boolean as const, required: false };
const channelOpt = { name: "canal", description: t("Noutro canal (por defeito, este)"), type: ApplicationCommandOptionType.Channel as const, required: false, channelTypes: PURGE_CHANNEL_TYPES };
const filterOpts = [memberOpt, authorsOpt, kindOpt, containsOpt, pinnedOpt, channelOpt];
const refOpt = (name: string, description: string) => ({ name, description, type: ApplicationCommandOptionType.String as const, required: true, maxLength: 200 });

function fail(interaction: RepliableInteraction, text: string) {
    return interaction.editReply({ components: [errorContainer(text)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
}

async function canPurge(member: GuildMember): Promise<boolean> {
    return hasModAccess(member, PermissionFlagsBits.ManageMessages);
}

function hintOf(message: Message): PurgeRequest["authorHint"] {
    return { id: message.author.id, name: message.member?.displayName ?? message.author.displayName };
}

function readFilter(interaction: ChatInputCommandInteraction<"cached">): PurgeFilter {
    return {
        userId: interaction.options.getUser("membro")?.id ?? null,
        authors: (interaction.options.getString("autores") as PurgeAuthors | null) ?? "todos",
        kind: (interaction.options.getString("tipo") as PurgeKind | null) ?? null,
        contains: interaction.options.getString("contem")?.trim() || null,
        includePinned: interaction.options.getBoolean("fixadas") ?? false,
    };
}

/** Link/ID → a mensagem e o canal dela (o canal do link manda; senão, o `canal` ou este). */
async function resolveRef(interaction: ChatInputCommandInteraction<"cached">, input: string, fallback: GuildTextBasedChannel): Promise<{ channel: GuildTextBasedChannel; message: Message } | string> {
    const ref = parseMessageRef(input);
    if (!ref) return t("Não percebi «{input}». Usa o link da mensagem (botão direito → Copiar link da mensagem) ou o ID.", { input: input.slice(0, 60) });
    if (ref.guildId && ref.guildId !== interaction.guildId) return t("Esse link é de uma mensagem de outro servidor.");
    const found = ref.channelId ? interaction.guild.channels.cache.get(ref.channelId) : fallback;
    if (!found?.isTextBased()) return t("Não encontrei o canal dessa mensagem.");
    const problem = purgeChannelProblem(found, interaction.member);
    if (problem) return problem;
    const message = await found.messages.fetch(ref.messageId).catch(() => null);
    if (!message) return t("Não encontrei essa mensagem em {channel}. Se for de outro canal, usa o link (botão direito → Copiar link da mensagem).", { channel: `<#${found.id}>` });
    return { channel: found, message };
}

function readPeriod(input: string | null, fallbackMs: number): number | string {
    if (!input) return fallbackMs;
    const ms = parseDuration(input);
    if (!ms || ms < 60_000) return t("Duração inválida — usa algo como `15m`, `2h` ou `1d`.");
    if (ms > MAX_PERIOD_MS) return t("No máximo 30 dias de cada vez.");
    return ms;
}

async function buildRequest(interaction: ChatInputCommandInteraction<"cached">): Promise<PurgeRequest | string> {
    const sub = interaction.options.getSubcommand();
    const filter = readFilter(interaction);
    const picked = interaction.options.getChannel("canal") ?? interaction.channel;
    if (!picked?.isTextBased()) return t("Aqui não há mensagens para apagar — escolhe um canal de texto.");
    const channel = picked;
    const base = { wide: false, filter, confirm: false, authorHint: null, fromUrl: null, toUrl: null } satisfies Partial<PurgeRequest>;

    switch (sub) {
        case "recentes":
            return { ...base, channelIds: [channel.id], scope: { type: "recentes", amount: interaction.options.getInteger("quantidade", true) } };
        case "desde": {
            const from = await resolveRef(interaction, interaction.options.getString("mensagem", true), channel);
            if (typeof from === "string") return from;
            return { ...base, channelIds: [from.channel.id], scope: { type: "desde", fromId: from.message.id }, fromUrl: from.message.url, authorHint: hintOf(from.message) };
        }
        case "intervalo": {
            const start = await resolveRef(interaction, interaction.options.getString("inicio", true), channel);
            if (typeof start === "string") return start;
            const end = await resolveRef(interaction, interaction.options.getString("fim", true), start.channel);
            if (typeof end === "string") return end;
            if (end.channel.id !== start.channel.id) return t("As duas mensagens têm de estar no mesmo canal.");
            const [first, last] = BigInt(start.message.id) <= BigInt(end.message.id) ? [start.message, end.message] : [end.message, start.message];
            return {
                ...base,
                channelIds: [start.channel.id],
                scope: { type: "intervalo", fromId: first.id, toId: last.id },
                fromUrl: first.url,
                toUrl: last.url,
                authorHint: hintOf(first),
            };
        }
        case "periodo": {
            const ms = readPeriod(interaction.options.getString("duracao", true), DAY_MS);
            if (typeof ms === "string") return ms;
            return { ...base, channelIds: [channel.id], scope: { type: "periodo", since: Date.now() - ms } };
        }
        case "membro": {
            const ms = readPeriod(interaction.options.getString("periodo"), DAY_MS);
            if (typeof ms === "string") return ms;
            const since = Date.now() - ms;
            const wide = interaction.options.getBoolean("todos_canais") ?? false;
            return {
                ...base,
                wide,
                channelIds: wide ? wideChannels(interaction.guild, interaction.member, since) : [channel.id],
                scope: { type: "periodo", since },
            };
        }
    }
    return t("Opção desconhecida.");
}

createCommand({
    name: "limpar",
    description: t("Apagar mensagens: as últimas N, a partir de uma, um intervalo, por tempo ou de um membro."),
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
    options: [
        {
            name: "recentes",
            description: t("Apaga as últimas N mensagens (com filtros opcionais)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "quantidade", description: t("Quantas (1 a {max})", { max: PURGE_MAX }), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: PURGE_MAX },
                ...filterOpts,
            ],
        },
        {
            name: "desde",
            description: t("Apaga a partir de uma mensagem (inclusive) até à mais recente."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [refOpt("mensagem", t("Link ou ID da mensagem (botão direito → Copiar link da mensagem)")), ...filterOpts],
        },
        {
            name: "intervalo",
            description: t("Apaga as mensagens entre duas (as duas inclusive)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                refOpt("inicio", t("Link ou ID da primeira mensagem a apagar")),
                refOpt("fim", t("Link ou ID da última mensagem a apagar")),
                ...filterOpts,
            ],
        },
        {
            name: "periodo",
            description: t("Apaga o que foi escrito nos últimos minutos, horas ou dias."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "duracao", description: t("Ex.: 15m, 2h, 1d (máx. 30 dias)"), type: ApplicationCommandOptionType.String, required: true, maxLength: 20 },
                ...filterOpts,
            ],
        },
        {
            name: "membro",
            description: t("Apaga as mensagens de um membro — neste canal ou em todos."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "membro", description: t("De quem (também dá com o ID de quem já saiu)"), type: ApplicationCommandOptionType.User, required: true },
                { name: "periodo", description: t("Desde quando: 1h, 24h, 7d… (por defeito, 24h; máx. 30 dias)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 20 },
                { name: "todos_canais", description: t("Procurar em todos os canais (por defeito, só neste)"), type: ApplicationCommandOptionType.Boolean, required: false },
                kindOpt,
                containsOpt,
                pinnedOpt,
                channelOpt,
            ],
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!(await canPurge(interaction.member))) return void fail(interaction, t("Não tens permissão para apagar mensagens."));
        const request = await buildRequest(interaction);
        if (typeof request === "string") return void fail(interaction, request);
        await startPurge(interaction, request);
    },
});

// ─── Botão direito → Apps ─────────────────────────────────────────────────────

createCommand({
    name: "Limpar a partir daqui",
    type: ApplicationCommandType.Message,
    defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!(await canPurge(interaction.member))) return void fail(interaction, t("Não tens permissão para apagar mensagens."));
        const message = interaction.targetMessage;
        await startPurge(interaction, {
            channelIds: [message.channelId],
            wide: false,
            scope: { type: "desde", fromId: message.id },
            filter: NO_FILTER,
            confirm: true,
            authorHint: hintOf(message),
            fromUrl: message.url,
            toUrl: null,
        });
    },
});

createCommand({
    name: "Limpar intervalo",
    type: ApplicationCommandType.Message,
    defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!(await canPurge(interaction.member))) return void fail(interaction, t("Não tens permissão para apagar mensagens."));
        const message = interaction.targetMessage;
        const problem = purgeChannelProblem(message.channel, interaction.member);
        if (problem) return void fail(interaction, problem);
        const start = toggleRangeMark(interaction.guildId, interaction.user.id, message);
        if (!start) {
            return void interaction.editReply({ components: [rangeMarkedView(message)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        }
        const [fromUrl, toUrl] = BigInt(start.messageId) < BigInt(message.id) ? [start.url, message.url] : [message.url, start.url];
        await startPurge(interaction, {
            channelIds: [message.channelId],
            wide: false,
            scope: { type: "intervalo", fromId: start.messageId, toId: message.id },
            filter: NO_FILTER,
            confirm: true,
            authorHint: hintOf(message),
            fromUrl,
            toUrl,
        });
    },
});

createCommand({
    name: "Limpar mensagens 24h",
    type: ApplicationCommandType.User,
    defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!(await canPurge(interaction.member))) return void fail(interaction, t("Não tens permissão para apagar mensagens."));
        const since = Date.now() - DAY_MS;
        await startPurge(interaction, {
            channelIds: wideChannels(interaction.guild, interaction.member, since),
            wide: true,
            scope: { type: "periodo", since },
            filter: { ...NO_FILTER, userId: interaction.targetUser.id },
            confirm: true,
            authorHint: null,
            fromUrl: null,
            toUrl: null,
        });
    },
});
