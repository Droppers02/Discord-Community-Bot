import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, ButtonBuilder, ButtonStyle, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { buildContainer, errorContainer, row, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { e } from "../../../lib/emojis.js";
import { formatNumber, t } from "../../../lib/i18n.js";
import { humanizeDuration, timestamp } from "../../../lib/time.js";
import { activeDays, activitySince } from "../../../repositories/activityRepository.js";
import { getAccount } from "../../../repositories/economyRepository.js";
import { statsOf } from "../../../repositories/gameStatsRepository.js";
import { divorce, friendshipsOf, getFriendship, getProfile, marriageOf, removeFriend, requestFriend, setRingTier } from "../../../repositories/socialRepository.js";
import { achievementLine, ACHIEVEMENTS, memberStats, unlocked } from "../../../modules/community/achievements.js";
import { formatCoins, lisbonDay, spendCoins } from "../../../modules/economy/economyService.js";
import { GAMES, isGameKey } from "../../../modules/games/gameCore.js";
import { RING_TIERS, ringOf } from "../../../modules/community/rings.js";

const ephemeralError = (text: string) => ({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral } as const);

// ─── /editarperfil ───────────────────────────────────────────────────────────
createCommand({
    name: "editarperfil",
    description: t("Muda a bio, a cor, o aniversário e o jogo favorito do teu /perfil."),
    type: ApplicationCommandType.ChatInput,
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const profile = await getProfile(interaction.guildId, interaction.user.id);
        const field = (id: string, label: string, value: string | null, max: number, opts: { paragraph?: boolean; placeholder?: string } = {}) =>
            new LabelBuilder().setLabel(label).setTextInputComponent((() => {
                const input = new TextInputBuilder().setCustomId(id).setStyle(opts.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false).setMaxLength(max);
                if (value) input.setValue(value);
                if (opts.placeholder) input.setPlaceholder(opts.placeholder);
                return input;
            })());
        await interaction.showModal(new ModalBuilder().setCustomId("profile/edit").setTitle(t("Editar perfil")).addLabelComponents(
            field("bio", t("Bio"), profile.bio, 300, { paragraph: true, placeholder: t("Escreve algo sobre ti…") }),
            field("color", t("Cor do perfil"), profile.color, 20, { placeholder: "#7C5CFF" }),
            field("birthday", t("Aniversário (DD/MM)"), profile.birthday, 5, { placeholder: "25/12" }),
            field("game", t("Jogo favorito"), profile.favorite_game, 60, { placeholder: "Minecraft" }),
        ));
    },
});

// ─── /conquistas ─────────────────────────────────────────────────────────────
createCommand({
    name: "conquistas",
    description: t("As conquistas (badges) de um membro."),
    type: ApplicationCommandType.ChatInput,
    options: [{ name: "membro", description: t("Membro (vazio = tu)"), type: ApplicationCommandOptionType.User, required: false }],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const member = interaction.options.getMember("membro") ?? interaction.member;
        const stats = await memberStats(interaction.guildId, member.id);
        const done = new Set(unlocked(stats).map((achievement) => achievement.id));
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.gold,
                title: `${e("medal")} ${t("Conquistas de {name} ({done}/{total})", { name: member.displayName, done: done.size, total: ACHIEVEMENTS.length })}`,
                thumbnailUrl: member.displayAvatarURL({ size: 128 }),
                description: [...ACHIEVEMENTS].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id))).map((achievement) => achievementLine(achievement, done.has(achievement.id))).join("\n"),
            })],
            flags: CV2_FLAG,
            allowedMentions: { parse: [] },
        });
    },
});

