import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, GuildMember, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { applyDelta, resetAccount, setBalance, transferCoins } from "../../../repositories/economyRepository.js";
import { appendAuditLog } from "../../../services/auditService.js";
import { getEconomySettings } from "../../../modules/economy/economySettings.js";
import { accountOf, claimDaily, claimWork, economyLog, formatCoins } from "../../../modules/economy/economyService.js";
import { buildBalanceCard, buildDailyRefused, buildDailyResult, buildLedger, buildShop, buildWorkRefused, buildWorkResult } from "../../../modules/economy/economyViews.js";

const OFF = () => errorContainer(t("A economia está desligada neste servidor. Um administrador pode ligá-la em `/config → Economia`."));

async function ensureOn(interaction: ChatInputCommandInteraction<"cached">): Promise<boolean> {
    const settings = await getEconomySettings(interaction.guildId);
    if (settings.enabled) return true;
    await interaction.reply({ components: [OFF()], flags: CV2_FLAG | MessageFlags.Ephemeral });
    return false;
}

createCommand({
    name: "saldo",
    description: t("Mostra a tua carteira de EPA Coins (ou a de outro membro)."),
    type: ApplicationCommandType.ChatInput,
    options: [{ name: "membro", description: t("Membro a consultar"), type: ApplicationCommandOptionType.User, required: false }],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await ensureOn(interaction))) return;
        const member = interaction.options.getMember("membro") ?? interaction.member;
        if (member.user.bot) return void interaction.reply({ components: [errorContainer(t("Os bots não têm carteira."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const settings = await getEconomySettings(interaction.guildId);
        const account = await accountOf(interaction.guildId, member.id);
        await interaction.reply({ components: [await buildBalanceCard(member, account, settings)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

createCommand({
    name: "diario",
    description: t("Recebe a recompensa diária — quantos mais dias seguidos, maior."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await ensureOn(interaction))) return;
        const settings = await getEconomySettings(interaction.guildId);
        const outcome = await claimDaily(interaction.guildId, interaction.user.id);
        if (!outcome.ok) return void interaction.reply({ components: [buildDailyRefused(outcome.result)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        await interaction.reply({ components: [buildDailyResult(outcome.result, outcome.balance, settings)], flags: CV2_FLAG });
    },
});

createCommand({
    name: "trabalhar",
    description: t("Trabalha para ganhar umas moedas (de hora a hora, por omissão)."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await ensureOn(interaction))) return;
        const settings = await getEconomySettings(interaction.guildId);
        const outcome = await claimWork(interaction.guildId, interaction.user.id);
        if (!outcome.ok) return void interaction.reply({ components: [buildWorkRefused(outcome.result)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        await interaction.reply({ components: [buildWorkResult(outcome.result, outcome.balance, settings)], flags: CV2_FLAG });
    },
});

createCommand({
    name: "transferir",
    description: t("Envia moedas a outro membro."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "membro", description: t("Quem recebe"), type: ApplicationCommandOptionType.User, required: true },
        { name: "quantia", description: t("Quantas moedas"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 100_000_000 },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await ensureOn(interaction))) return;
        const target = interaction.options.getMember("membro");
        const amount = interaction.options.getInteger("quantia", true);
        const fail = (text: string) => interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        if (!target) return void fail(t("Esse membro não está no servidor."));
        if (target.user.bot) return void fail(t("Não podes enviar moedas a bots."));
        if (target.id === interaction.user.id) return void fail(t("Não podes enviar moedas a ti mesmo."));

        const settings = await getEconomySettings(interaction.guildId);
        const fee = Math.floor(amount * settings.transfer_fee_pct / 100);
        const result = await transferCoins(interaction.guildId, interaction.user.id, target.id, amount, fee, settings.start_balance);
        if (!result) {
            const account = await accountOf(interaction.guildId, interaction.user.id);
            return void fail(t("Não tens moedas suficientes. Tens {balance}.", { balance: formatCoins(account.balance) }));
        }
        await interaction.reply({
            components: [successContainer([
                t("{from} enviou {amount} a {to}.", { from: `<@${interaction.user.id}>`, amount: formatCoins(amount, settings), to: `<@${target.id}>` }),
                fee ? `-# ${t("Taxa: {fee}", { fee: formatCoins(fee) })}` : null,
                `-# ${t("O teu saldo: {balance}", { balance: formatCoins(result.from) })}`,
            ].filter(Boolean).join("\n"))],
            flags: CV2_FLAG,
            allowedMentions: { users: [target.id] },
        });
    },
});

createCommand({
    name: "loja",
    description: t("Compra cargos com as tuas moedas."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await ensureOn(interaction))) return;
        const settings = await getEconomySettings(interaction.guildId);
        const account = await accountOf(interaction.guildId, interaction.user.id);
        await interaction.reply({ components: [buildShop(settings, account.balance, interaction.user.id)], flags: CV2_FLAG | MessageFlags.Ephemeral });
    },
});

createCommand({
    name: "extrato",
    description: t("Os teus últimos movimentos de moedas."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await ensureOn(interaction))) return;
        const settings = await getEconomySettings(interaction.guildId);
        await interaction.reply({ components: [await buildLedger(interaction.member, settings)], flags: CV2_FLAG | MessageFlags.Ephemeral });
    },
});

createCommand({
    name: "moedas",
    description: t("Ajustar as moedas dos membros (administração)."),
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    options: [
        {
            name: "dar",
            description: t("Dá moedas a um membro."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: true },
                { name: "quantia", description: t("Quantas moedas"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 1_000_000_000 },
                { name: "motivo", description: t("Motivo (fica no extrato)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 100 },
            ],
        },
        {
            name: "tirar",
            description: t("Tira moedas a um membro."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: true },
                { name: "quantia", description: t("Quantas moedas"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 1_000_000_000 },
                { name: "motivo", description: t("Motivo (fica no extrato)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 100 },
            ],
        },
        {
            name: "definir",
            description: t("Põe o saldo de um membro num valor."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: true },
                { name: "saldo", description: t("Saldo novo"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 0, maxValue: 1_000_000_000 },
            ],
        },
        {
            name: "repor",
            description: t("Apaga a conta de um membro (saldo, sequência e histórico)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "membro", description: t("Membro"), type: ApplicationCommandOptionType.User, required: true }],
        },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role) && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            return void interaction.reply({ components: [errorContainer(t("Precisas de gerir o servidor para mexer nas moedas."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const settings = await getEconomySettings(interaction.guildId);
        const sub = interaction.options.getSubcommand();
        const user = interaction.options.getUser("membro", true);
        const reason = interaction.options.getString("motivo")?.trim() || null;
        const reply = (text: string) => interaction.reply({ components: [successContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        if (user.bot) return void interaction.reply({ components: [errorContainer(t("Os bots não têm carteira."))], flags: CV2_FLAG | MessageFlags.Ephemeral });

        let text: string;
        if (sub === "repor") {
            await resetAccount(interaction.guildId, user.id);
            text = t("A conta de {user} foi apagada.", { user: `<@${user.id}>` });
        } else if (sub === "definir") {
            const balance = await setBalance(interaction.guildId, user.id, interaction.options.getInteger("saldo", true), t("Definido por {mod}", { mod: interaction.user.username }), settings.start_balance);
            text = t("{user} tem agora {balance}.", { user: `<@${user.id}>`, balance: formatCoins(balance, settings) });
        } else {
            const amount = interaction.options.getInteger("quantia", true);
            const delta = sub === "dar" ? amount : -amount;
            const balance = await applyDelta(interaction.guildId, user.id, delta, sub === "dar" ? "admin_add" : "admin_remove", reason, settings.start_balance);
            if (balance === null) {
                const account = await accountOf(interaction.guildId, user.id);
                const zeroed = await setBalance(interaction.guildId, user.id, 0, reason, settings.start_balance);
                text = t("{user} só tinha {had} — ficou com {balance}.", { user: `<@${user.id}>`, had: formatCoins(account.balance), balance: formatCoins(zeroed) });
            } else {
                text = t("{user} tem agora {balance} ({delta}).", { user: `<@${user.id}>`, balance: formatCoins(balance, settings), delta: `${delta > 0 ? "+" : "−"}${Math.abs(delta)}` });
            }
        }
        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: `economy.${sub}`, details: { userId: user.id, reason } });
        void economyLog(interaction.guild, settings, t("{mod} usou `/moedas {sub}` em {user}: {text}", { mod: `<@${interaction.user.id}>`, sub, user: `<@${user.id}>`, text }));
        await reply(text);
    },
});
