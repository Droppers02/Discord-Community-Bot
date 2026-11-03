import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, GuildMember, MessageFlags, PermissionFlagsBits } from "discord.js";
import { errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { resetGuildLevels, resetMemberLevel } from "../../../repositories/levelRepository.js";
import { appendAuditLog } from "../../../services/auditService.js";
import { adjustMemberXp } from "../../../modules/levels/levelService.js";
import { getLevelsSettings } from "../../../modules/levels/levelSettings.js";
import { buildRankCard } from "../../../modules/levels/levelViews.js";
import { buildRanking, isRankingType, RANKING_LABELS } from "../../../modules/community/rankings.js";
import { RANKING_TYPES } from "../../../repositories/rankingRepository.js";

const OFF = () => errorContainer(t("Os níveis estão desligados neste servidor. Um administrador pode ligá-los em `/config → Níveis e XP`."));

createCommand({
    name: "nivel",
    description: t("Mostra o teu nível e XP (ou o de outro membro)."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "membro", description: t("Membro a consultar"), type: ApplicationCommandOptionType.User, required: false },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const settings = await getLevelsSettings(interaction.guildId);
        if (!settings.enabled) return void interaction.reply({ components: [OFF()], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const target = interaction.options.getMember("membro") ?? interaction.member;
        await interaction.reply({ components: [await buildRankCard(target, settings)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

createCommand({
    name: "ranking",
    description: t("Rankings do servidor: XP, moedas, jogos, reputação, voz e mensagens."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "tipo",
            description: t("Que ranking ver (por omissão, XP)"),
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: RANKING_TYPES.map((value) => ({ name: t(RANKING_LABELS[value].label), value })),
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const raw = interaction.options.getString("tipo") ?? "xp";
        const type = isRankingType(raw) ? raw : "xp";
        await interaction.reply({ components: [await buildRanking(interaction.guild, type, 0, interaction.user.id)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

createCommand({
    name: "xp",
    description: t("Ajustar o XP dos membros (administração)."),
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    options: [
        {
            name: "dar",
            description: t("Dá XP a um membro."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: true },
                { name: "quantidade", description: t("XP a dar"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 1_000_000 },
            ],
        },
        {
            name: "tirar",
            description: t("Tira XP a um membro."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: true },
                { name: "quantidade", description: t("XP a tirar"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 1_000_000 },
            ],
        },
        {
            name: "definir-nivel",
            description: t("Põe um membro num nível (o XP acerta-se sozinho)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: true },
                { name: "nivel", description: t("Nível"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 0, maxValue: 500 },
            ],
        },
        {
            name: "repor",
            description: t("Apaga o XP de um membro, ou de todos."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "membro", description: t("Membro (vazio = TODOS os membros)"), type: ApplicationCommandOptionType.User, required: false },
            ],
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role) && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            return void interaction.reply({ components: [errorContainer(t("Precisas de gerir o servidor para mexer no XP."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const sub = interaction.options.getSubcommand();
        const reply = (text: string) => interaction.reply({ components: [successContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });

        if (sub === "repor") {
            const member = interaction.options.getMember("membro");
            if (member) {
                await resetMemberLevel(interaction.guildId, member.id);
                appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "levels.reset", details: { userId: member.id } });
                return void reply(t("O XP de {user} foi apagado.", { user: `<@${member.id}>` }));
            }
            const removed = await resetGuildLevels(interaction.guildId);
            appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "levels.reset_all", details: { removed } });
            return void reply(t("O XP de todos os membros foi apagado ({count, plural, one {# membro} other {# membros}}).", { count: removed }));
        }

        const member = interaction.options.getMember("membro");
        if (!member) return void interaction.reply({ components: [errorContainer(t("Esse membro já não está no servidor."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const mode = sub === "dar" ? "add" : sub === "tirar" ? "remove" : "level";
        const amount = sub === "definir-nivel" ? interaction.options.getInteger("nivel", true) : interaction.options.getInteger("quantidade", true);
        const result = await adjustMemberXp(member, mode, amount);
        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "levels.adjust", details: { userId: member.id, mode, amount, xp: result.xp } });
        await reply(t("{user} tem agora **{xp} XP** (nível {before} → {after}).", { user: `<@${member.id}>`, xp: result.xp, before: result.before, after: result.after }));
    },
});
