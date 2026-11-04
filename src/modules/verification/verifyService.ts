import {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type ButtonInteraction,
    type Client,
    type Guild,
    type GuildMember,
    type TextChannel,
} from "discord.js";
import { createContainer, createMediaGallery, Separator, type ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS, getEmbedColor } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG, hasPowerPermissions } from "../../lib/discord.js";
import { e, emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { addPendingVerification, listPendingVerifications, removePendingVerification } from "../../repositories/verifyRepository.js";
import { isAllowedGuild } from "../../config.js";
import { newChallenge, pick, shapesOf, symbolOf, type Challenge } from "./captcha.js";
import { renderCaptcha } from "./captchaImage.js";
import { getVerifySettings, saveVerifySettings, type VerifySettings } from "./verifySettings.js";

const LOCK_MS = 5 * 60_000;
const IMAGE_NAME = "verificacao.png";
// Desafios e erros em memória: um desafio dura 5 minutos e um reinício só obriga a carregar
// outra vez em "Verificar".
const challenges = new Map<string, Challenge>();
const failures = new Map<string, { count: number; lockedUntil: number }>();
const key = (guildId: string, userId: string) => `${guildId}:${userId}`;

// ─── Painel ──────────────────────────────────────────────────────────────────

export function buildVerifyPanel(settings: VerifySettings, color: number): ContainerPlusBuilder {
    return buildContainer({
        color,
        title: settings.panel_title ?? `${e("shield")} ${t("Verificação")}`,
        description: settings.panel_description
            ?? t("Para entrares no servidor, confirma que és uma pessoa: carrega em **Verificar** e toca nas figuras pela ordem em que aparecem na imagem. Leva 10 segundos."),
        rows: [row(new ButtonBuilder().setCustomId(buildCustomId("verify", "start")).setLabel(t("Verificar")).setEmoji(emoji.success).setStyle(ButtonStyle.Success))],
    });
}

/** Publica o painel no canal configurado, ou atualiza o que já lá está. */
export async function publishVerifyPanel(guild: Guild): Promise<{ ok: true; channelId: string } | { ok: false; reason: string }> {
    const settings = await getVerifySettings(guild.id);
    if (!settings.channel) return { ok: false, reason: t("Escolhe primeiro o canal do painel.") };
    if (!settings.verified_role) return { ok: false, reason: t("Escolhe primeiro o cargo de verificado.") };
    const channel = guild.channels.cache.get(settings.channel);
    if (!channel?.isTextBased()) return { ok: false, reason: t("Não encontrei esse canal.") };
    const config = await ensureGuildConfig(guild.id);
    const payload = { components: [buildVerifyPanel(settings, getEmbedColor(config))], flags: CV2_FLAG } as const;
    const existing = settings.panel_message_id ? await (channel as TextChannel).messages.fetch(settings.panel_message_id).catch(() => null) : null;
    if (existing) {
        await existing.edit({ components: payload.components });
        return { ok: true, channelId: channel.id };
    }
    const sent = await (channel as TextChannel).send(payload).catch((error: unknown) => {
        logger.warn("Verificação: não consegui publicar o painel:", error);
        return null;
    });
    if (!sent) return { ok: false, reason: t("O bot não tem permissão para escrever nesse canal.") };
    await saveVerifySettings(guild.id, { panel_message_id: sent.id });
    return { ok: true, channelId: channel.id };
}

// ─── Desafio ─────────────────────────────────────────────────────────────────

function challengeView(challenge: Challenge, note: string | null, attachment: AttachmentBuilder | null): ContainerPlusBuilder {
    const dots = challenge.sequence.map((_, i) => (i < challenge.progress ? "●" : "○")).join(" ");
    const buttons = challenge.buttons.map((k) => {
        const symbol = symbolOf(k);
        return new ButtonBuilder().setCustomId(buildCustomId("verify", "pick", k)).setEmoji(symbol?.emoji ?? "❔").setStyle(ButtonStyle.Secondary);
    });
    return createContainer(
        COLORS.primary,
        `## ${e("shield")} ${t("Toca nas figuras pela ordem")}\n${t("Da esquerda para a direita, como na imagem.")}`,
        ...(attachment ? [createMediaGallery(attachment)] : [createMediaGallery(`attachment://${IMAGE_NAME}`)]),
        `${t("Progresso")}: ${dots}${note ? `\n${note}` : ""}`,
        Separator.Default,
        row(...buttons.slice(0, 3)),
        row(...buttons.slice(3)),
        row(new ButtonBuilder().setCustomId(buildCustomId("verify", "new")).setLabel(t("Outra imagem")).setEmoji(emoji.reroll).setStyle(ButtonStyle.Secondary)),
    );
}

function freshChallenge(guildId: string, userId: string, settings: VerifySettings): { challenge: Challenge; file: AttachmentBuilder } {
    const challenge = newChallenge(settings.difficulty === "normal" ? 4 : 3);
    challenges.set(key(guildId, userId), challenge);
    const file = new AttachmentBuilder(renderCaptcha(shapesOf(challenge)), { name: IMAGE_NAME, description: t("Desafio de verificação") });
    return { challenge, file };
}

function lockedMessage(until: number): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.danger,
        title: `${e("timeout")} ${t("Demasiadas tentativas")}`,
        description: t("Espera um pouco e tenta outra vez <t:{at}:R>.", { at: Math.ceil(until / 1000) }),
    });
}

