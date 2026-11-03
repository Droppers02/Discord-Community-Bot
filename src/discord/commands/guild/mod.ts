import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { buildContainer, errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { e } from "../../../lib/emojis.js";
import { t } from "../../../lib/i18n.js";
import { humanizeDuration } from "../../../lib/time.js";
import { casesOf, clearWarns, getCase, setCaseActive } from "../../../repositories/modCaseRepository.js";
import { parseDuration } from "../../../modules/giveaways/giveawayCreator.js";
import { banUser, caseLine, hasModAccess, hierarchyProblem, kickMember, MAX_TIMEOUT_MS, modLog, purgeMessages, removeTimeout, timeoutMember, unbanUser, warnMember, type ModResult } from "../../../modules/moderation/moderationService.js";

const userOpt = (description: string) => ({ name: "membro", description, type: ApplicationCommandOptionType.User as const, required: true });
const reasonOpt = { name: "motivo", description: t("Motivo (fica no registo e na mensagem ao membro)"), type: ApplicationCommandOptionType.String as const, required: false, maxLength: 400 };

const NEEDS: Record<string, bigint> = {
    avisar: PermissionFlagsBits.ModerateMembers,
    avisos: PermissionFlagsBits.ModerateMembers,
    "remover-aviso": PermissionFlagsBits.ModerateMembers,
    "limpar-avisos": PermissionFlagsBits.ModerateMembers,
    castigo: PermissionFlagsBits.ModerateMembers,
    "tirar-castigo": PermissionFlagsBits.ModerateMembers,
    expulsar: PermissionFlagsBits.KickMembers,
    banir: PermissionFlagsBits.BanMembers,
    desbanir: PermissionFlagsBits.BanMembers,
    limpar: PermissionFlagsBits.ManageMessages,
};

function fail(interaction: ChatInputCommandInteraction, text: string) {
    return interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });
}

function done(interaction: ChatInputCommandInteraction, title: string, result: ModResult, extra: string[] = []) {
    const lines = [
        `${e("success")} ${title}`,
        `-# ${t("Caso #{n}", { n: result.entry.case_number })}${result.dmSent ? ` · ${t("o membro foi avisado por mensagem privada")}` : ""}`,
        ...extra,
        result.escalation ? `${e("warn")} ${result.escalation}` : null,
    ].filter(Boolean);
    return interaction.reply({ components: [buildContainer({ color: COLORS.success, description: lines.join("\n") })], flags: CV2_FLAG | MessageFlags.Ephemeral });
}

