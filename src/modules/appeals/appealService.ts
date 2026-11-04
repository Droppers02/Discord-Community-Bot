import { randomUUID } from "node:crypto";
import {
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type Client,
    type Guild,
    type GuildMember,
    type ModalSubmitInteraction,
    type RepliableInteraction,
    type TextChannel,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, errorContainer, row, successContainer, type Row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e, ei } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import { appealsOf, appendAppealAnswer, createAppeal, decideAppeal, getAppeal, setAppealMessage, setAppealVotes, type BanAppeal } from "../../repositories/appealRepository.js";
import { casesOf, createCase } from "../../repositories/modCaseRepository.js";
import { appendAuditLog } from "../../services/auditService.js";
import { caseLine, hasModAccess, modLog } from "../moderation/moderationService.js";
import { appealChannel, appealGuild, appealInviteRow, appealInviteUrl, leaveAppealGuild } from "./appealGuild.js";
import { getAppealSettings, type AppealSettings } from "./appealSettings.js";

// ─── Elegibilidade ───────────────────────────────────────────────────────────

export type Eligibility =
    | { ok: true; banReason: string | null; banCase: number | null }
    | { ok: false; reason: string };

export async function checkEligibility(guild: Guild, userId: string): Promise<Eligibility> {
    const settings = await getAppealSettings(guild.id);
    if (!settings.enabled || !settings.channel) return { ok: false, reason: t("Os pedidos de revisão não estão abertos em **{server}**.", { server: guild.name }) };
    // Tudo em paralelo: o botão da DM tem de abrir o formulário em menos de 3 s.
    const [ban, appeals, cases] = await Promise.all([guild.bans.fetch(userId).catch(() => null), appealsOf(guild.id, userId), casesOf(guild.id, userId, 20)]);
    if (!ban) return { ok: false, reason: t("Não estás banido de **{server}** — não há nada para rever.", { server: guild.name }) };
    if (appeals.some((appeal) => appeal.status === "pending")) return { ok: false, reason: t("Já tens um pedido à espera de resposta. A equipa vai responder-te por aqui.") };
    if (settings.max_appeals > 0 && appeals.length >= settings.max_appeals) return { ok: false, reason: t("Já fizeste {count} pedidos, o máximo permitido.", { count: appeals.length }) };
    const lastDenied = appeals.find((appeal) => appeal.status === "denied");
    if (lastDenied?.decided_at && settings.cooldown_days > 0) {
        const retryAt = lastDenied.decided_at + settings.cooldown_days * 86_400_000;
        if (retryAt > Date.now()) return { ok: false, reason: t("O teu último pedido foi recusado. Podes voltar a pedir {at}.", { at: timestamp(retryAt, "R") }) };
    }
    const banCase = cases.find((entry) => entry.action === "ban") ?? null;
    if (banCase && settings.min_hours_after_ban > 0) {
        const allowedAt = banCase.created_at + settings.min_hours_after_ban * 3_600_000;
        if (allowedAt > Date.now()) return { ok: false, reason: t("Ainda é cedo para pedir revisão. Podes fazê-lo {at}.", { at: timestamp(allowedAt, "R") }) };
    }
    return { ok: true, banReason: ban.reason ?? banCase?.reason ?? null, banCase: banCase?.case_number ?? null };
}

/** Botão do pedido (no painel do servidor de apelos, no /apelo e na DM de quem lá entra). */
export function appealButtonRow(guildId: string): Row {
    return row(new ButtonBuilder().setCustomId(`appeal/start/${guildId}`).setLabel(t("Pedir revisão do ban")).setEmoji(ei("receipt")).setStyle(ButtonStyle.Primary));
}

/** Os pedidos estão abertos neste servidor? */
export async function appealsOpen(guildId: string): Promise<boolean> {
    const settings = await getAppealSettings(guildId);
    return settings.enabled && Boolean(settings.channel);
}

/**
 * Convite para o servidor de apelos, se os pedidos estiverem abertos e o servidor pronto — é o
 * que vai na DM do ban (um botão na DM não serve: depois do ban o Discord já não entrega o clique).
 */