/** Já tem o cargo? Ou ainda falta configurar? Devolve a mensagem a mostrar, ou null para seguir. */
function blocker(member: GuildMember, settings: VerifySettings): ContainerPlusBuilder | null {
    if (!settings.enabled || !settings.verified_role) {
        return buildContainer({ color: COLORS.neutral, description: t("A verificação não está ativa neste servidor.") });
    }
    if (member.roles.cache.has(settings.verified_role)) {
        return buildContainer({ color: COLORS.success, description: `${emoji.success} ${t("Já estás verificado(a).")}` });
    }
    const lock = failures.get(key(member.guild.id, member.id));
    if (lock && lock.lockedUntil > Date.now()) return lockedMessage(lock.lockedUntil);
    return null;
}

export async function startVerification(interaction: ButtonInteraction<"cached">): Promise<void> {
    const settings = await getVerifySettings(interaction.guildId);
    const stop = blocker(interaction.member, settings);
    if (stop) return void interaction.reply({ components: [stop], flags: CV2_FLAG | MessageFlags.Ephemeral });
    const { challenge, file } = freshChallenge(interaction.guildId, interaction.user.id, settings);
    await interaction.reply({ components: [challengeView(challenge, null, file)], files: [file], flags: CV2_FLAG | MessageFlags.Ephemeral });
}

export async function newImage(interaction: ButtonInteraction<"cached">): Promise<void> {
    const settings = await getVerifySettings(interaction.guildId);
    const stop = blocker(interaction.member, settings);
    if (stop) return void interaction.update({ components: [stop], attachments: [] });
    const { challenge, file } = freshChallenge(interaction.guildId, interaction.user.id, settings);
    await interaction.update({ components: [challengeView(challenge, null, file)], files: [file], attachments: [] });
}

