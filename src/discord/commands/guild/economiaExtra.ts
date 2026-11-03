import { createCommand, createEvent } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, ButtonBuilder, ButtonStyle, ChannelType, GuildMember, MessageFlags, PermissionFlagsBits } from "discord.js";
import { query, queryOne } from "#database";
import { randomUUID } from "node:crypto";
import { COLORS, parseColorString } from "../../../lib/branding.js";
import { buildContainer, errorContainer, row, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG, hasSuperAdminAccess } from "../../../lib/discord.js";
import { e } from "../../../lib/emojis.js";
import { t } from "../../../lib/i18n.js";
import { logger } from "../../../lib/logger.js";
import { timestamp } from "../../../lib/time.js";
import { ensureGuildConfig } from "../../../repositories/guildConfigRepository.js";
import { accountOf, economyLog, formatCoins, grantCoins, spendCoins } from "../../../modules/economy/economyService.js";
import { getEconomySettings } from "../../../modules/economy/economySettings.js";
import { activeEvents, endEvent, EVENT_INFO, EVENT_TYPES, maybeGoldDrop, startEvent, type EconomyEventType } from "../../../modules/economy/economyEvents.js";
import { trades } from "../../../modules/economy/trades.js";

// ─── /evento ─────────────────────────────────────────────────────────────────
createCommand({
    name: "evento",
    description: t("Eventos especiais de economia (happy hour, super sorte, chuva de ouro…)."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "criar",
            description: t("(Administração) Lança um evento."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "tipo", description: t("Tipo de evento"), type: ApplicationCommandOptionType.String, required: true, choices: EVENT_TYPES.map((value) => ({ name: `${EVENT_INFO[value].icon} ${t(EVENT_INFO[value].label)}`, value })) },
                { name: "horas", description: t("Duração em horas (1 a 72)"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 72 },
                { name: "multiplicador", description: t("Multiplicador (1.5 a 5, por omissão 2)"), type: ApplicationCommandOptionType.Number, required: false, minValue: 1.1, maxValue: 5 },
                { name: "canal", description: t("Canal do anúncio (e da chuva de ouro; vazio = este)"), type: ApplicationCommandOptionType.Channel, required: false, channelTypes: [ChannelType.GuildText] },
            ],
        },
        { name: "ativos", description: t("Eventos a decorrer."), type: ApplicationCommandOptionType.Subcommand },
        {
            name: "terminar",
            description: t("(Administração) Termina um evento antes do tempo."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "evento", description: t("Qual"), type: ApplicationCommandOptionType.String, required: true, autocomplete: true }],
        },
    ],
    async autocomplete(interaction) {
        if (!interaction.inCachedGuild()) return;
        const events = await activeEvents(interaction.guildId);
        await interaction.respond(events.map((event) => ({ name: `${EVENT_INFO[event.type].icon} ${t(EVENT_INFO[event.type].label)} ×${event.multiplier}`, value: event.id })).slice(0, 25));
    },
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        if (sub === "ativos") {
            const events = await activeEvents(interaction.guildId);
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.gold,
                    title: `🎉 ${t("Eventos a decorrer")}`,
                    description: events.length
                        ? events.map((event) => `${EVENT_INFO[event.type].icon} **${t(EVENT_INFO[event.type].label)}** ×${event.multiplier} — ${t("acaba {at}", { at: timestamp(event.ends_at, "R") })}\n-# ${t(EVENT_INFO[event.type].description)}`).join("\n")
                        : t("Não há eventos a decorrer."),
                })],
                flags: CV2_FLAG,
            });
        }
        const config = await ensureGuildConfig(interaction.guildId);
        if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role) && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            return void interaction.reply({ components: [errorContainer(t("Só a administração lança e termina eventos."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        if (sub === "terminar") {
            const ended = await endEvent(interaction.guildId, interaction.options.getString("evento", true));
            return void interaction.reply({ components: [ended ? successContainer(t("Evento terminado.")) : errorContainer(t("Esse evento já não está a decorrer."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const type = interaction.options.getString("tipo", true) as EconomyEventType;
        const hours = interaction.options.getInteger("horas", true);
        const multiplier = Math.round((interaction.options.getNumber("multiplicador") ?? 2) * 10) / 10;
        const channel = interaction.options.getChannel("canal") ?? interaction.channel;
        const event = await startEvent(interaction.guildId, type, multiplier, hours, interaction.user.id, type === "gold_rain" ? channel?.id ?? null : null);
        const info = EVENT_INFO[type];
        const announcement = buildContainer({
            color: COLORS.gold,
            title: `${info.icon} ${t("{event} começou!", { event: t(info.label) })}`,
            description: [t(info.description), t("Multiplicador **×{mult}** · acaba {at}.", { mult: multiplier, at: timestamp(event.ends_at, "R") })].join("\n"),
        });
        if (channel?.isTextBased() && channel.id !== interaction.channelId) {
            await channel.send({ components: [announcement], flags: CV2_FLAG }).catch(() => null);
            return void interaction.reply({ components: [successContainer(t("Evento lançado e anunciado em {channel}.", { channel: `<#${channel.id}>` }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        await interaction.reply({ components: [announcement], flags: CV2_FLAG });
    },
});

createEvent({
    name: "Economia: chuva de ouro",
    event: "messageCreate",
    async run(message) {
        if (!message.inGuild() || message.author.bot) return;
        await maybeGoldDrop(message, (amount) => grantCoins(message.guildId, message.author.id, amount, "event", t("Chuva de ouro"))).catch(() => null);
    },
});

// ─── /cargopessoal ───────────────────────────────────────────────────────────
async function customRoleOf(guildId: string, userId: string): Promise<string | null> {
    const row = await queryOne<{ role_id: string }>("SELECT role_id FROM custom_roles WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
    return row?.role_id ?? null;
}

createCommand({
    name: "cargopessoal",
    description: t("O teu cargo pessoal: nome e cor à tua escolha."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "comprar",
            description: t("Compra o teu cargo pessoal."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "nome", description: t("Nome do cargo (máx. 32)"), type: ApplicationCommandOptionType.String, required: true, maxLength: 32 },
                { name: "cor", description: t("Cor: #FF5733, rgb(255,87,51)…"), type: ApplicationCommandOptionType.String, required: false, maxLength: 30 },
            ],
        },
        {
            name: "editar",
            description: t("Muda o nome ou a cor (grátis)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "nome", description: t("Nome novo"), type: ApplicationCommandOptionType.String, required: false, maxLength: 32 },
                { name: "cor", description: t("Cor nova"), type: ApplicationCommandOptionType.String, required: false, maxLength: 30 },
            ],
        },
        { name: "remover", description: t("Apaga o teu cargo pessoal (sem reembolso)."), type: ApplicationCommandOptionType.Subcommand },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const fail = (text: string) => interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const settings = await getEconomySettings(interaction.guildId);
        const sub = interaction.options.getSubcommand();
        const existingId = await customRoleOf(interaction.guildId, interaction.user.id);
        const existing = existingId ? interaction.guild.roles.cache.get(existingId) ?? null : null;
        const name = interaction.options.getString("nome")?.trim();
        const rawColor = interaction.options.getString("cor")?.trim();
        const color = rawColor ? parseColorString(rawColor) : null;
        if (rawColor && color === null) return void fail(t("Cor inválida. Usa por exemplo `#FF5733`."));
        const blocked = name && /(@everyone|@here|admin|moderador|staff)/i.test(name);
        if (blocked) return void fail(t("Esse nome não é permitido."));

        if (sub === "remover") {
            if (!existingId) return void fail(t("Não tens cargo pessoal."));
            await existing?.delete(t("Cargo pessoal removido pelo dono")).catch(() => null);
            await query("DELETE FROM custom_roles WHERE guild_id = $1 AND user_id = $2", [interaction.guildId, interaction.user.id]);
            return void interaction.reply({ components: [successContainer(t("O teu cargo pessoal foi apagado."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        if (sub === "editar") {
            if (!existing) return void fail(t("Ainda não tens cargo pessoal — compra-o com `/cargopessoal comprar`."));
            if (!name && color === null) return void fail(t("Diz o nome novo e/ou a cor nova."));
            await existing.edit({ ...(name ? { name } : {}), ...(color !== null ? { colors: { primaryColor: color } } : {}), reason: t("Cargo pessoal editado") });
            return void interaction.reply({ components: [successContainer(t("Cargo atualizado: {role}", { role: `<@&${existing.id}>` }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }

        // comprar
        if (!settings.enabled || !settings.custom_role_enabled) return void fail(t("A compra de cargos pessoais está desligada."));
        if (existing) return void fail(t("Já tens um cargo pessoal ({role}). Usa `/cargopessoal editar`.", { role: `<@&${existing.id}>` }));
        if (!name) return void fail(t("Escolhe o nome."));
        const me = interaction.guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return void fail(t("O bot precisa da permissão de gerir cargos."));
        const balance = await spendCoins(interaction.guildId, interaction.user.id, settings.custom_role_price, "custom_role", name);
        if (balance === null) return void fail(t("Custa {price} — não tens moedas suficientes.", { price: formatCoins(settings.custom_role_price, settings) }));
        try {
            const anchor = settings.custom_role_anchor ? interaction.guild.roles.cache.get(settings.custom_role_anchor) : null;
            const position = anchor && anchor.position < me.roles.highest.position ? anchor.position + 1 : Math.max(1, me.roles.highest.position - 1);
            const role = await interaction.guild.roles.create({ name, colors: { primaryColor: color ?? 0x7289da }, position, reason: t("Cargo pessoal de {user}", { user: interaction.user.username }) });
            await interaction.member.roles.add(role);
            await query("INSERT INTO custom_roles (guild_id, user_id, role_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id) DO UPDATE SET role_id = $3", [interaction.guildId, interaction.user.id, role.id, Date.now()]);
            void economyLog(interaction.guild, settings, t("{user} comprou o cargo pessoal {role}.", { user: `<@${interaction.user.id}>`, role: `<@&${role.id}>` }));
            await interaction.reply({ components: [successContainer(t("Aqui está o teu cargo: {role}! Saldo: {balance}.", { role: `<@&${role.id}>`, balance: formatCoins(balance, settings) }))], flags: CV2_FLAG });
        } catch (error) {
            logger.warn("Cargo pessoal: falha a criar:", error);
            await grantCoins(interaction.guildId, interaction.user.id, settings.custom_role_price, "refund", name);
            await fail(t("Não consegui criar o cargo — as moedas foram devolvidas."));
        }
    },
});

// ─── /troca ──────────────────────────────────────────────────────────────────
createCommand({
    name: "troca",
    description: t("Propõe uma troca de moedas a alguém (ele aceita ou recusa)."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "membro", description: t("Com quem"), type: ApplicationCommandOptionType.User, required: true },
        { name: "ofereces", description: t("Moedas que dás"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 0, maxValue: 1_000_000_000 },
        { name: "pedes", description: t("Moedas que pedes"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 0, maxValue: 1_000_000_000 },
        { name: "nota", description: t("Porquê (ex.: \"pela aposta de ontem\")"), type: ApplicationCommandOptionType.String, required: false, maxLength: 150 },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const fail = (text: string) => interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const target = interaction.options.getMember("membro");
        const offer = interaction.options.getInteger("ofereces") ?? 0;
        const ask = interaction.options.getInteger("pedes") ?? 0;
        if (!target || target.user.bot || target.id === interaction.user.id) return void fail(t("Escolhe outro membro (não um bot, nem tu)."));
        if (!offer && !ask) return void fail(t("Diz quanto ofereces e/ou quanto pedes."));
        const settings = await getEconomySettings(interaction.guildId);
        if (!settings.enabled) return void fail(t("A economia está desligada."));
        const mine = await accountOf(interaction.guildId, interaction.user.id);
        if (mine.balance < offer) return void fail(t("Não tens {amount}.", { amount: formatCoins(offer) }));
        const id = randomUUID().slice(0, 10);
        trades.set(id, { guildId: interaction.guildId, fromId: interaction.user.id, toId: target.id, offer, ask, note: interaction.options.getString("nota") });
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.gold,
                title: `${e("transfer")} ${t("Proposta de troca")}`,
                description: [
                    t("{from} propõe a {to}:", { from: `<@${interaction.user.id}>`, to: `<@${target.id}>` }),
                    t("**Dá:** {amount}", { amount: offer ? formatCoins(offer) : t("nada") }),
                    t("**Pede:** {amount}", { amount: ask ? formatCoins(ask) : t("nada") }),
                    interaction.options.getString("nota") ? `-# ${interaction.options.getString("nota")}` : null,
                    t("Expira {at}.", { at: timestamp(Date.now() + 5 * 60_000, "R") }),
                ].filter(Boolean).join("\n"),
                rows: [row(
                    new ButtonBuilder().setCustomId(`trade/accept/${id}`).setLabel(t("Aceitar")).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`trade/decline/${id}`).setLabel(t("Recusar")).setStyle(ButtonStyle.Danger),
                )],
            })],
            flags: CV2_FLAG,
            allowedMentions: { users: [target.id] },
        });
    },
});
