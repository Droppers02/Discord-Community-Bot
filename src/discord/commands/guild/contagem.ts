import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../../lib/discord.js";
import { formatNumber, t } from "../../../lib/i18n.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { buyCountingSave, countingRankingView, countingStatusView, setCountingNumber } from "../../../modules/counting/countingService.js";

createCommand({
    name: "contagem",
    description: t("Canal de contagem: estado, ranking e vidas."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "estado", description: t("Número atual, recorde, vidas e quem mais conta."), type: ApplicationCommandOptionType.Subcommand },
        { name: "ranking", description: t("Quem mais contou (e quem mais estragou)."), type: ApplicationCommandOptionType.Subcommand },
        { name: "vida", description: t("Compra uma vida para a contagem (salva o próximo erro)."), type: ApplicationCommandOptionType.Subcommand },
        {
            name: "definir",
            description: t("(Administração) Muda o número atual."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "numero", description: t("O último número contado (o próximo será este + 1)"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 0, maxValue: 1_000_000_000 }],
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        if (sub === "estado") return void interaction.reply({ components: [await countingStatusView(interaction.guild)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        if (sub === "ranking") return void interaction.reply({ components: [await countingRankingView(interaction.guild)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (sub === "vida") {
            const result = await buyCountingSave(interaction.member);
            return void interaction.editReply({ components: [result.ok ? successContainer(t("💾 Vida comprada! A contagem tem agora **{n}**.", { n: result.saves })) : errorContainer(result.reason)], flags: CV2_FLAG });
        }
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasSuperAdminAccess(interaction.member, config.admin_role) && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            return void interaction.editReply({ components: [errorContainer(t("Só a administração muda o número."))], flags: CV2_FLAG });
        }
        const value = interaction.options.getInteger("numero", true);
        await setCountingNumber(interaction.guildId, value);
        await interaction.editReply({ components: [successContainer(t("Contagem posta no **{n}** — o próximo é **{next}**.", { n: formatNumber(value), next: formatNumber(value + 1) }))], flags: CV2_FLAG });
    },
});
