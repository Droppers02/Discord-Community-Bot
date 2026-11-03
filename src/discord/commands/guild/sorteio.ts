import { createCommand } from "#base";
import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    GuildMember,
    MessageFlags,
    PermissionFlagsBits,
} from "discord.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess, replyContainer } from "../../../lib/discord.js";
import { emoji } from "../../../lib/emojis.js";
import { buildContainer } from "../../../lib/containers.js";
import { COLORS } from "../../../lib/branding.js";
import { registerEphemeralPanel } from "../../../lib/ephemeralLifecycle.js";
import { getGiveawaySettings } from "../../../modules/giveaways/giveawaySettings.js";
import { buildGiveawayJumpRow, cancelGiveaway, endGiveaway } from "../../../modules/giveaways/giveawayManager.js";
import { buildGiveawayDraftPanel, resetGiveawayDraft } from "../../../modules/giveaways/giveawayCreator.js";
import { getGiveawayById, getGiveawaysByGuild } from "../../../repositories/giveawayRepository.js";
import { t } from "../../../lib/i18n.js";

async function canManageGiveaways(interaction: { guildId: string; member: GuildMember }): Promise<boolean> {
    const config = await ensureGuildConfig(interaction.guildId);
    if (hasSuperAdminAccess(interaction.member, config.admin_role)) return true;
    if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    const settings = await getGiveawaySettings(interaction.guildId);
    return settings.host_role ? interaction.member.roles.cache.has(settings.host_role) : false;
}

createCommand({
    name: "sorteio",
    description: t("Gerir sorteios do servidor."),
    type: ApplicationCommandType.ChatInput,
    // ManageGuild alinha com o guard runtime; hosts sem essa permissão podem ser
    // autorizados por cargo em Definições do Servidor → Integrações.
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    dmPermission: false,
    options: [
        {
            name: "criar",
            description: t("Abrir o painel para criar um novo sorteio."),
            type: ApplicationCommandOptionType.Subcommand,
        },
        {
            name: "terminar",
            description: t("Terminar já um sorteio e sortear os vencedores."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "id_sorteio", description: t("Sorteio a terminar"), type: ApplicationCommandOptionType.String, required: true, autocomplete: true }],
        },
        {
            name: "cancelar",
            description: t("Cancelar um sorteio a decorrer (sem vencedores)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "id_sorteio", description: t("Sorteio a cancelar"), type: ApplicationCommandOptionType.String, required: true, autocomplete: true }],
        },
        {
            name: "listar",
            description: t("Listar os sorteios a decorrer."),
            type: ApplicationCommandOptionType.Subcommand,
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const member = interaction.member;
        if (!(await canManageGiveaways({ guildId: interaction.guildId, member }))) {
            await replyContainer(interaction, errorContainer(t("Não tens permissão para gerir sorteios.")));
            return;
        }

        const sub = interaction.options.getSubcommand();

        if (sub === "criar") {
            // Prefill the channel from the configured default, then open the CV2 builder panel.
            const settings = await getGiveawaySettings(interaction.guildId);
            const draft = resetGiveawayDraft(interaction.guildId, interaction.user.id);
            if (settings.default_channel) draft.channelId = settings.default_channel;
            await interaction.reply({ components: [buildGiveawayDraftPanel(draft, interaction.guild)], flags: CV2_FLAG | MessageFlags.Ephemeral });
            await registerEphemeralPanel(interaction);
            return;
        }

        if (sub === "listar") {
            const running = await getGiveawaysByGuild(interaction.guildId, "running");
            if (running.length === 0) {
                await replyContainer(interaction, errorContainer(t("Não há sorteios a decorrer.")));
                return;
            }
            const jumpRow = buildGiveawayJumpRow(interaction.guildId, running);
            await replyContainer(interaction, buildContainer({
                color: COLORS.gold,
                title: `${emoji.gift} ${t("Sorteios a decorrer")}`,
                fields: running.map((giveaway) => ({
                    name: `${giveaway.prize} • \`${giveaway.id.slice(0, 8)}\``,
                    value: `${t("Termina {when}", { when: `<t:${Math.floor(giveaway.ends_at / 1000)}:R>` })} • ${t("{count, plural, one {# vencedor} other {# vencedores}}", { count: giveaway.winners_count })} • <#${giveaway.channel_id}>`,
                })),
                rows: jumpRow ? [jumpRow] : undefined,
            }), { persist: Boolean(jumpRow) });
            if (jumpRow) await registerEphemeralPanel(interaction);
            return;
        }

        // terminar / cancelar
        const id = interaction.options.getString("id_sorteio", true);
        const giveaway = await getGiveawayById(id);
        if (!giveaway || giveaway.guild_id !== interaction.guildId) {
            await replyContainer(interaction, errorContainer(t("Sorteio não encontrado.")));
            return;
        }

        if (sub === "terminar") {
            const ended = await endGiveaway(interaction.client, id);
            await replyContainer(interaction, ended ? successContainer(t("Sorteio terminado e vencedores sorteados.")) : errorContainer(t("Este sorteio já não está a decorrer.")));
            return;
        }
        if (sub === "cancelar") {
            const cancelled = await cancelGiveaway(interaction.client, id);
            await replyContainer(interaction, cancelled ? successContainer(t("Sorteio cancelado.")) : errorContainer(t("Este sorteio já não está a decorrer.")));
            return;
        }
    },
    async autocomplete(interaction) {
        if (!interaction.inCachedGuild()) return [];
        const giveaways = await getGiveawaysByGuild(interaction.guildId, "running");
        const focused = String(interaction.options.getFocused() ?? "").toLowerCase();
        return giveaways
            .filter((giveaway) => giveaway.prize.toLowerCase().includes(focused) || giveaway.id.includes(focused))
            .slice(0, 25)
            .map((giveaway) => ({ name: `${giveaway.prize} • ${giveaway.id.slice(0, 8)}`.slice(0, 100), value: giveaway.id }));
    },
});
