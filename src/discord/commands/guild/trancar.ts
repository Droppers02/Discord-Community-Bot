import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, ChannelType, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { buildContainer, errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { e } from "../../../lib/emojis.js";
import { t } from "../../../lib/i18n.js";
import { parseDelay } from "../../../lib/when.js";
import { timestamp } from "../../../lib/time.js";
import { hasModAccess } from "../../../modules/moderation/moderationService.js";
import { isLockable, lockChannel, locksOfGuild, lockServer, lockStatusView, unlockChannel, unlockServer } from "../../../modules/moderation/lockdown.js";

// /trancar e /destrancar — um canal ou o servidor inteiro, com duração opcional.

const LOCK_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildForum] as const;
const MAX_LOCK_MS = 7 * 86_400_000;

const channelOpt = { name: "canal", description: t("Que canal (por defeito, este)"), type: ApplicationCommandOptionType.Channel as const, required: false, channelTypes: LOCK_CHANNEL_TYPES };
const durationOpt = { name: "duracao", description: t("Abre sozinho daqui a… (ex.: 30m, 2h, 1d; vazio = até destrancarem)"), type: ApplicationCommandOptionType.String as const, required: false, maxLength: 20 };
const reasonOpt = { name: "motivo", description: t("Motivo (aparece no aviso do canal)"), type: ApplicationCommandOptionType.String as const, required: false, maxLength: 300 };

function reply(interaction: ChatInputCommandInteraction, text: string, ok = true) {
    return interaction.editReply({ components: [ok ? buildContainer({ color: COLORS.success, description: text }) : errorContainer(text)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
}

function readUntil(interaction: ChatInputCommandInteraction): number | null | "invalid" {
    const raw = interaction.options.getString("duracao");
    if (!raw) return null;
    const ms = parseDelay(raw);
    if (!ms || ms < 60_000 || ms > MAX_LOCK_MS) return "invalid";
    return Date.now() + ms;
}

createCommand({
    name: "trancar",
    description: t("Tranca um canal ou o servidor inteiro (ninguém escreve até destrancarem)."),
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    options: [
        { name: "canal", description: t("Tranca um canal."), type: ApplicationCommandOptionType.Subcommand, options: [channelOpt, durationOpt, reasonOpt] },
        { name: "servidor", description: t("Tranca todos os canais onde os membros escrevem (raids, confusões)."), type: ApplicationCommandOptionType.Subcommand, options: [durationOpt, reasonOpt] },
        { name: "estado", description: t("O que está trancado agora."), type: ApplicationCommandOptionType.Subcommand },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!(await hasModAccess(interaction.member, PermissionFlagsBits.ManageChannels))) return void reply(interaction, t("Não tens permissão para trancar canais."), false);
        const sub = interaction.options.getSubcommand();
        if (sub === "estado") return void interaction.editReply({ components: [await lockStatusView(interaction.guild)], flags: CV2_FLAG, allowedMentions: { parse: [] } });

        const until = readUntil(interaction);
        if (until === "invalid") return void reply(interaction, t("Duração inválida — usa algo como `30m`, `2h` ou `1d` (máx. 7 dias)."), false);
        const reason = interaction.options.getString("motivo")?.trim() || null;

        if (sub === "canal") {
            const channel = interaction.options.getChannel("canal") ?? interaction.channel;
            if (!isLockable(channel)) return void reply(interaction, t("Esse canal não dá para trancar (fios: tranca o canal de onde saem)."), false);
            const result = await lockChannel(channel, { source: "manual", reason, by: interaction.user.id, until });
            if (result.failed && !result.locked) return void reply(interaction, t("Não consegui trancar {channel} — preciso de **Gerir canal** e **Gerir permissões** lá.", { channel: `<#${channel.id}>` }), false);
            if (!result.locked) return void reply(interaction, t("{channel} já estava trancado.", { channel: `<#${channel.id}>` }), false);
            return void reply(interaction, `${e("lock")} ${t("{channel} trancado.", { channel: `<#${channel.id}>` })}${until ? ` ${t("Abre {when}.", { when: timestamp(until, "R") })}` : ""}`);
        }

        const result = await lockServer(interaction.guild, { source: "server", reason, by: interaction.user.id, until });
        return void reply(interaction, [
            `${e("lock")} **${t("Servidor trancado")}** — ${t("{count, plural, one {# canal} other {# canais}}", { count: result.channels })}`,
            result.failed ? `-# ${t("{n} canais falharam (permissões do bot).", { n: result.failed })}` : null,
            result.invitesPaused ? `-# ${t("Convites pausados.")}` : null,
            until ? `-# ${t("Abre sozinho {when}.", { when: timestamp(until, "R") })}` : `-# ${t("Para abrir: /destrancar servidor")}`,
        ].filter(Boolean).join("\n"));
    },
});

createCommand({
    name: "destrancar",
    description: t("Volta a abrir um canal ou o servidor."),
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    options: [
        { name: "canal", description: t("Abre um canal trancado."), type: ApplicationCommandOptionType.Subcommand, options: [channelOpt] },
        { name: "servidor", description: t("Abre todos os canais trancados pelo «trancar servidor» (ou pelo anti-raid)."), type: ApplicationCommandOptionType.Subcommand },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!(await hasModAccess(interaction.member, PermissionFlagsBits.ManageChannels))) return void reply(interaction, t("Não tens permissão para destrancar canais."), false);
        if (interaction.options.getSubcommand() === "servidor") {
            const restored = await unlockServer(interaction.guild, interaction.user.id);
            return void reply(interaction, restored ? `${e("unlock")} ${t("Servidor reaberto — {count, plural, one {# canal} other {# canais}}.", { count: restored })}` : t("O servidor não estava trancado."), restored > 0);
        }
        const channel = interaction.options.getChannel("canal") ?? interaction.channel;
        if (!isLockable(channel)) return void reply(interaction, t("Esse canal não dá para destrancar."), false);
        const locks = (await locksOfGuild(interaction.guildId)).filter((lock) => lock.channel_id === channel.id);
        if (!locks.length) return void reply(interaction, t("{channel} não está trancado pelo bot.", { channel: `<#${channel.id}>` }), false);
        await unlockChannel(channel, interaction.guildId, channel.id, locks);
        return void reply(interaction, `${e("unlock")} ${t("{channel} reaberto.", { channel: `<#${channel.id}>` })}`);
    },
});