export async function appealInviteForBan(guild: Guild): Promise<string | null> {
    if (!(await appealsOpen(guild.id))) return null;
    return appealInviteUrl(guild.client);
}

/** Texto e botão da DM do ban. */
export function banAppealNotice(inviteUrl: string): { text: string; row: Row } {
    return {
        text: t("Achas que foi injusto? Entra no **servidor de apelos** (botão abaixo): ao entrar, o bot manda-te o formulário por mensagem privada. Depois do ban é a única forma de falares com o bot — não saias de lá até teres resposta."),
        row: appealInviteRow(inviteUrl),
    };
}

/** Painel com o botão do pedido, publicado no servidor de apelos. */
export function buildAppealPanel(mainGuild: Guild): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.info,
        title: `${e("receipt")} ${t("Revisão de bans — {server}", { server: mainGuild.name })}`,
        description: [
            t("Foste banido de **{server}** e achas que foi injusto? Carrega no botão (ou usa `/apelo`) e responde às perguntas.", { server: mainGuild.name }),
            t("A equipa analisa o pedido e responde-te **por mensagem privada** — fica neste servidor até teres resposta, senão o bot não te consegue escrever."),
        ].join("\n\n"),
        rows: [appealButtonRow(mainGuild.id)],
    });
}

/** Publica (ou volta a publicar) o painel no servidor de apelos. Devolve o canal, ou o motivo da falha. */
export async function postAppealPanel(client: Client, mainGuild: Guild): Promise<{ ok: true; channelId: string } | { ok: false; reason: string }> {
    const guild = await appealGuild(client);
    if (!guild) return { ok: false, reason: t("O bot não está no servidor de apelos configurado.") };
    const channel = appealChannel(guild, PermissionFlagsBits.SendMessages);
    if (!channel) return { ok: false, reason: t("O bot não consegue escrever em nenhum canal de texto do servidor de apelos.") };
    const sent = await channel.send({ components: [buildAppealPanel(mainGuild)], flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch(() => null);
    return sent ? { ok: true, channelId: channel.id } : { ok: false, reason: t("Não consegui publicar o painel (permissões do bot?).") };
}

// ─── Formulário (membro banido) ──────────────────────────────────────────────

// Um formulário (modal) não pode esperar: tem de abrir em menos de 3 s. Se a verificação demorar
// mais do que isto, o formulário abre na mesma e a verificação completa é repetida ao enviar.
const FORM_CHECK_BUDGET_MS = 1_200;

/** Responde, ou edita a resposta se a interação já foi adiada. */
async function answer(interaction: RepliableInteraction, container: ContainerPlusBuilder): Promise<void> {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ components: [container], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        return;
    }
    const flags = interaction.inGuild() ? CV2_FLAG | MessageFlags.Ephemeral : CV2_FLAG;
    await interaction.reply({ components: [container], flags, allowedMentions: { parse: [] } });
}

export async function showAppealForm(interaction: ButtonInteraction | ChatInputCommandInteraction, guild: Guild): Promise<void> {
    const eligible = await Promise.race([
        checkEligibility(guild, interaction.user.id),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FORM_CHECK_BUDGET_MS)),
    ]);
    if (eligible && !eligible.ok) return answer(interaction, errorContainer(eligible.reason));
    const settings = await getAppealSettings(guild.id);
    const field = (id: string, label: string, required: boolean) => new LabelBuilder().setLabel(label).setTextInputComponent(
        new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Paragraph).setRequired(required).setMinLength(required ? 20 : 0).setMaxLength(1000),
    );
    await interaction.showModal(new ModalBuilder()
        .setCustomId(`appeal/submit/${guild.id}`)
        .setTitle(t("Pedido de revisão do ban"))
        .addLabelComponents(
            field("q1", settings.questions[0], true),
            field("q2", settings.questions[1], true),
            field("q3", settings.questions[2], false),
        ));
}