// ─── /amigos ─────────────────────────────────────────────────────────────────
createCommand({
    name: "amigos",
    description: t("A tua lista de amigos no servidor."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "lista", description: t("Amigos e pedidos pendentes."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "membro", description: t("De quem (vazio = tu)"), type: ApplicationCommandOptionType.User, required: false }] },
        { name: "adicionar", description: t("Envia um pedido de amizade."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "membro", description: t("Quem"), type: ApplicationCommandOptionType.User, required: true }] },
        { name: "remover", description: t("Remove um amigo (ou cancela o pedido)."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "membro", description: t("Quem"), type: ApplicationCommandOptionType.User, required: true }] },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        if (sub === "lista") {
            const member = interaction.options.getMember("membro") ?? interaction.member;
            const list = await friendshipsOf(interaction.guildId, member.id);
            const friends = list.filter((entry) => entry.status === "accepted");
            const incoming = list.filter((entry) => entry.status === "pending" && entry.requester_id !== member.id);
            const outgoing = list.filter((entry) => entry.status === "pending" && entry.requester_id === member.id);
            const own = member.id === interaction.user.id;
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.primary,
                    title: `🤝 ${t("Amigos de {name} ({count})", { name: member.displayName, count: friends.length })}`,
                    description: [
                        friends.length ? friends.map((entry) => `<@${entry.other}> · ${t("desde {at}", { at: timestamp(entry.created_at, "D") })}`).join("\n") : t("*Ainda sem amigos.*"),
                        own && incoming.length ? `\n**${t("Pedidos recebidos")}**\n${incoming.map((entry) => `<@${entry.other}>`).join(", ")}` : null,
                        own && outgoing.length ? `\n**${t("Pedidos enviados")}**\n${outgoing.map((entry) => `<@${entry.other}>`).join(", ")}` : null,
                    ].filter(Boolean).join("\n"),
                    rows: own ? incoming.slice(0, 5).map((entry) => row(
                        new ButtonBuilder().setCustomId(`friend/accept/${entry.other}/${interaction.user.id}`).setLabel(t("Aceitar {name}", { name: interaction.guild.members.cache.get(entry.other)?.displayName ?? entry.other }).slice(0, 80)).setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`friend/decline/${entry.other}/${interaction.user.id}`).setLabel(t("Recusar")).setStyle(ButtonStyle.Secondary),
                    )) : [],
                })],
                flags: own ? CV2_FLAG | MessageFlags.Ephemeral : CV2_FLAG,
                allowedMentions: { parse: [] },
            });
        }
        const target = interaction.options.getMember("membro");
        if (!target || target.user.bot || target.id === interaction.user.id) return void interaction.reply(ephemeralError(t("Escolhe outro membro.")));
        if (sub === "remover") {
            const removed = await removeFriend(interaction.guildId, interaction.user.id, target.id);
            return void interaction.reply({ components: [removed ? successContainer(t("{user} já não está na tua lista.", { user: `<@${target.id}>` })) : errorContainer(t("Não são amigos."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const existing = await getFriendship(interaction.guildId, interaction.user.id, target.id);
        if (existing?.status === "accepted") return void interaction.reply(ephemeralError(t("Já são amigos. 💛")));
        if (existing?.status === "pending" && existing.requester_id === interaction.user.id) return void interaction.reply(ephemeralError(t("Já enviaste um pedido a {user}.", { user: `<@${target.id}>` })));
        if (!existing) await requestFriend(interaction.guildId, interaction.user.id, target.id);
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.primary,
                description: `🤝 ${t("{from} quer ser amigo(a) de {to}!", { from: `<@${interaction.user.id}>`, to: `<@${target.id}>` })}`,
                rows: [row(
                    new ButtonBuilder().setCustomId(`friend/accept/${interaction.user.id}/${target.id}`).setLabel(t("Aceitar")).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`friend/decline/${interaction.user.id}/${target.id}`).setLabel(t("Recusar")).setStyle(ButtonStyle.Secondary),
                )],
            })],
            flags: CV2_FLAG,
            allowedMentions: { users: [target.id] },
        });
    },
});

