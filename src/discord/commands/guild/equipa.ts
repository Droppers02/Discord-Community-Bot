import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { parseColor, validName, validTag } from "../../../modules/teams/teamLogic.js";
import {
    createTeam, deleteTeam, deposit, editTeam, findTeam, inviteToTeam, inviteView, joinTeam, kickFromTeam, leaveTeam, membershipOf,
    rankingView, setRank, teamCard, teamsOf, transferTeam, withdraw, type TeamResult,
} from "../../../modules/teams/teamService.js";

// /equipa — criar, gerir e competir em equipas.

const memberOpt = (description: string) => ({ name: "membro", description, type: ApplicationCommandOptionType.User as const, required: true });
const teamOpt = (required: boolean) => ({ name: "equipa", description: t("Nome ou tag da equipa"), type: ApplicationCommandOptionType.String as const, required, autocomplete: true as const, maxLength: 32 });

async function answer(interaction: ChatInputCommandInteraction<"cached">, result: TeamResult): Promise<void> {
    await interaction.editReply({ components: [result.ok ? successContainer(result.text) : errorContainer(result.reason)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
}

createCommand({
    name: "equipa",
    description: t("Equipas: cria a tua, convida amigos e ganha a guerra semanal."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "criar",
            description: t("Cria uma equipa (custa moedas)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "nome", description: t("3 a 32 caracteres"), type: ApplicationCommandOptionType.String, required: true, maxLength: 32 },
                { name: "tag", description: t("2 a 5 letras/números, ex.: EPA"), type: ApplicationCommandOptionType.String, required: true, maxLength: 5 },
                { name: "cor", description: t("#ff8800 ou vermelho, azul, verde, roxo…"), type: ApplicationCommandOptionType.String, required: false, maxLength: 20 },
                { name: "emoji", description: t("Um emoji para a equipa"), type: ApplicationCommandOptionType.String, required: false, maxLength: 64 },
            ],
        },
        { name: "info", description: t("Ficha de uma equipa (vazio = a tua)."), type: ApplicationCommandOptionType.Subcommand, options: [teamOpt(false)] },
        { name: "entrar", description: t("Entra numa equipa aberta (ou para a qual foste convidado)."), type: ApplicationCommandOptionType.Subcommand, options: [teamOpt(true)] },
        { name: "sair", description: t("Sai da tua equipa."), type: ApplicationCommandOptionType.Subcommand },
        { name: "convidar", description: t("Convida alguém para a tua equipa."), type: ApplicationCommandOptionType.Subcommand, options: [memberOpt(t("Quem convidar"))] },
        { name: "expulsar", description: t("Tira alguém da equipa."), type: ApplicationCommandOptionType.Subcommand, options: [memberOpt(t("Quem tirar"))] },
        { name: "promover", description: t("Faz de alguém oficial (convida e expulsa membros)."), type: ApplicationCommandOptionType.Subcommand, options: [memberOpt(t("Quem promover"))] },
        { name: "despromover", description: t("Um oficial volta a membro."), type: ApplicationCommandOptionType.Subcommand, options: [memberOpt(t("Quem despromover"))] },
        { name: "dono", description: t("Passa a equipa a outro membro."), type: ApplicationCommandOptionType.Subcommand, options: [memberOpt(t("O novo dono"))] },
        { name: "depositar", description: t("Põe moedas no banco da equipa."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "quantia", description: t("Quantas moedas"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1 }] },
        {
            name: "levantar",
            description: t("(Dono) Tira moedas do banco para alguém da equipa."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "quantia", description: t("Quantas moedas"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1 },
                { name: "membro", description: t("Para quem (vazio = para ti)"), type: ApplicationCommandOptionType.User, required: false },
            ],
        },
        {
            name: "editar",
            description: t("Muda a descrição, a cor, o emoji ou se é aberta."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "descricao", description: t("Uma frase sobre a equipa"), type: ApplicationCommandOptionType.String, required: false, maxLength: 200 },
                { name: "cor", description: t("#ff8800 ou um nome de cor"), type: ApplicationCommandOptionType.String, required: false, maxLength: 20 },
                { name: "emoji", description: t("Emoji da equipa"), type: ApplicationCommandOptionType.String, required: false, maxLength: 64 },
                { name: "aberta", description: t("Qualquer um pode entrar sem convite"), type: ApplicationCommandOptionType.Boolean, required: false },
            ],
        },
        { name: "apagar", description: t("(Dono) Apaga a equipa — o banco volta para ti."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "confirmar", description: t("Escreve o nome da equipa para confirmar"), type: ApplicationCommandOptionType.String, required: true, maxLength: 32 }] },
        {
            name: "ranking",
            description: t("A guerra desta semana ou o ranking de sempre."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "tipo", description: t("Semana ou sempre"), type: ApplicationCommandOptionType.String, required: false, choices: [{ name: t("Esta semana"), value: "semana" }, { name: t("Desde sempre"), value: "total" }] }],
        },
    ],
    async autocomplete(interaction) {
        if (!interaction.inCachedGuild()) return;
        const typed = interaction.options.getFocused().toLowerCase();
        const teams = await teamsOf(interaction.guildId);
        await interaction.respond(teams
            .filter((team) => !typed || team.name.toLowerCase().includes(typed) || team.tag.toLowerCase().includes(typed))
            .slice(0, 25)
            .map((team) => ({ name: `[${team.tag}] ${team.name}${team.open ? "" : " 🔒"}`.slice(0, 100), value: team.tag }))).catch(() => null);
    },
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (sub === "info" || sub === "ranking") {
            await interaction.deferReply();
            if (sub === "ranking") return void interaction.editReply({ components: [await rankingView(guild, interaction.options.getString("tipo") !== "total")], flags: CV2_FLAG, allowedMentions: { parse: [] } });
            const input = interaction.options.getString("equipa");
            const team = input ? await findTeam(guild.id, input) : (await membershipOf(guild.id, interaction.user.id))?.team ?? null;
            if (!team) return void interaction.editReply({ components: [errorContainer(input ? t("Não encontrei essa equipa.") : t("Não estás em nenhuma equipa — cria uma com `/equipa criar` ou vê o `/equipa ranking`."))], flags: CV2_FLAG });
            return void interaction.editReply({ components: [await teamCard(guild, team, interaction.user.id)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        }

        if (sub === "convidar") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const target = interaction.options.getMember("membro");
            if (!target) return void answer(interaction, { ok: false, reason: t("Esse membro não está no servidor.") });
            const result = await inviteToTeam(interaction.member, target);
            if (!result.ok || !result.team) return void answer(interaction, result);
            await interaction.channel?.send({ components: [inviteView(result.team, target.id, interaction.user.id)], flags: CV2_FLAG, allowedMentions: { users: [target.id] } }).catch(() => null);
            return void answer(interaction, { ok: true, text: t("Convite enviado a {user}.", { user: `<@${target.id}>` }) });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const member = interaction.options.getMember("membro");
        const needMember = () => answer(interaction, { ok: false, reason: t("Esse membro não está no servidor.") });

        switch (sub) {
            case "criar": {
                const name = validName(interaction.options.getString("nome", true));
                if (!name) return void answer(interaction, { ok: false, reason: t("O nome tem de ter 3 a 32 letras, números ou espaços.") });
                const tag = validTag(interaction.options.getString("tag", true));
                if (!tag) return void answer(interaction, { ok: false, reason: t("A tag tem de ter 2 a 5 letras ou números (ex.: `EPA`).") });
                const colorInput = interaction.options.getString("cor");
                const color = colorInput ? parseColor(colorInput) : 0x7c5cff;
                if (color === null) return void answer(interaction, { ok: false, reason: t("Não percebi a cor — usa `#ff8800` ou um nome (vermelho, azul, verde…).") });
                return void answer(interaction, await createTeam(interaction.member, name, tag, color, interaction.options.getString("emoji")?.trim() || null));
            }
            case "entrar": {
                const team = await findTeam(guild.id, interaction.options.getString("equipa", true));
                if (!team) return void answer(interaction, { ok: false, reason: t("Não encontrei essa equipa.") });
                return void answer(interaction, await joinTeam(interaction.member, team));
            }
            case "sair": return void answer(interaction, await leaveTeam(interaction.member));
            case "expulsar": return void (member ? answer(interaction, await kickFromTeam(interaction.member, member)) : needMember());
            case "promover": return void (member ? answer(interaction, await setRank(interaction.member, member, true)) : needMember());
            case "despromover": return void (member ? answer(interaction, await setRank(interaction.member, member, false)) : needMember());
            case "dono": return void (member ? answer(interaction, await transferTeam(interaction.member, member)) : needMember());
            case "depositar": return void answer(interaction, await deposit(interaction.member, interaction.options.getInteger("quantia", true)));
            case "levantar": return void answer(interaction, await withdraw(interaction.member, interaction.options.getInteger("quantia", true), member));
            case "editar": {
                const colorInput = interaction.options.getString("cor");
                const color = colorInput ? parseColor(colorInput) : undefined;
                if (color === null) return void answer(interaction, { ok: false, reason: t("Não percebi a cor.") });
                const description = interaction.options.getString("descricao");
                const emojiInput = interaction.options.getString("emoji");
                return void answer(interaction, await editTeam(interaction.member, {
                    description: description === null ? undefined : description.trim() || null,
                    color: color ?? undefined,
                    emoji: emojiInput === null ? undefined : emojiInput.trim() || null,
                    open: interaction.options.getBoolean("aberta") ?? undefined,
                }));
            }
            case "apagar": {
                const mine = await membershipOf(guild.id, interaction.user.id);
                if (!mine || mine.team.name.toLowerCase() !== interaction.options.getString("confirmar", true).trim().toLowerCase()) {
                    return void answer(interaction, { ok: false, reason: t("Para confirmar, escreve o nome exato da tua equipa.") });
                }
                return void answer(interaction, await deleteTeam(interaction.member));
            }
        }
    },
});
