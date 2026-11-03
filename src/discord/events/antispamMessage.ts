import { createEvent } from "#base";
import { PermissionFlagsBits, type GuildMember, type Message, type TextChannel } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG, safeFireAndForget } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { logger } from "../../lib/logger.js";
import { getAntiSpamSettings } from "../../modules/antispam/antispamSettings.js";
import {
    analyzeMessage,
    checkRaidOnMessage,
    normalizeText,
    recentChannelsOf,
    trackFlood,
} from "../../modules/antispam/antiSpamEngine.js";
import { applyPunishment, purgeRecentMessages } from "../../modules/antispam/punishment.js";
import { FLOOD, MEDIA_EXTENSIONS, RAID } from "../../modules/antispam/antiSpamConfig.js";
import { registerOffense } from "../../repositories/antispamRepository.js";
import { appendAuditLog } from "../../services/auditService.js";
import type { AntiSpamAction } from "../../types.js";
import { t, tk } from "../../lib/i18n.js";

const WARNING_LIFETIME_MS = 8_000;

const ACTION_LABELS: Record<AntiSpamAction, string> = {
    delete: tk("Apagar mensagens"),
    timeout: tk("Timeout"),
    quarantine: tk("Cargo de castigo"),
    kick: tk("Expulsão"),
    ban: tk("Banimento"),
};

/** O que o membro lê no canal. Kick/ban não aparecem aqui — já não está cá para ler. */
const ACTION_NOTICE: Record<AntiSpamAction, string> = {
    delete: tk("as tuas mensagens foram removidas por spam."),
    timeout: tk("as tuas mensagens foram removidas por spam e ficaste em timeout."),
    quarantine: tk("as tuas mensagens foram removidas por spam e ficaste de castigo. Se achas que foi engano, abre um ticket para recorrer."),
    kick: tk("as tuas mensagens foram removidas por spam."),
    ban: tk("as tuas mensagens foram removidas por spam."),
};

function isExempt(member: GuildMember, exemptRoles: string[]): boolean {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
    return exemptRoles.some((roleId) => member.roles.cache.has(roleId));
}

function countMediaAttachments(message: Message): number {
    let count = 0;
    for (const attachment of message.attachments.values()) {
        const type = attachment.contentType ?? "";
        if (type.startsWith("image/") || type.startsWith("video/")) { count += 1; continue; }
        const name = attachment.name?.toLowerCase() ?? "";
        const dot = name.lastIndexOf(".");
        if (dot >= 0 && MEDIA_EXTENSIONS.has(name.slice(dot))) count += 1;
    }
    return count;
}