// ─── /casamento ──────────────────────────────────────────────────────────────
createCommand({
    name: "casamento",
    description: t("Casamentos no servidor 💍"),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "pedir", description: t("Pede alguém em casamento."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "membro", description: t("Quem"), type: ApplicationCommandOptionType.User, required: true }] },
        { name: "ver", description: t("O casamento de alguém."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "membro", description: t("Quem (vazio = tu)"), type: ApplicationCommandOptionType.User, required: false }] },
        {
            name: "anel",
            description: t("Melhora o anel (paga quem usa o comando)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [{ name: "nivel", description: t("Anel"), type: ApplicationCommandOptionType.Integer, required: true, choices: RING_TIERS.slice(1).map((ring) => ({ name: `${ring.icon} ${t(ring.name)} — ${formatNumber(ring.price)}`, value: ring.tier })) }],
        },
        { name: "divorciar", description: t("Termina o casamento 💔"), type: ApplicationCommandOptionType.Subcommand },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        const mine = await marriageOf(interaction.guildId, interaction.user.id);
        if (sub === "ver") {
            const member = interaction.options.getMember("membro") ?? interaction.member;
            const marriage = member.id === interaction.user.id ? mine : await marriageOf(interaction.guildId, member.id);
            if (!marriage) return void interaction.reply({ components: [buildContainer({ color: COLORS.neutral, description: t("{user} não está casado(a).", { user: `<@${member.id}>` }) })], flags: CV2_FLAG, allowedMentions: { parse: [] } });
            const ring = ringOf(marriage.ring_tier);
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.danger,
                    title: `💍 ${t("Casamento")}`,
                    description: [
                        `<@${member.id}> ❤️ <@${marriage.partner}>`,
                        t("Casados desde {at} ({time})", { at: timestamp(marriage.married_at, "D"), time: humanizeDuration(Date.now() - marriage.married_at) }),
                        t("Anel: {icon} {name}", { icon: ring.icon, name: t(ring.name) }),
                    ].join("\n"),
                })],
                flags: CV2_FLAG,
                allowedMentions: { parse: [] },
            });
        }
        if (sub === "divorciar") {
            if (!mine) return void interaction.reply(ephemeralError(t("Não estás casado(a).")));
            await divorce(interaction.guildId, interaction.user.id);
            return void interaction.reply({ components: [buildContainer({ color: COLORS.neutral, description: `💔 ${t("{a} e {b} divorciaram-se.", { a: `<@${interaction.user.id}>`, b: `<@${mine.partner}>` })}` })], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        }
        if (sub === "anel") {
            if (!mine) return void interaction.reply(ephemeralError(t("Primeiro tens de casar. 😉")));
            const ring = ringOf(interaction.options.getInteger("nivel", true));
            if (ring.tier <= mine.ring_tier) return void interaction.reply(ephemeralError(t("O vosso anel já é {name} ou melhor.", { name: t(ringOf(mine.ring_tier).name) })));
            const balance = await spendCoins(interaction.guildId, interaction.user.id, ring.price, "ring", t(ring.name));
            if (balance === null) return void interaction.reply(ephemeralError(t("O anel {name} custa {price}.", { name: t(ring.name), price: formatCoins(ring.price) })));
            await setRingTier(interaction.guildId, interaction.user.id, ring.tier);
            return void interaction.reply({ components: [successContainer(t("{a} ofereceu um anel {icon} **{name}** a {b}! 💞", { a: `<@${interaction.user.id}>`, b: `<@${mine.partner}>`, icon: ring.icon, name: t(ring.name) }))], flags: CV2_FLAG, allowedMentions: { users: [mine.partner] } });
        }
        // pedir
        const target = interaction.options.getMember("membro");
        if (!target || target.user.bot || target.id === interaction.user.id) return void interaction.reply(ephemeralError(t("Escolhe outra pessoa. 😅")));
        if (mine) return void interaction.reply(ephemeralError(t("Já estás casado(a) com {user}!", { user: `<@${mine.partner}>` })));
        if (await marriageOf(interaction.guildId, target.id)) return void interaction.reply(ephemeralError(t("{user} já está casado(a).", { user: `<@${target.id}>` })));
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.danger,
                title: `💍 ${t("Pedido de casamento!")}`,
                description: t("{from} ajoelhou-se e pediu {to} em casamento! 💐\n{to}, aceitas?", { from: `<@${interaction.user.id}>`, to: `<@${target.id}>` }),
                rows: [row(
                    new ButtonBuilder().setCustomId(`marry/accept/${interaction.user.id}/${target.id}`).setLabel(t("Sim, aceito!")).setEmoji("💍").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`marry/decline/${interaction.user.id}/${target.id}`).setLabel(t("Não…")).setStyle(ButtonStyle.Secondary),
                )],
            })],
            flags: CV2_FLAG,
            allowedMentions: { users: [target.id] },
        });
    },
});

// ─── /atividade ──────────────────────────────────────────────────────────────
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function bar(value: number, max: number, width = 12): string {
    const filled = max > 0 ? Math.round((value / max) * width) : 0;
    return "█".repeat(filled) + "░".repeat(width - filled);
}

function sparkline(values: number[]): string {
    const max = Math.max(...values, 1);
    return values.map((value) => (value <= 0 ? " " : BLOCKS[Math.min(7, Math.floor((value / max) * 7.999))])).join("");
}