export async function submitAppeal(interaction: ModalSubmitInteraction, guild: Guild): Promise<void> {
    // No servidor de apelos a confirmação só é vista por quem fez o pedido.
    await interaction.deferReply(interaction.inGuild() ? { flags: MessageFlags.Ephemeral } : {});
    const eligible = await checkEligibility(guild, interaction.user.id);
    if (!eligible.ok) return answer(interaction, errorContainer(eligible.reason));
    const settings = await getAppealSettings(guild.id);
    const channel = settings.channel ? guild.channels.cache.get(settings.channel) : null;
    if (!channel?.isTextBased()) return answer(interaction, errorContainer(t("A equipa ainda não configurou onde recebe os pedidos. Tenta mais tarde.")));

    const answers = (["q1", "q2", "q3"] as const)
        .map((id, i) => ({ question: settings.questions[i]!, answer: interaction.fields.getTextInputValue(id).trim() }))
        .filter((entry) => entry.answer);
    const appeal: BanAppeal = {
        id: randomUUID().slice(0, 10),
        guild_id: guild.id,
        user_id: interaction.user.id,
        user_tag: interaction.user.tag,
        ban_reason: eligible.banReason,
        answers,
        status: "pending",
        votes: {},
        reviewer_id: null,
        reviewer_note: null,
        channel_id: null,
        message_id: null,
        created_at: Date.now(),
        decided_at: null,
    };
    await createAppeal(appeal);
    const card = await buildReviewCard(guild, appeal, eligible.banCase);
    const message = await (channel as TextChannel).send({
        components: settings.ping_role ? [buildContainer({ color: COLORS.info, description: `<@&${settings.ping_role}> ${t("novo pedido de revisão de ban.")}` }), card] : [card],
        flags: CV2_FLAG,
        allowedMentions: settings.ping_role ? { roles: [settings.ping_role] } : { parse: [] },
    }).catch((error) => {
        logger.warn("Ban appeal: falha a publicar o pedido:", error);
        return null;
    });
    if (message) {
        await setAppealMessage(appeal.id, channel.id, message.id);
        if (settings.discussion_threads && channel.type === ChannelType.GuildText) {
            await message.startThread({ name: t("Pedido de {user}", { user: interaction.user.username }).slice(0, 90), autoArchiveDuration: 1440 }).catch(() => null);
        }
    }
    await answer(interaction, successContainer(t("O teu pedido foi enviado à equipa de **{server}**. Vais receber a resposta por mensagem privada — não saias do servidor de apelos até lá. Não é preciso enviar outro.", { server: guild.name })));
}

// ─── Cartão da equipa ────────────────────────────────────────────────────────

async function caseSummary(guildId: string, userId: string): Promise<{ text: string; total: number }> {
    const cases = await casesOf(guildId, userId, 20);
    if (!cases.length) return { text: t("*Sem casos registados.*"), total: 0 };
    const counts = cases.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [entry.action]: (acc[entry.action] ?? 0) + 1 }), {});
    const parts = [
        counts.warn ? t("{n} avisos", { n: counts.warn }) : null,
        counts.timeout ? t("{n} castigos", { n: counts.timeout }) : null,
        counts.kick ? t("{n} expulsões", { n: counts.kick }) : null,
        counts.ban ? t("{n} bans", { n: counts.ban }) : null,
    ].filter(Boolean);
    return { text: parts.join(" · ") || t("{n} casos", { n: cases.length }), total: cases.length };
}