createEvent({
    name: "Anti-spam message scanner",
    event: "messageCreate",
    async run(message) {
        if (!message.inGuild() || message.author.bot || !message.member) return;

        const settings = await getAntiSpamSettings(message.guildId);
        if (!settings.enabled) return;
        if (isExempt(message.member, settings.exempt_roles)) return;

        const normalizedContent = normalizeText(message.content);
        const accountAgeDays = (Date.now() - message.author.createdTimestamp) / 86_400_000;
        const mediaCount = countMediaAttachments(message);

        const flood = trackFlood(message.guildId, message.author.id, message.channelId, normalizedContent, settings);
        const raid = checkRaidOnMessage(message.guildId, message.author.id);
        const analysis = analyzeMessage({
            content: message.content,
            normalizedContent,
            mentionEveryone: message.mentions.everyone,
            uniqueMentionCount: message.mentions.users.size,
            mediaCount,
            accountAgeDays,
        }, settings);

        let score = analysis.score;
        const reasons = analysis.reasons;
        if (raid.isRaid) {
            reasons.unshift(`Raid: ${raid.reason}`);
            score = Math.max(score, RAID.scoreBoost);
        }

        const spamDetected = raid.isRaid || flood.isFlood || score >= settings.score_threshold;
        if (!spamDetected) return;

        if (flood.isFlood) {
            reasons.unshift(`Flood: ${flood.reason}`);
            score = Math.max(score, FLOOD.scoreBoost);
        }

        // Delete the offending message.
        safeFireAndForget(message.delete(), (err) => logger.warn("Anti-spam: falha ao apagar mensagem:", err));

        const offenses = await registerOffense(message.guildId, message.author.id);

        // Apaga o RESTO do que o infrator despejou (imagens, links, texto) nos canais onde
        // esteve ativo — não só a mensagem que disparou a deteção. Corre antes da punição:
        // depois de um kick/ban o membro já não está lá para as mensagens serem varridas.
        const purged = settings.purge_recent
            ? await purgeRecentMessages(
                message.guild,
                message.author.id,
                [message.channelId, ...recentChannelsOf(message.guildId, message.author.id)],
                settings.purge_minutes,
            )
            : 0;

        const punishment = await applyPunishment(message.member, settings, reasons.join(", "), offenses);
        punishment.purged = purged;
        const timeoutMs = punishment.timeoutMs;

        // Persist the incident so it shows up in /auditoria (the anti-spam dashboard).
        appendAuditLog({
            guildId: message.guildId,
            actorId: message.author.id,
            action: "antispam.action",
            details: {
                userTag: message.author.tag,
                channelId: message.channelId,
                score,
                threshold: settings.score_threshold,
                offenses,
                action: punishment.action,
                timeoutMs,
                purged,
                reasons: reasons.slice(0, 8),
            },
        });

        // Self-deleting channel warning. Um membro expulso/banido já não está cá para ler.
        if (punishment.action !== "kick" && punishment.action !== "ban") {
            const channel = message.channel as TextChannel;
            const warning = await channel.send({
                components: [buildContainer({
                    color: COLORS.danger,
                    title: `${emoji.shield} Anti-spam`,
                    description: `<@${message.author.id}>, ${t(ACTION_NOTICE[punishment.action])}`,
                })],
                flags: CV2_FLAG,
            }).catch(() => null);
            if (warning) setTimeout(() => safeFireAndForget(warning.delete()), WARNING_LIFETIME_MS);
        }

        // Audit log.
        if (settings.log_channel) {
            const logChannel = await message.client.channels.fetch(settings.log_channel).catch(() => null);
            if (logChannel?.isTextBased() && !logChannel.isDMBased()) {
                const attachments = message.attachments.size
                    ? [...message.attachments.values()].slice(0, 5).map((a) => a.name ?? a.url).join("\n")
                    : null;
                await (logChannel as TextChannel).send({
                    components: [buildContainer({
                        color: COLORS.warning,
                        title: `${emoji.shield} ${t("Spam removido")}`,
                        description: t("Ação aplicada a {user} (`{tag}`)", { user: `<@${message.author.id}>`, tag: message.author.tag }),
                        fields: [
                            { name: t("Canal"), value: `<#${message.channelId}>` },
                            { name: t("Pontuação"), value: t("**{score}**/100 (limiar {threshold})", { score, threshold: settings.score_threshold }) },
                            { name: t("Conta criada"), value: `<t:${Math.floor(message.author.createdTimestamp / 1000)}:R>` },
                            { name: t("Motivos"), value: reasons.map((r) => `• ${r}`).join("\n").slice(0, 1024) || "—" },
                            { name: t("Ação"), value: `${t(ACTION_LABELS[punishment.action])} — ${punishment.error ? `⚠️ ${t("falhou: {error}", { error: punishment.error })}` : punishment.detail}` },
                            { name: t("Reincidência"), value: `#${offenses}` },
                            { name: t("Mensagens apagadas"), value: t("{total} ({extra} além da detetada)", { total: purged + 1, extra: purged }) },
                            { name: t("Mensagem"), value: (message.content.slice(0, 500) || t("*sem texto*")) },
                            ...(attachments ? [{ name: t("Anexos"), value: attachments.slice(0, 1024) }] : []),
                        ],
                        footerText: `<t:${Math.floor(Date.now() / 1000)}:f>`,
                    })],
                    flags: CV2_FLAG,
                }).catch(() => null);
            }
        }

        logger.info(`[ANTISPAM] ${message.author.tag} score=${score} acao=${punishment.action}${punishment.detail ? ` (${punishment.detail})` : ""} apagadas=${purged + 1} motivos=[${reasons.join(", ")}]`);
    },
});
