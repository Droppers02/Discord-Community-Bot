import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags } from "discord.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { countInvitesBy, getInviteLeaderboard } from "../../../repositories/inviteRepository.js";
import { getEmbedColor, getFooterText } from "../../../lib/branding.js";
import { buildContainer, errorContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { registerEphemeralPanel } from "../../../lib/ephemeralLifecycle.js";
import { e, emoji } from "../../../lib/emojis.js";
import { t } from "../../../lib/i18n.js";

// Pódio com emojis do bot (resolvidos em runtime para apanharem os emojis da app):
// 1º coroa, 2º troféu, 3º estrela — ordem de prestígio coerente com o resto da UI.
const MEDAL_ICONS = ["crown", "trophy", "star"] as const;
function medal(index: number): string {
    const icon = MEDAL_ICONS[index];
    return icon ? e(icon) : `**${index + 1}.**`;
}

createCommand({
    name: "convites",
    description: t("Convites do servidor — leaderboard e contagem por utilizador."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "leaderboard", description: t("Ver o ranking de quem mais convidou."), type: ApplicationCommandOptionType.Subcommand },
        {
            name: "ver",
            description: t("Ver os convites de um utilizador (ou os teus)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "utilizador", description: t("Utilizador a consultar"), type: ApplicationCommandOptionType.User, required: false }],
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        const color = getEmbedColor(config);
        const footerText = getFooterText(config);
        const sub = interaction.options.getSubcommand();

        if (sub === "ver") {
            const target = interaction.options.getUser("utilizador") ?? interaction.user;
            const count = await countInvitesBy(interaction.guildId, target.id);
            await interaction.reply({
                components: [buildContainer({
                    color,
                    title: `${emoji.link} ${t("Convites")}`,
                    description: t("{user} tem {count, plural, one {**#** convite ativo} other {**#** convites ativos}}.", { user: String(target), count }),
                    footerText,
                })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
            await registerEphemeralPanel(interaction);
            return;
        }

        const ranking = await getInviteLeaderboard(interaction.guildId, 15);
        if (ranking.length === 0) {
            await interaction.reply({ components: [errorContainer(t("Ainda não há convites registados."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            await registerEphemeralPanel(interaction);
            return;
        }

        const lines = ranking.map((entry, index) =>
            `${medal(index)} <@${entry.inviter_id}> — ${t("{count, plural, one {**#** convite} other {**#** convites}}", { count: entry.count })}`,
        );

        await interaction.reply({
            components: [buildContainer({
                color,
                title: `${emoji.trophy} ${t("Top convites")}`,
                description: t("Quem mais membros trouxe (que continuam no servidor)."),
                fields: [{ name: t("Ranking"), value: lines.join("\n").slice(0, 2048) }],
                footerText,
            })],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
        await registerEphemeralPanel(interaction);
    },
});