export async function pickSymbol(interaction: ButtonInteraction<"cached">, symbolKey: string): Promise<void> {
    const settings = await getVerifySettings(interaction.guildId);
    const stop = blocker(interaction.member, settings);
    if (stop) return void interaction.update({ components: [stop], attachments: [] });
    const k = key(interaction.guildId, interaction.user.id);
    const challenge = challenges.get(k);
    const result = challenge ? pick(challenge, symbolKey) : "expired";

    if (result === "expired" || !challenge) {
        const fresh = freshChallenge(interaction.guildId, interaction.user.id, settings);
        return void interaction.update({ components: [challengeView(fresh.challenge, `${e("hourglass")} ${t("O desafio expirou — aqui tens outro.")}`, fresh.file)], files: [fresh.file], attachments: [] });
    }
    if (result === "next") {
        return void interaction.update({ components: [challengeView(challenge, null, null)] });
    }
    if (result === "wrong") {
        const fail = failures.get(k) ?? { count: 0, lockedUntil: 0 };
        fail.count++;
        if (fail.count >= settings.max_attempts) {
            fail.count = 0;
            fail.lockedUntil = Date.now() + LOCK_MS;
            failures.set(k, fail);
            challenges.delete(k);
            void verifyLog(interaction.guild, settings, COLORS.danger, t("{user} falhou a verificação {count, plural, one {# vez} other {# vezes}} seguidas.", { user: `<@${interaction.user.id}>`, count: settings.max_attempts }));
            return void interaction.update({ components: [lockedMessage(fail.lockedUntil)], attachments: [] });
        }
        failures.set(k, fail);
        const fresh = freshChallenge(interaction.guildId, interaction.user.id, settings);
        const left = settings.max_attempts - fail.count;
        return void interaction.update({
            components: [challengeView(fresh.challenge, `${emoji.error} ${t("Não é essa. Nova imagem — {count, plural, one {resta # tentativa} other {restam # tentativas}}.", { count: left })}`, fresh.file)],
            files: [fresh.file],
            attachments: [],
        });
    }

    // Acertou a sequência toda.
    challenges.delete(k);
    failures.delete(k);
    const granted = await completeVerification(interaction.member, settings);
    await interaction.update({ components: [resultView(granted)], attachments: [] });
}

function resultView(granted: boolean): ContainerPlusBuilder {
    return buildContainer(granted
        ? { color: COLORS.success, title: `${emoji.success} ${t("Verificado!")}`, description: t("Bem-vindo(a) ao servidor. Já tens acesso aos canais.") }
        : { color: COLORS.danger, title: `${emoji.error} ${t("Quase")}`, description: t("Acertaste, mas o bot não conseguiu dar-te o cargo. Avisa a equipa do servidor.") });
}

export async function completeVerification(member: GuildMember, settings: VerifySettings): Promise<boolean> {
    if (!settings.verified_role) return false;
    const verifiedRole = member.guild.roles.cache.get(settings.verified_role);
    if (!verifiedRole || hasPowerPermissions(verifiedRole)) {
        logger.warn("Verificação: o cargo de verificado não existe ou tem permissões de moderação — não foi dado.");
        return false;
    }
    const ok = await member.roles.add(settings.verified_role, t("Verificação concluída")).then(() => true).catch((error: unknown) => {
        logger.warn("Verificação: não consegui dar o cargo:", error);
        return false;
    });
    if (settings.unverified_role && member.roles.cache.has(settings.unverified_role)) {
        await member.roles.remove(settings.unverified_role, t("Verificação concluída")).catch(() => null);
    }
    await removePendingVerification(member.guild.id, member.id).catch(() => null);
    void verifyLog(member.guild, settings, ok ? COLORS.success : COLORS.danger, ok
        ? t("{user} verificou-se.", { user: `<@${member.id}>` })
        : t("{user} acertou o captcha, mas o cargo de verificado não foi dado (permissões do bot).", { user: `<@${member.id}>` }));
    return ok;
}

// ─── Entradas, prazo e registo ───────────────────────────────────────────────

async function verifyLog(guild: Guild, settings: VerifySettings, color: number, text: string): Promise<void> {
    if (!settings.log_channel) return;
    const channel = guild.channels.cache.get(settings.log_channel);
    if (!channel?.isTextBased()) return;
    await (channel as TextChannel).send({
        components: [buildContainer({ color, title: `${e("shield")} ${t("Verificação")}`, description: text })],
        flags: CV2_FLAG,
        allowedMentions: { parse: [] },
    }).catch(() => null);
}

