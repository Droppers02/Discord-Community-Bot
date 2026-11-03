import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, GuildMember, MessageFlags } from "discord.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { addToBlacklist, listBlacklist, removeFromBlacklist } from "../../../repositories/ticketBlacklistRepository.js";
import { buildContainer, errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../../lib/discord.js";
import { emoji } from "../../../lib/emojis.js";
import { getEmbedColor, getFooterText } from "../../../lib/branding.js";
import { appendAuditLog } from "../../../services/auditService.js";
import { t } from "../../../lib/i18n.js";

createCommand({
    name: "blacklist",
    description: t("Gerir a lista de utilizadores impedidos de abrir tickets."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "adicionar",
            description: t("Impede um utilizador de abrir tickets."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "utilizador", description: t("Utilizador a bloquear"), type: ApplicationCommandOptionType.User, required: true },
                { name: "motivo", description: t("Motivo (opcional)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 300 },
            ],
        },
        {
            name: "remover",
            description: t("Volta a permitir que um utilizador abra tickets."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "utilizador", description: t("Utilizador a desbloquear"), type: ApplicationCommandOptionType.User, required: true },
            ],
        },
        {
            name: "lista",
            description: t("Mostra os utilizadores bloqueados."),
            type: ApplicationCommandOptionType.Subcommand,
        },
    ],
    async run(interaction) {
        if (!interaction.inGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role)) {
            await interaction.reply({ components: [errorContainer(t("Apenas super-admin ou `Administrator` pode gerir a blacklist."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "adicionar") {
            const user = interaction.options.getUser("utilizador", true);
            const reason = interaction.options.getString("motivo") ?? null;
            await addToBlacklist(interaction.guildId, user.id, reason, interaction.user.id);
            appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "ticket.blacklist.add", details: { userId: user.id, reason } });
            await interaction.reply({ components: [successContainer(`${t("{user} foi bloqueado de abrir tickets.", { user: String(user) })}${reason ? `\n${t("Motivo: {reason}", { reason })}` : ""}`)], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        if (subcommand === "remover") {
            const user = interaction.options.getUser("utilizador", true);
            const removed = await removeFromBlacklist(interaction.guildId, user.id);
            if (removed) appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "ticket.blacklist.remove", details: { userId: user.id } });
            await interaction.reply({
                components: [removed ? successContainer(`${user} ${t("já pode voltar a abrir tickets.")}`) : errorContainer(`${user} ${t("não estava na blacklist.")}`)],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
            return;
        }

        const entries = await listBlacklist(interaction.guildId);
        const lines = entries.length
            ? entries.slice(0, 40).map((entry) => `• <@${entry.user_id}>${entry.reason ? ` — ${entry.reason}` : ""}`).join("\n")
            : t("*A blacklist está vazia.*");
        await interaction.reply({
            components: [buildContainer({
                color: getEmbedColor(config),
                title: `${emoji.shield} ${t("Blacklist de tickets")}`,
                description: t("Utilizadores impedidos de abrir tickets ({count}).", { count: entries.length }),
                fields: [{ name: t("Bloqueados"), value: lines.slice(0, 4000) }],
                footerText: getFooterText(config),
            })],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});
