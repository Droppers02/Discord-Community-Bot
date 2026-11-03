import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, type GuildMember } from "discord.js";
import { buildContainer, errorContainer, noticeContainer, row, successContainer } from "../../lib/containers.js";
import { COLORS } from "../../lib/branding.js";
import { CV2_FLAG, hasSuperAdminAccess, replyContainer } from "../../lib/discord.js";
import { registerEphemeralPanel } from "../../lib/ephemeralLifecycle.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId, parseCustomId } from "../../lib/ids.js";
import { getGiveawayById, hasEntry, removeEntry, upsertEntry } from "../../repositories/giveawayRepository.js";
import { checkEligibility, refreshGiveawayMessage, rerollGiveaway } from "../../modules/giveaways/giveawayManager.js";
import { getGiveawaySettings } from "../../modules/giveaways/giveawaySettings.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getFirstTicketCategoryId } from "../../modules/tickets/categories.js";
import { createTicket } from "../../modules/tickets/ticketManager.js";
import { ValidationError } from "../../errors/index.js";
import { t } from "../../lib/i18n.js";

async function canManageGiveaways(guildId: string, member: GuildMember): Promise<boolean> {
    const config = await ensureGuildConfig(guildId);
    if (hasSuperAdminAccess(member, config.admin_role)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    const settings = await getGiveawaySettings(guildId);
    return settings.host_role ? member.roles.cache.has(settings.host_role) : false;
}

createResponder({
    customId: "giveaway/**",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const { action, systemId: giveawayId } = parseCustomId(interaction.customId);

        const giveaway = await getGiveawayById(giveawayId);
        if (!giveaway) {
            await replyContainer(interaction, errorContainer(t("Este sorteio já não existe.")));
            return;
        }

        // ── Claim prize (winners only; works after the giveaway has ended) ──
        if (action === "claim") {
            if (giveaway.status === "running") {
                await replyContainer(interaction, noticeContainer({ description: t("Este sorteio ainda está a decorrer.") }));
                return;
            }
            if (!giveaway.winner_ids.includes(interaction.user.id)) {
                await replyContainer(interaction, errorContainer(t("Apenas os vencedores deste sorteio podem reclamar o prémio.")));
                return;
            }
            const config = await ensureGuildConfig(interaction.guildId);
            const category = getFirstTicketCategoryId(config) ?? "suporte";
            try {
                const channel = await createTicket(
                    interaction.guild,
                    interaction.user,
                    category,
                    `${emoji.gift} ${t("Reclamação de prémio — Sorteio: {prize} (ID {id})", { prize: giveaway.prize, id: giveaway.id.slice(0, 8) })}`,
                    config,
                );
                await replyContainer(interaction, successContainer(t("Abrimos o teu ticket de prémio em {channel}. A equipa vai entregar **{prize}**.", { channel: String(channel), prize: giveaway.prize })));
            } catch (error) {
                await replyContainer(interaction, errorContainer(error instanceof ValidationError ? error.message : t("Não foi possível abrir o ticket de prémio.")));
            }
            return;
        }

        // ── Reroll (staff/host only; works on ended giveaways) ──
        if (action === "reroll") {
            if (!(await canManageGiveaways(interaction.guildId, interaction.member))) {
                await replyContainer(interaction, errorContainer(t("Não tens permissão para re-sortear sorteios.")));
                return;
            }
            const rerolled = await rerollGiveaway(interaction.client, giveawayId);
            await replyContainer(interaction, rerolled ? successContainer(t("Novos vencedores sorteados!")) : errorContainer(t("Só sorteios já terminados podem ser re-sorteados.")));
            return;
        }

        if (giveaway.status !== "running") {
            await replyContainer(interaction, noticeContainer({ title: `${emoji.gift} ${t("Sorteio terminado")}`, description: t("Este sorteio já não está a aceitar participações.") }));
            return;
        }

        // Leaving is offered from the ephemeral "já estás a participar" panel.
        if (action === "leave") {
            await removeEntry(giveawayId, interaction.user.id);
            await refreshGiveawayMessage(interaction.client, giveaway);
            await interaction.update({ components: [buildContainer({ color: COLORS.neutral, title: `${emoji.leave} ${t("Saíste do sorteio")}`, description: t("Já não estás a participar neste sorteio.") })] as never });
            return;
        }

        if (action === "join") {
            const joinConfig = await ensureGuildConfig(interaction.guildId);

            // Already participating → show an ephemeral with a "Sair do sorteio" button.
            if (await hasEntry(giveawayId, interaction.user.id)) {
                await interaction.reply({
                    components: [buildContainer({
                        color: COLORS.gold,
                        title: `${emoji.gift} ${t("Já estás a participar")}`,
                        description: t("Já estás a participar deste sorteio. Boa sorte! Se quiseres, podes sair abaixo."),
                        rows: [row(new ButtonBuilder().setCustomId(buildCustomId("giveaway", "leave", giveawayId)).setLabel(t("Sair do sorteio")).setEmoji(emoji.leave).setStyle(ButtonStyle.Danger))],
                    })] as never,
                    flags: CV2_FLAG | MessageFlags.Ephemeral,
                });
                await registerEphemeralPanel(interaction);
                return;
            }

            const eligibility = checkEligibility(giveaway, interaction.member, { clientRoleId: joinConfig.client_role });
            if (!eligibility.ok) {
                const messages: Record<string, string> = {
                    ended: t("Este sorteio já terminou."),
                    missing_role: giveaway.required_role ? t("Precisas do cargo {role} para participar.", { role: `<@&${giveaway.required_role}>` }) : t("Não cumpres os requisitos."),
                    account_age: t("A tua conta precisa de ter mais de {days, plural, one {**#** dia} other {**#** dias}}.", { days: giveaway.min_account_age_days }),
                    server_age: t("Precisas de estar no servidor há mais de {days, plural, one {**#** dia} other {**#** dias}}.", { days: giveaway.min_server_age_days }),
                    not_client: joinConfig.client_role
                        ? t("Este sorteio é exclusivo para clientes (cargo {role}).", { role: `<@&${joinConfig.client_role}>` })
                        : t("Este sorteio é exclusivo para clientes, mas ainda não há um cargo de cliente configurado."),
                };
                await replyContainer(interaction, errorContainer(messages[eligibility.reason]));
                return;
            }

            await upsertEntry(giveawayId, interaction.user.id, eligibility.entries);
            await refreshGiveawayMessage(interaction.client, giveaway);
            const bonusNote = eligibility.entries > 1 ? ` ${t("Tens **{count}** entradas (boost de cargo).", { count: eligibility.entries })}` : "";
            await replyContainer(interaction, successContainer(`${emoji.success} ${t("Participação efetuada, boa sorte!")}${bonusNote}`));
            return;
        }
    },
});
