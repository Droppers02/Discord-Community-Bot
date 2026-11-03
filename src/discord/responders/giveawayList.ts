import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder, type GuildMember, type RepliableInteraction } from "discord.js";
import { errorContainer, noticeContainer, row } from "../../lib/containers.js";
import { hasSuperAdminAccess, replyContainer } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId, parseCustomId } from "../../lib/ids.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getGiveawaysByGuild } from "../../repositories/giveawayRepository.js";
import { getGiveawaySettings } from "../../modules/giveaways/giveawaySettings.js";
import { intlLocale, t } from "../../lib/i18n.js";

async function canManage(guildId: string, member: GuildMember): Promise<boolean> {
    const config = await ensureGuildConfig(guildId);
    if (hasSuperAdminAccess(member, config.admin_role)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    const settings = await getGiveawaySettings(guildId);
    return settings.host_role ? member.roles.cache.has(settings.host_role) : false;
}

async function gate(interaction: RepliableInteraction): Promise<boolean> {
    if (!interaction.inCachedGuild()) return false;
    if (await canManage(interaction.guildId, interaction.member as GuildMember)) return true;
    await replyContainer(interaction, errorContainer(t("Não tens permissão para gerir sorteios.")));
    return false;
}

// "/giveaway listar" com vários giveaways a decorrer: botão abre um seletor; escolher
// um devolve o link direto para a mensagem desse giveaway.
createResponder({
    customId: "gwlist/**",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gate(interaction))) return;
        const { action } = parseCustomId(interaction.customId);
        if (action !== "pick") { await interaction.deferUpdate(); return; }

        const running = await getGiveawaysByGuild(interaction.guildId, "running");
        if (running.length === 0) {
            await interaction.update({ components: [errorContainer(t("Já não há sorteios a decorrer."))] });
            return;
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId(buildCustomId("gwlist", "goto"))
            .setPlaceholder(t("Escolhe um sorteio…"))
            .addOptions(running.slice(0, 25).map((giveaway) => ({
                label: giveaway.prize.slice(0, 100),
                value: giveaway.id,
                description: `${t("Termina em {date}", { date: new Date(giveaway.ends_at).toLocaleDateString(intlLocale()) })} • \`${giveaway.id.slice(0, 8)}\``,
            })));

        await interaction.update({
            components: [
                noticeContainer({ title: `${emoji.gift} ${t("Escolhe um sorteio")}`, description: t("Seleciona abaixo para receberes o link direto para a mensagem.") }),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select) as never,
            ],
        });
    },
});

createResponder({
    customId: "gwlist/**",
    types: [ResponderType.StringSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gate(interaction))) return;
        const { action } = parseCustomId(interaction.customId);
        if (action !== "goto") { await interaction.deferUpdate(); return; }

        const giveawayId = interaction.values[0];
        const running = await getGiveawaysByGuild(interaction.guildId, "running");
        const target = running.find((giveaway) => giveaway.id === giveawayId);
        if (!target?.message_id) {
            await interaction.update({ components: [errorContainer(t("Esse sorteio já não está disponível."))] });
            return;
        }

        const url = `https://discord.com/channels/${interaction.guildId}/${target.channel_id}/${target.message_id}`;
        await interaction.update({
            components: [
                noticeContainer({ title: `${emoji.gift} ${target.prize}`, description: t("Carrega no botão para ires à mensagem do sorteio.") }),
                row(new ButtonBuilder().setLabel(t("Ir à mensagem")).setEmoji(emoji.link).setStyle(ButtonStyle.Link).setURL(url)) as never,
            ],
        });
    },
});
