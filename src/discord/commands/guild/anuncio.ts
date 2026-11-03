import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, ChannelType, GuildMember, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { randomUUID } from "node:crypto";
import { COLORS } from "../../../lib/branding.js";
import { buildContainer, errorContainer, row, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasStaffAccess } from "../../../lib/discord.js";
import { e } from "../../../lib/emojis.js";
import { t } from "../../../lib/i18n.js";
import { timestamp } from "../../../lib/time.js";
import { parseDelay, parseWhen } from "../../../lib/when.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { deleteAnnouncement, listAnnouncements, type AnnounceRepeat } from "../../../repositories/scheduleRepository.js";
import { announcementDrafts } from "../../../modules/utility/announcementDrafts.js";

const REPEAT_LABEL: Record<AnnounceRepeat, string> = { none: "uma vez", daily: "todos os dias", weekly: "todas as semanas" };

createCommand({
    name: "anuncio",
    description: t("Agenda um anúncio para um canal — a uma hora certa ou daqui a X minutos."),
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
    options: [
        {
            name: "agendar",
            description: t("Agenda um anúncio (sem hora nem espera, sai já)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "canal", description: t("Onde publicar"), type: ApplicationCommandOptionType.Channel, required: true, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
                { name: "hora", description: t("Hora fixa: 21:30 · amanhã 9:00 · 25/12 18:00 · 25/12/2026 18:00"), type: ApplicationCommandOptionType.String, required: false, maxLength: 40 },
                { name: "daqui_a", description: t("Ou daqui a: 30 (minutos) · 45m · 2h · 1d12h"), type: ApplicationCommandOptionType.String, required: false, maxLength: 20 },
                { name: "repetir", description: t("Repetir o anúncio"), type: ApplicationCommandOptionType.String, required: false, choices: [{ name: t("Não repetir"), value: "none" }, { name: t("Todos os dias"), value: "daily" }, { name: t("Todas as semanas"), value: "weekly" }] },
                { name: "cargo", description: t("Cargo a mencionar"), type: ApplicationCommandOptionType.Role, required: false },
                { name: "todos", description: t("Mencionar @everyone"), type: ApplicationCommandOptionType.Boolean, required: false },
            ],
        },
        { name: "lista", description: t("Anúncios agendados (com opção de cancelar)."), type: ApplicationCommandOptionType.Subcommand },
        {
            name: "cancelar",
            description: t("Cancela um anúncio agendado."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "anuncio", description: t("Qual"), type: ApplicationCommandOptionType.String, required: true, autocomplete: true }],
        },
    ],
    async autocomplete(interaction) {
        if (!interaction.inCachedGuild()) return;
        const focused = interaction.options.getFocused().toLowerCase();
        const entries = await listAnnouncements(interaction.guildId);
        await interaction.respond(entries
            .filter((entry) => `${entry.title ?? ""} ${entry.content}`.toLowerCase().includes(focused))
            .slice(0, 25)
            .map((entry) => ({ name: `${new Date(entry.send_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" })} · ${(entry.title ?? entry.content).slice(0, 70)}`, value: entry.id })));
    },
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasStaffAccess(interaction.member as GuildMember, config.staff_role, config.admin_role) && !interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
            return void interaction.reply({ components: [errorContainer(t("Só a equipa pode agendar anúncios."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const sub = interaction.options.getSubcommand();
        const fail = (text: string) => interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });

        if (sub === "lista") {
            const entries = await listAnnouncements(interaction.guildId);
            const lines = entries.map((entry) => `${e("clock")} ${timestamp(entry.send_at, "f")} (${timestamp(entry.send_at, "R")}) · <#${entry.channel_id}> · ${t(REPEAT_LABEL[entry.repeat])}\n-# ${(entry.title ?? entry.content).replace(/\n/g, " ").slice(0, 90)}`);
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.info,
                    title: `${e("megaphone")} ${t("Anúncios agendados ({count})", { count: entries.length })}`,
                    description: lines.length ? lines.join("\n") : t("Não há anúncios agendados. Usa `/anuncio agendar`."),
                    rows: entries.length ? [row(new StringSelectMenuBuilder()
                        .setCustomId("ann/cancel")
                        .setPlaceholder(t("Cancelar um anúncio…"))
                        .addOptions(entries.map((entry) => ({ label: (entry.title ?? entry.content).replace(/\n/g, " ").slice(0, 100), value: entry.id, description: new Date(entry.send_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }).slice(0, 100) }))))] : [],
                })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
        }

        if (sub === "cancelar") {
            const removed = await deleteAnnouncement(interaction.guildId, interaction.options.getString("anuncio", true));
            return void interaction.reply({ components: [removed ? successContainer(t("Anúncio cancelado.")) : errorContainer(t("Não encontrei esse anúncio."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }

        // agendar
        const channel = interaction.options.getChannel("canal", true);
        const hora = interaction.options.getString("hora")?.trim();
        const daqui = interaction.options.getString("daqui_a")?.trim();
        if (hora && daqui) return void fail(t("Escolhe **hora** ou **daqui_a**, não as duas."));
        let sendAt = Date.now();
        if (hora) {
            const at = parseWhen(hora);
            if (!at) return void fail(t("Não percebi a hora. Exemplos: `21:30`, `amanhã 9:00`, `25/12 18:00`, `25/12/2026 18:00`."));
            sendAt = at;
        } else if (daqui) {
            const ms = parseDelay(daqui);
            if (!ms) return void fail(t("Não percebi a espera. Exemplos: `30` (minutos), `45m`, `2h`, `1d12h`."));
            sendAt = Date.now() + ms;
        }
        if (sendAt - Date.now() > 366 * 86_400_000) return void fail(t("No máximo um ano de antecedência."));
        const me = interaction.guild.members.me;
        const perms = me ? channel.permissionsFor(me) : null;
        if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return void fail(t("O bot não consegue escrever em {channel}.", { channel: `<#${channel.id}>` }));
        const everyone = interaction.options.getBoolean("todos") ?? false;
        if (everyone && !interaction.memberPermissions.has(PermissionFlagsBits.MentionEveryone)) return void fail(t("Não tens permissão para mencionar @everyone."));

        const draftId = randomUUID().slice(0, 12);
        announcementDrafts.set(draftId, {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            channelId: channel.id,
            sendAt,
            immediate: !hora && !daqui,
            repeat: (interaction.options.getString("repetir") ?? "none") as AnnounceRepeat,
            mentionRole: everyone ? "everyone" : interaction.options.getRole("cargo")?.id ?? null,
        });
        await interaction.showModal(new ModalBuilder()
            .setCustomId(`ann/new/${draftId}`)
            .setTitle(t("Novo anúncio"))
            .addLabelComponents(
                new LabelBuilder().setLabel(t("Título (opcional)")).setTextInputComponent(new TextInputBuilder().setCustomId("title").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
                new LabelBuilder().setLabel(t("Mensagem")).setDescription(t("Markdown do Discord, menções e emojis funcionam.")).setTextInputComponent(new TextInputBuilder().setCustomId("content").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3500)),
                new LabelBuilder().setLabel(t("Imagem (link, opcional)")).setTextInputComponent(new TextInputBuilder().setCustomId("image").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setPlaceholder("https://…")),
            ));
    },
});