createCommand({
    name: "atividade",
    description: t("Gráfico de atividade (mensagens, XP e voz) por dia."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "membro", description: t("De quem (vazio = tu)"), type: ApplicationCommandOptionType.User, required: false },
        { name: "periodo", description: t("Período"), type: ApplicationCommandOptionType.Integer, required: false, choices: [{ name: t("Última semana"), value: 7 }, { name: t("Último mês"), value: 30 }, { name: t("Últimos 3 meses"), value: 90 }] },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const member = interaction.options.getMember("membro") ?? interaction.member;
        const days = interaction.options.getInteger("periodo") ?? 7;
        const now = Date.now();
        const daysList = Array.from({ length: days }, (_, i) => lisbonDay(now - (days - 1 - i) * 86_400_000));
        const rows = await activitySince(interaction.guildId, member.id, daysList[0]!);
        const byDay = new Map(rows.map((entry) => [entry.day, entry]));
        const series = daysList.map((day) => byDay.get(day) ?? { day, messages: 0, xp: 0, voice_seconds: 0 });
        const totals = series.reduce((acc, entry) => ({ messages: acc.messages + entry.messages, xp: acc.xp + entry.xp, voice: acc.voice + entry.voice_seconds }), { messages: 0, xp: 0, voice: 0 });
        const best = [...series].sort((a, b) => b.messages - a.messages)[0];
        const activeCount = series.filter((entry) => entry.messages > 0 || entry.voice_seconds > 0).length;

        let chart: string;
        if (days <= 7) {
            const max = Math.max(...series.map((entry) => entry.messages), 1);
            chart = series.map((entry) => {
                const date = new Date(`${entry.day}T12:00:00Z`);
                return `\`${WEEKDAYS[date.getUTCDay()]} ${entry.day.slice(8)}/${entry.day.slice(5, 7)}\` \`${bar(entry.messages, max)}\` ${formatNumber(entry.messages)} msg${entry.voice_seconds ? ` · ${humanizeDuration(entry.voice_seconds * 1000)} 🎙️` : ""}`;
            }).join("\n");
        } else {
            chart = [
                `${t("Mensagens")}\n\`${sparkline(series.map((entry) => entry.messages))}\``,
                `${t("Voz")}\n\`${sparkline(series.map((entry) => entry.voice_seconds))}\``,
                `-# ${t("{from} → {to}", { from: daysList[0]!.split("-").reverse().join("/"), to: daysList.at(-1)!.split("-").reverse().join("/") })}`,
            ].join("\n");
        }
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.info,
                title: `📊 ${t("Atividade de {name} — {days} dias", { name: member.displayName, days })}`,
                thumbnailUrl: member.displayAvatarURL({ size: 128 }),
                description: chart,
                fields: [{
                    name: t("Resumo"),
                    value: [
                        t("{messages} mensagens · {xp} XP · {voice} em voz", { messages: formatNumber(totals.messages), xp: formatNumber(totals.xp), voice: humanizeDuration(totals.voice * 1000) }),
                        t("Ativo em {active} de {days} dias · média {avg} msg/dia", { active: activeCount, days, avg: formatNumber(Math.round(totals.messages / days)) }),
                        best && best.messages ? t("Melhor dia: {day} ({count} mensagens)", { day: best.day.split("-").reverse().join("/"), count: formatNumber(best.messages) }) : null,
                    ].filter(Boolean).join("\n"),
                }],
            })],
            flags: CV2_FLAG,
            allowedMentions: { parse: [] },
        });
    },
});

// ─── /sequencias ─────────────────────────────────────────────────────────────
function streakFrom(daysDesc: string[], today: string, yesterday: string): { current: number; best: number } {
    const set = new Set(daysDesc);
    let current = 0;
    let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
    while (cursor && set.has(cursor)) {
        current++;
        const date = new Date(`${cursor}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - 1);
        cursor = date.toISOString().slice(0, 10);
    }
    const sorted = [...set].sort();
    let best = 0;
    let run = 0;
    let previous: string | null = null;
    for (const day of sorted) {
        if (previous) {
            const expected = new Date(`${previous}T12:00:00Z`);
            expected.setUTCDate(expected.getUTCDate() + 1);
            run = expected.toISOString().slice(0, 10) === day ? run + 1 : 1;
        } else run = 1;
        best = Math.max(best, run);
        previous = day;
    }
    return { current, best };
}

createCommand({
    name: "sequencias",
    description: t("As tuas sequências: dias seguidos ativo, diário e vitórias."),
    type: ApplicationCommandType.ChatInput,
    options: [{ name: "membro", description: t("De quem (vazio = tu)"), type: ApplicationCommandOptionType.User, required: false }],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const member = interaction.options.getMember("membro") ?? interaction.member;
        const now = Date.now();
        const [days, account, games] = await Promise.all([activeDays(interaction.guildId, member.id), getAccount(interaction.guildId, member.id), statsOf(interaction.guildId, member.id)]);
        const activity = streakFrom(days, lisbonDay(now), lisbonDay(now - 86_400_000));
        const hot = games.filter((stat) => stat.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 5);
        const gameName = (key: string) => (isGameKey(key) ? `${GAMES[key].icon} ${t(GAMES[key].label)}` : key);
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.warning,
                title: `🔥 ${t("Sequências de {name}", { name: member.displayName })}`,
                thumbnailUrl: member.displayAvatarURL({ size: 128 }),
                fields: [
                    { name: t("Dias seguidos ativo"), value: t("**{current}** agora · melhor **{best}**", { current: activity.current, best: activity.best }) },
                    { name: t("Diário"), value: t("**{current}** agora · melhor **{best}**", { current: account?.daily_streak ?? 0, best: account?.best_daily_streak ?? 0 }) },
                    { name: t("Vitórias seguidas"), value: hot.length ? hot.map((stat) => `${gameName(stat.game)} — **${stat.streak}** (${t("melhor {n}", { n: stat.best_streak })})`).join("\n") : t("*Nenhuma sequência a decorrer.*") },
                ],
            })],
            flags: CV2_FLAG,
            allowedMentions: { parse: [] },
        });
    },
});