createCommand({
    name: "mod",
    description: t("Moderação: avisos, castigos, expulsões, banimentos e limpeza."),
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    options: [
        { name: "avisar", description: t("Dá um aviso a um membro."), type: ApplicationCommandOptionType.Subcommand, options: [userOpt(t("Quem avisar")), reasonOpt] },
        { name: "avisos", description: t("Histórico de moderação de um membro."), type: ApplicationCommandOptionType.Subcommand, options: [userOpt(t("Membro a consultar"))] },
        {
            name: "remover-aviso",
            description: t("Anula um aviso pelo número do caso."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "caso", description: t("Número do caso (ex.: 12)"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1 }],
        },
        { name: "limpar-avisos", description: t("Anula todos os avisos ativos de um membro."), type: ApplicationCommandOptionType.Subcommand, options: [userOpt(t("Membro"))] },
        {
            name: "castigo",
            description: t("Põe um membro de castigo (timeout)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                userOpt(t("Quem castigar")),
                { name: "duracao", description: t("Ex.: 10m, 1h, 2d (máx. 28 dias)"), type: ApplicationCommandOptionType.String, required: true, maxLength: 20 },
                reasonOpt,
            ],
        },
        { name: "tirar-castigo", description: t("Tira o castigo (timeout) a um membro."), type: ApplicationCommandOptionType.Subcommand, options: [userOpt(t("Membro")), reasonOpt] },
        { name: "expulsar", description: t("Expulsa um membro do servidor."), type: ApplicationCommandOptionType.Subcommand, options: [userOpt(t("Quem expulsar")), reasonOpt] },
        {
            name: "banir",
            description: t("Bane um membro (ou um ID) do servidor."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                userOpt(t("Quem banir")),
                reasonOpt,
                { name: "apagar_dias", description: t("Apagar as mensagens dos últimos X dias (0 a 7)"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 0, maxValue: 7 },
            ],
        },
        {
            name: "desbanir",
            description: t("Retira o banimento (pelo ID do utilizador)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "id", description: t("ID do utilizador"), type: ApplicationCommandOptionType.String, required: true, maxLength: 25 }, reasonOpt],
        },
        {
            name: "limpar",
            description: t("Apaga mensagens recentes deste canal."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "quantidade", description: t("Quantas (1 a 100)"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 100 },
                { name: "membro", description: t("Só as mensagens deste membro"), type: ApplicationCommandOptionType.User, required: false },
            ],
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        const moderator = interaction.member;
        if (!(await hasModAccess(moderator, NEEDS[sub] ?? PermissionFlagsBits.ModerateMembers))) {
            return void fail(interaction, t("Não tens permissão para isto."));
        }
        const reason = interaction.options.getString("motivo")?.trim() || null;
        const guild = interaction.guild;

        switch (sub) {
            case "avisos": {
                const user = interaction.options.getUser("membro", true);
                const cases = await casesOf(guild.id, user.id, 20);
                return void interaction.reply({
                    components: [buildContainer({
                        color: COLORS.info,
                        title: `${e("hammer")} ${t("Histórico de {name}", { name: user.username })}`,
                        thumbnailUrl: user.displayAvatarURL({ size: 128 }),
                        description: cases.length ? cases.map(caseLine).join("\n") : t("Sem registos. 😇"),
                        footerText: t("Avisos riscados já foram anulados."),
                    })],
                    flags: CV2_FLAG | MessageFlags.Ephemeral,
                    allowedMentions: { parse: [] },
                });
            }
            case "remover-aviso": {
                const number = interaction.options.getInteger("caso", true);
                const entry = await getCase(guild.id, number);
                if (!entry || entry.action !== "warn") return void fail(interaction, t("Não há nenhum aviso com o número {n}.", { n: number }));
                if (!entry.active) return void fail(interaction, t("O aviso #{n} já estava anulado.", { n: number }));
                await setCaseActive(guild.id, number, false);
                void modLog(guild, entry, t("Aviso anulado por {mod}.", { mod: `<@${moderator.id}>` }));
                return void interaction.reply({ components: [successContainer(t("Aviso #{n} anulado.", { n: number }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            }
            case "limpar-avisos": {
                const user = interaction.options.getUser("membro", true);
                const cleared = await clearWarns(guild.id, user.id);
                return void interaction.reply({ components: [successContainer(t("{count, plural, =0 {{user} não tinha avisos ativos.} one {# aviso de {user} anulado.} other {# avisos de {user} anulados.}}", { count: cleared, user: `<@${user.id}>` }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            }
            case "desbanir": {
                const id = interaction.options.getString("id", true).trim();
                if (!/^\d{15,25}$/.test(id)) return void fail(interaction, t("Esse ID não é válido."));
                const ban = await guild.bans.fetch(id).catch(() => null);
                if (!ban) return void fail(interaction, t("Esse utilizador não está banido."));
                const result = await unbanUser(guild, ban.user, moderator, reason);
                return void done(interaction, t("{user} já pode voltar ao servidor.", { user: `\`${ban.user.tag}\`` }), result);
            }
            case "limpar": {
                const channel = interaction.channel;
                if (!channel || !("bulkDelete" in channel)) return void fail(interaction, t("Aqui não dá para apagar mensagens em massa."));
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const deleted = await purgeMessages(channel, moderator, interaction.options.getInteger("quantidade", true), interaction.options.getUser("membro")?.id ?? null);
                return void interaction.editReply({ content: t("🧹 {count, plural, =0 {Não havia mensagens para apagar (só dá até 14 dias).} one {# mensagem apagada.} other {# mensagens apagadas.}}", { count: deleted }) });
            }
            case "banir": {
                const user = interaction.options.getUser("membro", true);
                const member = interaction.options.getMember("membro");
                if (member) {
                    const problem = hierarchyProblem(moderator, member, "ban");
                    if (problem) return void fail(interaction, problem);
                }
                const result = await banUser(guild, user, moderator, reason, interaction.options.getInteger("apagar_dias") ?? 0);
                return void done(interaction, t("{user} foi banido.", { user: `<@${user.id}>` }), result);
            }
        }

        const target = interaction.options.getMember("membro");
        if (!target) return void fail(interaction, t("Esse membro já não está no servidor."));

        switch (sub) {
            case "avisar": {
                if (target.user.bot) return void fail(interaction, t("Os bots não levam avisos."));
                if (target.id === moderator.id) return void fail(interaction, t("Não te podes avisar a ti mesmo."));
                const result = await warnMember(target, moderator, reason);
                return void done(interaction, t("{user} foi avisado.", { user: `<@${target.id}>` }), result);
            }
            case "castigo": {
                const problem = hierarchyProblem(moderator, target, "moderate");
                if (problem) return void fail(interaction, problem);
                const ms = parseDuration(interaction.options.getString("duracao", true));
                if (!ms || ms < 10_000) return void fail(interaction, t("Duração inválida — usa algo como `10m`, `1h` ou `2d`."));
                const result = await timeoutMember(target, moderator, ms, reason);
                return void done(interaction, t("{user} ficou de castigo durante {duration}.", { user: `<@${target.id}>`, duration: humanizeDuration(Math.min(ms, MAX_TIMEOUT_MS)) }), result);
            }
            case "tirar-castigo": {
                if (!target.isCommunicationDisabled()) return void fail(interaction, t("{user} não está de castigo.", { user: `<@${target.id}>` }));
                const result = await removeTimeout(target, moderator, reason);
                return void done(interaction, t("O castigo de {user} acabou.", { user: `<@${target.id}>` }), result);
            }
            case "expulsar": {
                const problem = hierarchyProblem(moderator, target, "kick");
                if (problem) return void fail(interaction, problem);
                const result = await kickMember(target, moderator, reason);
                return void done(interaction, t("{user} foi expulso.", { user: `\`${target.user.tag}\`` }), result);
            }
        }
    },
});