export async function buildReviewCard(guild: Guild, appeal: BanAppeal, banCase: number | null = null): Promise<ContainerPlusBuilder> {
    const user = await guild.client.users.fetch(appeal.user_id).catch(() => null);
    const history = await caseSummary(guild.id, appeal.user_id);
    const previous = (await appealsOf(guild.id, appeal.user_id)).filter((entry) => entry.id !== appeal.id);
    const up = Object.values(appeal.votes).filter((vote) => vote === "up").length;
    const down = Object.values(appeal.votes).filter((vote) => vote === "down").length;
    const pending = appeal.status === "pending";
    const status = appeal.status === "accepted"
        ? `${e("success")} ${t("Aprovado por {user} {at}", { user: `<@${appeal.reviewer_id}>`, at: timestamp(appeal.decided_at, "R") })}`
        : appeal.status === "denied"
            ? `${e("error")} ${t("Recusado por {user} {at}", { user: `<@${appeal.reviewer_id}>`, at: timestamp(appeal.decided_at, "R") })}${appeal.reviewer_note ? `\n-# ${appeal.reviewer_note}` : ""}`
            : `${e("hourglass")} ${t("À espera de decisão")}`;

    const rows: Row[] = pending ? [
        row(
            new ButtonBuilder().setCustomId(`appeal/accept/${appeal.id}`).setLabel(t("Aprovar e desbanir")).setEmoji(ei("success")).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`appeal/deny/${appeal.id}`).setLabel(t("Recusar")).setEmoji(ei("error")).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`appeal/ask/${appeal.id}`).setLabel(t("Fazer uma pergunta")).setEmoji(ei("question")).setStyle(ButtonStyle.Secondary),
        ),
        row(
            new ButtonBuilder().setCustomId(`appeal/vote/${appeal.id}/up`).setLabel(String(up)).setEmoji("👍").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`appeal/vote/${appeal.id}/down`).setLabel(String(down)).setEmoji("👎").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`appeal/history/${appeal.id}`).setLabel(t("Histórico completo")).setEmoji(ei("hammer")).setStyle(ButtonStyle.Secondary),
        ),
    ] : [];

    return buildContainer({
        color: appeal.status === "accepted" ? COLORS.success : appeal.status === "denied" ? COLORS.danger : COLORS.info,
        title: `${e("receipt")} ${t("Pedido de revisão — {user}", { user: appeal.user_tag })}`,
        thumbnailUrl: user?.displayAvatarURL({ size: 128 }) ?? null,
        fields: [
            {
                name: t("Membro"),
                value: [
                    `<@${appeal.user_id}> · \`${appeal.user_id}\``,
                    user ? t("Conta criada {at}", { at: timestamp(user.createdTimestamp, "R") }) : null,
                    previous.length ? t("{count} pedido(s) anterior(es): {list}", { count: previous.length, list: previous.slice(0, 5).map((entry) => (entry.status === "accepted" ? "✅" : entry.status === "denied" ? "❌" : "⏳")).join(" ") }) : null,
                ].filter(Boolean).join("\n"),
            },
            { name: t("Banimento"), value: `${appeal.ban_reason ?? t("*Sem motivo registado*")}${banCase ? `\n-# ${t("Caso #{n}", { n: banCase })}` : ""}` },
            { name: t("Histórico de moderação"), value: history.text },
            ...appeal.answers.map((entry) => ({ name: entry.question, value: entry.answer.slice(0, 1000) })),
            { name: t("Votos da equipa"), value: t("👍 {up} · 👎 {down}", { up, down }) },
            { name: t("Estado"), value: status },
        ],
        footerText: t("Pedido {id} · {at}", { id: appeal.id, at: new Date(appeal.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) }),
        rows,
    });
}

async function refreshCard(client: Client, appeal: BanAppeal): Promise<void> {
    if (!appeal.channel_id || !appeal.message_id) return;
    const guild = client.guilds.cache.get(appeal.guild_id);
    const channel = guild?.channels.cache.get(appeal.channel_id);
    if (!guild || !channel?.isTextBased()) return;
    const message = await (channel as TextChannel).messages.fetch(appeal.message_id).catch(() => null);
    if (!message) return;
    const card = await buildReviewCard(guild, appeal);
    // Mantém a menção do cargo (1.º container) se existir.
    const components = message.components.length > 1 ? [message.components[0]!, card] : [card];
    await message.edit({ components: components as never, allowedMentions: { parse: [] } }).catch(() => null);
}

async function postInThread(client: Client, appeal: BanAppeal, text: string): Promise<void> {
    if (!appeal.message_id) return;
    // A thread nasce da mensagem do cartão, por isso tem o mesmo id.
    const thread = await client.channels.fetch(appeal.message_id).catch(() => null);
    if (thread?.isThread()) await thread.send({ components: [buildContainer({ color: COLORS.neutral, description: text })], flags: CV2_FLAG, allowedMentions: { parse: [] } }).catch(() => null);
}

