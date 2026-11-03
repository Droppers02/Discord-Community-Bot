import { createCommand } from "#base";
import { ApplicationCommandType, ButtonBuilder, ButtonStyle, GuildMember, MessageFlags } from "discord.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { buildContainer, errorContainer, row } from "../../../lib/containers.js";
import { CV2_FLAG, hasStaffAccess } from "../../../lib/discord.js";
import { emoji } from "../../../lib/emojis.js";
import { getEmbedColor, getFooterText } from "../../../lib/branding.js";
import { openTickets } from "../../../modules/tickets/ticketManager.js";
import { getVoiceSettings } from "../../../modules/voice/voiceSettings.js";
import { createTicketVoiceChannel, EMPTY_GRACE_MINUTES } from "../../../modules/voice/tempVoiceManager.js";
import { appendAuditLog } from "../../../services/auditService.js";
import { t } from "../../../lib/i18n.js";

createCommand({
    name: "voz",
    description: t("Cria a sala de voz privada deste ticket (dono + staff)."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inGuild() || !interaction.guild) return;
        const config = await ensureGuildConfig(interaction.guildId);

        const ticket = openTickets.get(interaction.channelId);
        if (!ticket) {
            await interaction.reply({ components: [errorContainer(t("Usa este comando dentro de um canal de ticket aberto."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        const isOwner = interaction.user.id === ticket.owner_id;
        if (!isOwner && !hasStaffAccess(interaction.member as GuildMember, config.staff_role, config.admin_role)) {
            await interaction.reply({ components: [errorContainer(t("Só o dono do ticket ou a staff podem criar a sala de voz."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        const settings = await getVoiceSettings(interaction.guildId);
        if (!settings.ticket_voice_enabled) {
            await interaction.reply({ components: [errorContainer(t("As salas de voz por ticket estão desativadas neste servidor (Config → Canais de voz)."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        await interaction.reply({
            components: [buildContainer({ color: getEmbedColor(config), title: `${emoji.pending} ${t("A preparar a sala de voz…")}` })],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });

        const channel = await createTicketVoiceChannel(interaction.guild, ticket, config).catch(() => null);
        if (!channel) {
            await interaction.editReply({ components: [errorContainer(t("Não consegui criar a sala de voz — confirma que tenho permissão Gerir Canais."))] });
            return;
        }

        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "ticket.voice.create", details: { ticketId: ticket.id, voiceChannelId: channel.id } });

        // Aviso público no ticket com botão de entrada direta na sala.
        const ticketChannel = channel.guild.channels.cache.get(ticket.channel_id);
        if (ticketChannel?.isTextBased()) await ticketChannel.send({
            components: [buildContainer({
                color: getEmbedColor(config),
                title: `${emoji.voice} ${t("Sala de voz do ticket criada")}`,
                description: t("{channel} — privada para {owner} e para a staff. Fecha sozinha ao fim de {minutes} min sem ninguém lá dentro, ou quando o ticket fechar.", { channel: String(channel), owner: `<@${ticket.owner_id}>`, minutes: EMPTY_GRACE_MINUTES }),
                footerText: getFooterText(config),
                rows: [row(new ButtonBuilder().setLabel(t("Entrar na sala")).setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${interaction.guildId}/${channel.id}`))],
            })],
            flags: CV2_FLAG,
        }).catch(() => null);

        await interaction.editReply({
            components: [buildContainer({ color: getEmbedColor(config), title: `${emoji.success} ${t("Sala criada")}`, description: `${channel} ${t("está pronta.")}` })],
        });
    },
});