export function accountAgeDays(createdAt: number, now = Date.now()): number {
    return (now - createdAt) / 86_400_000;
}

export async function handleMemberJoin(member: GuildMember): Promise<void> {
    if (member.user.bot || !isAllowedGuild(member.guild.id)) return;
    const settings = await getVerifySettings(member.guild.id);
    if (!settings.enabled || !settings.verified_role) return;

    if (settings.min_account_age_days > 0 && accountAgeDays(member.user.createdTimestamp) < settings.min_account_age_days) {
        const age = Math.floor(accountAgeDays(member.user.createdTimestamp));
        if (settings.young_account_action === "kick" && member.kickable) {
            await member.send({ components: [buildContainer({ color: COLORS.danger, description: t("A tua conta é demasiado recente para entrares em **{server}**. Tenta outra vez mais tarde.", { server: member.guild.name }) })], flags: CV2_FLAG }).catch(() => null);
            await member.kick(t("Conta com menos de {days} dias", { days: settings.min_account_age_days })).catch(() => null);
            void verifyLog(member.guild, settings, COLORS.danger, t("{user} foi expulso: conta com {age} dias (mínimo {days}).", { user: `<@${member.id}>`, age, days: settings.min_account_age_days }));
            return;
        }
        void verifyLog(member.guild, settings, COLORS.warning, t("{user} entrou com uma conta de {age} dias (mínimo {days}).", { user: `<@${member.id}>`, age, days: settings.min_account_age_days }));
    }

    if (settings.unverified_role) await member.roles.add(settings.unverified_role, t("Ainda não verificado")).catch(() => null);
    if (settings.kick_after_minutes > 0) await addPendingVerification(member.guild.id, member.id).catch(() => null);
    if (settings.dm_on_join && settings.channel) {
        await member.send({
            components: [buildContainer({
                color: COLORS.primary,
                title: `${e("shield")} ${member.guild.name}`,
                description: settings.kick_after_minutes > 0
                    ? t("Para entrares, verifica-te em <#{channel}> nos próximos {minutes} minutos.", { channel: settings.channel, minutes: settings.kick_after_minutes })
                    : t("Para entrares, verifica-te em <#{channel}>.", { channel: settings.channel }),
            })],
            flags: CV2_FLAG,
        }).catch(() => null);
    }
}

let monitor: NodeJS.Timeout | null = null;

/** De minuto a minuto: expulsa quem passou o prazo sem se verificar. */
export function startVerifyMonitor(client: Client<true>): void {
    if (monitor) return;
    const tick = async () => {
        const now = Date.now();
        const pending = await listPendingVerifications().catch(() => []);
        for (const entry of pending) {
            const guild = client.guilds.cache.get(entry.guild_id);
            if (!guild) continue;
            const settings = await getVerifySettings(guild.id);
            if (!settings.enabled || settings.kick_after_minutes <= 0 || !settings.verified_role) {
                await removePendingVerification(entry.guild_id, entry.user_id);
                continue;
            }
            if (now - entry.joined_at < settings.kick_after_minutes * 60_000) continue;
            const member = await guild.members.fetch(entry.user_id).catch(() => null);
            await removePendingVerification(entry.guild_id, entry.user_id);
            if (!member || member.roles.cache.has(settings.verified_role) || !member.kickable) continue;
            await member.kick(t("Não se verificou em {minutes} minutos", { minutes: settings.kick_after_minutes })).catch(() => null);
            await verifyLog(guild, settings, COLORS.warning, t("{user} foi expulso por não se verificar em {minutes} minutos.", { user: `<@${member.id}>`, minutes: settings.kick_after_minutes }));
        }
    };
    monitor = setInterval(() => void tick().catch((error) => logger.warn("Verificação: falha no prazo:", error)), 60_000);
    monitor.unref?.();
}