async function staffOnly(interaction: ButtonInteraction<"cached"> | ModalSubmitInteraction<"cached">): Promise<boolean> {
    if (await hasModAccess(interaction.member as GuildMember, PermissionFlagsBits.BanMembers)) return true;
    await answer(interaction, errorContainer(t("Só a equipa com permissão de banir decide estes pedidos.")));
    return false;
}

// ─── Ações da equipa ─────────────────────────────────────────────────────────
// Todas adiam a resposta antes de ir à BD/ao Discord (o limite para responder é de 3 s).

export async function voteAppeal(interaction: ButtonInteraction<"cached">, id: string, direction: "up" | "down"): Promise<void> {
    if (!(await staffOnly(interaction))) return;
    await interaction.deferUpdate();
    const appeal = await getAppeal(id);
    if (!appeal || appeal.status !== "pending") {
        return void interaction.followUp({ components: [errorContainer(t("Este pedido já foi decidido."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
    }
    const votes = { ...appeal.votes };
    if (votes[interaction.user.id] === direction) delete votes[interaction.user.id];
    else votes[interaction.user.id] = direction;
    await setAppealVotes(id, votes);
    const card = await buildReviewCard(interaction.guild, { ...appeal, votes });
    await interaction.editReply({ components: [...(interaction.message.components.length > 1 ? [interaction.message.components[0]!] : []), card] as never, allowedMentions: { parse: [] } });
}

export async function showHistory(interaction: ButtonInteraction<"cached">, id: string): Promise<void> {
    if (!(await staffOnly(interaction))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const appeal = await getAppeal(id);
    if (!appeal) return answer(interaction, errorContainer(t("Este pedido já não existe.")));
    const cases = await casesOf(appeal.guild_id, appeal.user_id, 25);
    await answer(interaction, buildContainer({ color: COLORS.info, title: `${e("hammer")} ${t("Histórico de {user}", { user: appeal.user_tag })}`, description: cases.length ? cases.map(caseLine).join("\n") : t("Sem casos registados.") }));
}

export async function openDenyModal(interaction: ButtonInteraction<"cached">, id: string): Promise<void> {
    if (!(await staffOnly(interaction))) return;
    await interaction.showModal(new ModalBuilder().setCustomId(`appeal/denysubmit/${id}`).setTitle(t("Recusar o pedido")).addLabelComponents(
        new LabelBuilder().setLabel(t("Motivo (vai para o membro)")).setTextInputComponent(new TextInputBuilder().setCustomId("note").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800)),
    ));
}

export async function denyAppeal(interaction: ModalSubmitInteraction<"cached">, id: string): Promise<void> {
    if (!(await staffOnly(interaction))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const note = interaction.fields.getTextInputValue("note").trim() || null;
    if (!(await decideAppeal(id, "denied", interaction.user.id, note))) return answer(interaction, errorContainer(t("Este pedido já foi decidido.")));
    const appeal = (await getAppeal(id))!;
    const settings = await getAppealSettings(appeal.guild_id);
    const user = await interaction.client.users.fetch(appeal.user_id).catch(() => null);
    const retry = settings.cooldown_days > 0 ? t("Podes voltar a pedir daqui a {days} dias.", { days: settings.cooldown_days }) : null;
    await user?.send({
        components: [buildContainer({
            color: COLORS.danger,
            title: `${e("error")} ${t("Pedido de revisão recusado")}`,
            description: [t("A equipa de **{server}** analisou o teu pedido e decidiu manter o ban.", { server: interaction.guild.name }), note ? t("**Motivo:** {note}", { note }) : null, retry].filter(Boolean).join("\n"),
        })],
        flags: CV2_FLAG,
    }).catch(() => null);
    appendAuditLog({ guildId: appeal.guild_id, actorId: interaction.user.id, action: "appeal.deny", details: { appeal: id, userId: appeal.user_id } });
    await postInThread(interaction.client, appeal, t("❌ Recusado por {user}.", { user: `<@${interaction.user.id}>` }));
    await refreshCard(interaction.client, appeal);
    await answer(interaction, successContainer(t("Pedido recusado e membro avisado.")));
}

async function createReturnInvite(guild: Guild, settings: AppealSettings): Promise<string | null> {
    const candidates = [
        settings.invite_channel ? guild.channels.cache.get(settings.invite_channel) : null,
        guild.systemChannel,
        ...guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText).values(),
    ];
    for (const channel of candidates) {
        if (!channel || channel.type !== ChannelType.GuildText) continue;
        const invite = await channel.createInvite({ maxUses: 1, maxAge: 86_400, unique: true, reason: t("Ban levantado (pedido de revisão)") }).catch(() => null);
        if (invite) return invite.url;
    }
    return null;
}

export async function acceptAppeal(interaction: ButtonInteraction<"cached">, id: string): Promise<void> {
    if (!(await staffOnly(interaction))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const appeal = await getAppeal(id);
    if (!appeal || appeal.status !== "pending") return answer(interaction, errorContainer(t("Este pedido já foi decidido.")));
    const guild = interaction.guild;
    const unbanned = await guild.members.unban(appeal.user_id, t("Pedido de revisão aprovado por {user}", { user: interaction.user.username })).then(() => true).catch(() => false);
    const stillBanned = await guild.bans.fetch(appeal.user_id).catch(() => null);
    if (!unbanned && stillBanned) return void interaction.editReply({ components: [errorContainer(t("Não consegui desbanir (permissões do bot?). O pedido continua pendente."))], flags: CV2_FLAG });
    if (!(await decideAppeal(id, "accepted", interaction.user.id, null))) return void interaction.editReply({ components: [errorContainer(t("Este pedido já foi decidido."))], flags: CV2_FLAG });

    const entry = await createCase(guild.id, { user_id: appeal.user_id, user_tag: appeal.user_tag, moderator_id: interaction.user.id, action: "unban", reason: t("Pedido de revisão aprovado"), duration_seconds: null });
    void modLog(guild, entry);
    const settings = await getAppealSettings(guild.id);
    const invite = settings.invite_on_accept ? await createReturnInvite(guild, settings) : null;
    const user = await interaction.client.users.fetch(appeal.user_id).catch(() => null);
    const dmSent = await user?.send({
        components: [buildContainer({
            color: COLORS.success,
            title: `${e("success")} ${t("Ban levantado!")}`,
            description: [t("A equipa de **{server}** aprovou o teu pedido. Já podes voltar.", { server: guild.name }), invite ? t("Convite (uso único, 24 h): {url}", { url: invite }) : null].filter(Boolean).join("\n"),
        })],
        flags: CV2_FLAG,
    }).then(() => true).catch(() => false);
    appendAuditLog({ guildId: guild.id, actorId: interaction.user.id, action: "appeal.accept", details: { appeal: id, userId: appeal.user_id } });
    // Já recebeu o convite de volta: sai do servidor de apelos (se a DM falhou, fica lá para a equipa o avisar).
    if (dmSent) await leaveAppealGuild(interaction.client, appeal.user_id);
    const updated = (await getAppeal(id))!;
    await postInThread(interaction.client, updated, t("✅ Aprovado por {user}.", { user: `<@${interaction.user.id}>` }));
    await refreshCard(interaction.client, updated);
    await interaction.editReply({ components: [successContainer([t("{user} foi desbanido (caso #{n}).", { user: `\`${appeal.user_tag}\``, n: entry.case_number }), dmSent ? t("Recebeu a notícia por DM{invite}.", { invite: invite ? t(" com um convite") : "" }) : t("Não consegui enviar-lhe DM — avisa-o de outra forma.")].join("\n"))], flags: CV2_FLAG });
}

export async function openAskModal(interaction: ButtonInteraction<"cached">, id: string): Promise<void> {
    if (!(await staffOnly(interaction))) return;
    await interaction.showModal(new ModalBuilder().setCustomId(`appeal/asksubmit/${id}`).setTitle(t("Pergunta ao membro")).addLabelComponents(
        new LabelBuilder().setLabel(t("Pergunta")).setTextInputComponent(new TextInputBuilder().setCustomId("question").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
    ));
}

export async function sendQuestion(interaction: ModalSubmitInteraction<"cached">, id: string): Promise<void> {
    if (!(await staffOnly(interaction))) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const appeal = await getAppeal(id);
    if (!appeal || appeal.status !== "pending") return answer(interaction, errorContainer(t("Este pedido já foi decidido.")));
    const question = interaction.fields.getTextInputValue("question").trim();
    const user = await interaction.client.users.fetch(appeal.user_id).catch(() => null);
    const sent = await user?.send({
        components: [buildContainer({
            color: COLORS.info,
            title: `${e("question")} ${t("Pergunta da equipa de {server}", { server: interaction.guild.name })}`,
            description: question,
            rows: [row(new ButtonBuilder().setCustomId(`appeal/reply/${appeal.id}`).setLabel(t("Responder")).setEmoji(ei("message")).setStyle(ButtonStyle.Primary))],
        })],
        flags: CV2_FLAG,
    }).then(() => true).catch(() => false);
    await postInThread(interaction.client, appeal, t("❔ {user} perguntou: {question}{note}", { user: `<@${interaction.user.id}>`, question, note: sent ? "" : t(" (a DM falhou)") }));
    await answer(interaction, sent ? successContainer(t("Pergunta enviada. A resposta aparece no cartão e na thread.")) : errorContainer(t("Não consegui enviar a DM ao membro.")));
}

/** O membro (em DM) responde a uma pergunta da equipa. */
export async function openReplyModal(interaction: ButtonInteraction, id: string): Promise<void> {
    const appeal = await getAppeal(id);
    if (!appeal || appeal.user_id !== interaction.user.id) return void interaction.reply({ components: [errorContainer(t("Este pedido não é teu."))], flags: CV2_FLAG });
    if (appeal.status !== "pending") return void interaction.reply({ components: [errorContainer(t("Este pedido já foi decidido."))], flags: CV2_FLAG });
    await interaction.showModal(new ModalBuilder().setCustomId(`appeal/replysubmit/${id}`).setTitle(t("Responder à equipa")).addLabelComponents(
        new LabelBuilder().setLabel(t("A tua resposta")).setTextInputComponent(new TextInputBuilder().setCustomId("answer").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
    ));
}

export async function submitReply(interaction: ModalSubmitInteraction, id: string, client: Client): Promise<void> {
    await interaction.deferReply();
    const appeal = await getAppeal(id);
    if (!appeal || appeal.user_id !== interaction.user.id || appeal.status !== "pending") return answer(interaction, errorContainer(t("Este pedido já foi decidido.")));
    const text = interaction.fields.getTextInputValue("answer").trim();
    await appendAppealAnswer(id, { question: t("Resposta extra ({at})", { at: new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" }) }), answer: text });
    const updated = (await getAppeal(id))!;
    await postInThread(client, updated, t("💬 Resposta de {user}: {answer}", { user: `<@${appeal.user_id}>`, answer: text }));
    await refreshCard(client, updated);
    await answer(interaction, successContainer(t("Resposta enviada à equipa.")));
}

/** Estado dos pedidos de alguém (para o /apelo). */
export function appealStatusView(guild: Guild, appeals: BanAppeal[], eligibility: Eligibility): ContainerPlusBuilder {
    const last = appeals[0];
    const lines = last ? [
        t("Último pedido: {at}", { at: timestamp(last.created_at, "R") }),
        last.status === "pending" ? `${e("hourglass")} ${t("À espera de resposta da equipa.")}` : last.status === "accepted" ? `${e("success")} ${t("Aprovado")}` : `${e("error")} ${t("Recusado")}${last.reviewer_note ? ` — ${last.reviewer_note}` : ""}`,
    ] : [t("Ainda não fizeste nenhum pedido.")];
    return buildContainer({
        color: COLORS.info,
        title: `${e("receipt")} ${t("Revisão de ban — {server}", { server: guild.name })}`,
        description: [...lines, "", eligibility.ok ? t("Podes fazer um pedido agora.") : eligibility.reason].join("\n"),
        rows: eligibility.ok ? [appealButtonRow(guild.id)] : [],
    });
}
