import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, ChannelType, MessageFlags, version as djsVersion } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { buildContainer, errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { e } from "../../../lib/emojis.js";
import { formatNumber, t } from "../../../lib/i18n.js";
import { humanizeDuration, timestamp } from "../../../lib/time.js";
import { giveReputation } from "../../../repositories/reputationRepository.js";
import { buildProfile } from "../../../modules/community/profile.js";
import { buildHelp } from "../../../modules/community/help.js";

const REP_COOLDOWN_MS = 12 * 3_600_000;

createCommand({
    name: "perfil",
    description: t("O teu perfil (ou o de outro membro): nível, moedas, reputação, voz e jogos."),
    type: ApplicationCommandType.ChatInput,
    options: [{ name: "membro", description: t("Membro a consultar"), type: ApplicationCommandOptionType.User, required: false }],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const member = interaction.options.getMember("membro") ?? interaction.member;
        if (member.user.bot) return void interaction.reply({ components: [errorContainer(t("Os bots não têm perfil."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        await interaction.reply({ components: [await buildProfile(member)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

createCommand({
    name: "rep",
    description: t("Dá um ponto de reputação a alguém (um a cada 12 horas)."),
    type: ApplicationCommandType.ChatInput,
    options: [{ name: "membro", description: t("Quem merece"), type: ApplicationCommandOptionType.User, required: true }],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const target = interaction.options.getMember("membro");
        const fail = (text: string) => interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        if (!target) return void fail(t("Esse membro não está no servidor."));
        if (target.user.bot) return void fail(t("Os bots não precisam de reputação. 🤖"));
        if (target.id === interaction.user.id) return void fail(t("Não podes dar reputação a ti mesmo."));
        const result = await giveReputation(interaction.guildId, interaction.user.id, target.id, REP_COOLDOWN_MS);
        if (!result.ok) return void fail(t("Já deste reputação há pouco. Podes voltar a dar {at}.", { at: timestamp(result.nextAt, "R") }));
        await interaction.reply({
            components: [successContainer(t("{from} deu um ponto de reputação a {to}! {to} tem agora **{points}**.", { from: `<@${interaction.user.id}>`, to: `<@${target.id}>`, points: result.points }))],
            flags: CV2_FLAG,
            allowedMentions: { users: [target.id] },
        });
    },
});

createCommand({
    name: "info",
    description: t("Informações sobre o servidor, um membro, um avatar ou o bot."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "servidor", description: t("Informações do servidor."), type: ApplicationCommandOptionType.Subcommand },
        { name: "membro", description: t("Informações de um membro."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: false }] },
        { name: "avatar", description: t("Avatar de um membro em grande."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: false }] },
        { name: "bot", description: t("Estado do bot."), type: ApplicationCommandOptionType.Subcommand },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (sub === "servidor") {
            const channels = guild.channels.cache;
            const owner = await guild.fetchOwner().catch(() => null);
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.primary,
                    title: `${e("home")} ${guild.name}`,
                    thumbnailUrl: guild.iconURL({ size: 256 }),
                    fields: [
                        { name: t("Geral"), value: [t("Dono: {owner}", { owner: owner ? `<@${owner.id}>` : "—" }), t("Criado {at}", { at: timestamp(guild.createdTimestamp, "D") }), `ID: \`${guild.id}\``].join("\n") },
                        { name: t("Membros"), value: t("{total} no total · {bots} bots", { total: formatNumber(guild.memberCount), bots: formatNumber(guild.members.cache.filter((member) => member.user.bot).size) }) },
                        { name: t("Canais"), value: t("{text} de texto · {voice} de voz · {cats} categorias", { text: channels.filter((c) => c.type === ChannelType.GuildText).size, voice: channels.filter((c) => c.type === ChannelType.GuildVoice).size, cats: channels.filter((c) => c.type === ChannelType.GuildCategory).size }) },
                        { name: t("Extras"), value: t("{roles} cargos · {emojis} emojis · nível de boost {tier} ({boosts} boosts)", { roles: guild.roles.cache.size - 1, emojis: guild.emojis.cache.size, tier: guild.premiumTier, boosts: guild.premiumSubscriptionCount ?? 0 }) },
                    ],
                })],
                flags: CV2_FLAG,
                allowedMentions: { parse: [] },
            });
        }

        if (sub === "bot") {
            const memory = process.memoryUsage().rss / 1024 / 1024;
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.primary,
                    title: `${e("bot")} EPA BOTCHI`,
                    thumbnailUrl: interaction.client.user.displayAvatarURL({ size: 256 }),
                    fields: [
                        { name: t("Estado"), value: [t("Latência: {ms} ms", { ms: Math.round(interaction.client.ws.ping) }), t("Ligado há {time}", { time: humanizeDuration(process.uptime() * 1000) }), t("Memória: {mb} MB", { mb: memory.toFixed(0) })].join("\n") },
                        { name: t("Tecnologia"), value: `Node.js ${process.versions.node} · discord.js ${djsVersion}` },
                    ],
                })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
        }

        const member = interaction.options.getMember("membro") ?? interaction.member;
        if (sub === "avatar") {
            const url = member.displayAvatarURL({ size: 1024 });
            return void interaction.reply({
                components: [buildContainer({ color: member.displayColor || COLORS.primary, title: t("Avatar de {name}", { name: member.displayName }), description: `[${t("Abrir em tamanho original")}](${url})`, thumbnailUrl: url })],
                flags: CV2_FLAG,
                allowedMentions: { parse: [] },
            });
        }
        // membro
        const roles = member.roles.cache.filter((role) => role.id !== guild.id).sort((a, b) => b.position - a.position).map((role) => `<@&${role.id}>`);
        await interaction.reply({
            components: [buildContainer({
                color: member.displayColor || COLORS.primary,
                title: `${e("user")} ${member.user.tag}`,
                thumbnailUrl: member.displayAvatarURL({ size: 256 }),
                fields: [
                    { name: t("Conta"), value: [`ID: \`${member.id}\``, t("Criada {at}", { at: timestamp(member.user.createdTimestamp, "R") }), t("Entrou no servidor {at}", { at: timestamp(member.joinedTimestamp, "R") }), member.premiumSince ? t("A dar boost desde {at}", { at: timestamp(member.premiumSinceTimestamp, "D") }) : null].filter(Boolean).join("\n") },
                    { name: t("Cargos ({count})", { count: roles.length }), value: roles.slice(0, 20).join(" ") || t("*Nenhum*") },
                ],
            })],
            flags: CV2_FLAG,
            allowedMentions: { parse: [] },
        });
    },
});

createCommand({
    name: "ajuda",
    description: t("Todos os comandos do EPA BOTCHI."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        await interaction.reply({ components: [buildHelp("geral")], flags: CV2_FLAG | MessageFlags.Ephemeral });
    },
});
