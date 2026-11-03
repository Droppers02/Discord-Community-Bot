import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, GuildMember, MessageFlags } from "discord.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { buildContainer, errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasStaffAccess } from "../../../lib/discord.js";
import { emoji } from "../../../lib/emojis.js";
import { getEmbedColor, getFooterText } from "../../../lib/branding.js";
import { humanizeDuration } from "../../../lib/time.js";
import { parseDuration } from "../../../modules/giveaways/giveawayCreator.js";
import { applyTempRole, listTempRolesByGuild, listTempRolesByMember, removeTempRoleEarly } from "../../../modules/roles/tempRoleManager.js";
import { appendAuditLog } from "../../../services/auditService.js";
import { t } from "../../../lib/i18n.js";

// Cargos temporários: warns com prazo, VIP por tempo, castigos — o cargo cai sozinho.
// A parte dos cargos que voltam ao regressar configura-se no /config → Cargos.

createCommand({
    name: "cargotemp",
    description: t("Atribui cargos temporários (warns com prazo, VIP por tempo, castigos)."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "dar",
            description: t("Dá um cargo temporário a um membro."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "utilizador", description: t("Membro que recebe o cargo"), type: ApplicationCommandOptionType.User, required: true },
                { name: "cargo", description: t("Cargo a atribuir"), type: ApplicationCommandOptionType.Role, required: true },
                { name: "duracao", description: t("Duração (ex.: 30m, 12h, 7d, 1d12h)"), type: ApplicationCommandOptionType.String, required: true, maxLength: 20 },
                { name: "motivo", description: t("Motivo (opcional — ex.: warn por spam)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 300 },
            ],
        },
        {
            name: "remover",
            description: t("Remove um cargo temporário antes do prazo."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "utilizador", description: t("Membro"), type: ApplicationCommandOptionType.User, required: true },
                { name: "cargo", description: t("Cargo temporário a remover"), type: ApplicationCommandOptionType.Role, required: true },
            ],
        },
        {
            name: "lista",
            description: t("Cargos temporários ativos neste servidor."),
            type: ApplicationCommandOptionType.Subcommand,
        },
    ],
    async run(interaction) {
        if (!interaction.inGuild() || !interaction.guild) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasStaffAccess(interaction.member as GuildMember, config.staff_role, config.admin_role)) {
            await interaction.reply({ components: [errorContainer(t("Apenas a staff pode gerir cargos temporários."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dar") {
            const user = interaction.options.getUser("utilizador", true);
            const role = interaction.options.getRole("cargo", true);
            const durationRaw = interaction.options.getString("duracao", true);
            const reason = interaction.options.getString("motivo") ?? null;

            const durationMs = parseDuration(durationRaw);
            if (!durationMs || durationMs < 60_000) {
                await interaction.reply({ components: [errorContainer(t("Duração inválida. Usa por exemplo `30m`, `12h`, `7d` ou `1d12h` (mínimo 1 minuto)."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
                return;
            }

            const me = interaction.guild.members.me;
            if (me && me.roles.highest.comparePositionTo(role.id) <= 0) {
                await interaction.reply({ components: [errorContainer(t("Não consigo gerir {role} — o cargo está acima do meu na hierarquia.", { role: String(role) }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({
                components: [buildContainer({ color: getEmbedColor(config), title: `${emoji.pending} ${t("A atribuir cargo temporário…")}` })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
            try {
                const record = await applyTempRole(interaction.guild, {
                    guildId: interaction.guildId,
                    userId: user.id,
                    roleId: role.id,
                    grantedBy: interaction.user.id,
                    reason,
                    durationMs,
                });
                appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "roles.temp.add", details: { userId: user.id, roleId: role.id, durationMs, reason } });
                await interaction.editReply({
                    components: [successContainer(`${t("{user} recebeu {role} durante **{duration}** — expira {when}.", { user: String(user), role: String(role), duration: humanizeDuration(durationMs), when: `<t:${Math.floor(record.expires_at / 1000)}:R>` })}${reason ? `\n${t("Motivo: {reason}", { reason })}` : ""}`)],
                });
            } catch {
                await interaction.editReply({
                    components: [errorContainer(t("Não consegui atribuir o cargo — confirma que o membro está no servidor e que tenho permissão Gerir Cargos."))],
                });
            }
            return;
        }

        if (subcommand === "remover") {
            const user = interaction.options.getUser("utilizador", true);
            const role = interaction.options.getRole("cargo", true);
            const records = await listTempRolesByMember(interaction.guildId, user.id);
            const record = records.find((entry) => entry.role_id === role.id);
            if (!record) {
                await interaction.reply({ components: [errorContainer(t("{user} não tem {role} como cargo temporário.", { user: String(user), role: String(role) }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
                return;
            }
            await removeTempRoleEarly(interaction.guild, record);
            appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "roles.temp.remove", details: { userId: user.id, roleId: role.id } });
            await interaction.reply({ components: [successContainer(t("{role} removido de {user} antes do prazo.", { role: String(role), user: String(user) }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        const records = await listTempRolesByGuild(interaction.guildId);
        const lines = records.length
            ? records.slice(0, 30).map((entry) => `• <@${entry.user_id}> — <@&${entry.role_id}> ${t("expira {when}", { when: `<t:${Math.floor(entry.expires_at / 1000)}:R>` })}${entry.reason ? ` · ${entry.reason}` : ""}`).join("\n")
            : t("*Não há cargos temporários ativos.*");
        await interaction.reply({
            components: [buildContainer({
                color: getEmbedColor(config),
                title: `${emoji.timeout} ${t("Cargos temporários ativos")}`,
                description: `${records.length} ${t("atribuição(ões) com prazo neste servidor.")}`,
                fields: [{ name: t("Ativos"), value: lines.slice(0, 4000) }],
                footerText: getFooterText(config),
            })],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});
