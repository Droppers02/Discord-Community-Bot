import type { GuildMember, Message, TextChannel } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG, hasPowerPermissions } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { addMemberXp, addVoiceTime, getMemberLevel, setMemberLevelValue, setMemberXp } from "../../repositories/levelRepository.js";
import { isAllowedGuild } from "../../config.js";
import { recordVoiceActivity, recordXpActivity } from "../../repositories/activityRepository.js";
import { levelFromXp, rewardChanges, rollXp, totalXpFor } from "./levelMath.js";
import { getLevelsSettings, type LevelsSettings } from "./levelSettings.js";

// Cooldown em memória (guild:user → última mensagem que contou). Um reinício só faz com que a
// próxima mensagem de cada um conte logo — não vale uma ida à base de dados por mensagem.
const lastXpAt = new Map<string, number>();
const COOLDOWN_SWEEP_MS = 30 * 60_000;
setInterval(() => {
    const cutoff = Date.now() - 3_600_000;
    for (const [key, at] of lastXpAt) if (at < cutoff) lastXpAt.delete(key);
}, COOLDOWN_SWEEP_MS).unref?.();

export function isIgnored(settings: LevelsSettings, channelId: string, parentId: string | null, roleIds: Iterable<string>): boolean {
    if (settings.ignored_channels.includes(channelId) || (parentId && settings.ignored_channels.includes(parentId))) return true;
    const ignored = new Set(settings.ignored_roles);
    for (const id of roleIds) if (ignored.has(id)) return true;
    return false;
}

export function levelUpText(settings: LevelsSettings, member: { id: string; displayName: string }, level: number): string {
    const template = settings.announce_message ?? t("🎉 {user} subiu para o **nível {level}**!");
    return template.replaceAll("{user}", `<@${member.id}>`).replaceAll("{name}", member.displayName).replaceAll("{level}", String(level));
}

/** Aplica os cargos de recompensa do nível; falhas de permissão ficam no log, não rebentam. */
export async function syncRewardRoles(member: GuildMember, settings: LevelsSettings, level: number): Promise<void> {
    if (settings.rewards.length === 0) return;
    const { add, remove } = rewardChanges(settings.rewards, level, settings.stack_rewards, member.roles.cache.keys());
    const usable = (id: string) => {
        const role = member.guild.roles.cache.get(id);
        return Boolean(role && role.editable && !hasPowerPermissions(role));
    };
    const toAdd = add.filter(usable);
    const toRemove = remove.filter(usable);
    if (toAdd.length) await member.roles.add(toAdd, t("Níveis: recompensa do nível {level}", { level })).catch((err) => logger.warn("Níveis: não consegui dar o cargo:", err));
    if (toRemove.length) await member.roles.remove(toRemove, t("Níveis: recompensa substituída")).catch((err) => logger.warn("Níveis: não consegui tirar o cargo:", err));
}

async function announce(source: { channel: { isTextBased(): boolean } | null; guild: Message<true>["guild"] }, member: GuildMember, settings: LevelsSettings, level: number): Promise<void> {
    if (settings.announce_mode === "off") return;
    const container = buildContainer({
        color: COLORS.success,
        title: `${e("trophy")} ${t("Nível {level}", { level })}`,
        description: levelUpText(settings, member, level),
    });
    if (settings.announce_mode === "dm") {
        await member.send({ components: [container], flags: CV2_FLAG }).catch(() => null);
        return;
    }
    const target = settings.announce_mode === "channel" && settings.announce_channel
        ? source.guild.channels.cache.get(settings.announce_channel)
        : source.channel;
    if (!target?.isTextBased()) return;
    await (target as TextChannel).send({ components: [container], flags: CV2_FLAG, allowedMentions: { users: [member.id] } }).catch(() => null);
}

/** Uma mensagem num servidor: dá XP se contar, e trata da subida de nível. */
export async function handleLevelMessage(message: Message<true>): Promise<void> {
    if (message.author.bot || message.webhookId || message.system) return;
    if (!isAllowedGuild(message.guildId)) return;
    const settings = await getLevelsSettings(message.guildId);
    if (!settings.enabled) return;
    const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;
    const parentId = message.channel.isThread() ? message.channel.parentId : null;
    if (isIgnored(settings, message.channelId, parentId, member.roles.cache.keys())) return;

    const key = `${message.guildId}:${member.id}`;
    const now = Date.now();
    if (now - (lastXpAt.get(key) ?? 0) < settings.cooldown_seconds * 1000) return;
    lastXpAt.set(key, now);

    const gained = rollXp(settings, member.roles.cache.keys());
    recordXpActivity(message.guildId, member.id, gained);
    const { xp, storedLevel } = await addMemberXp(message.guildId, member.id, gained, true, now);
    const level = levelFromXp(xp);
    if (level === storedLevel) return;
    await setMemberLevelValue(message.guildId, member.id, level);
    if (level > storedLevel) {
        await syncRewardRoles(member, settings, level);
        await announce(message, member, settings, level);
    }
}

/** XP de voz (ver voiceXp.ts): trata da subida de nível como as mensagens. */
export async function handleVoiceMinute(member: GuildMember, channel: { isTextBased(): boolean }, settings: LevelsSettings, seconds: number, xp: number): Promise<void> {
    recordVoiceActivity(member.guild.id, member.id, seconds);
    if (xp > 0) recordXpActivity(member.guild.id, member.id, xp);
    const { xp: total, storedLevel } = await addVoiceTime(member.guild.id, member.id, seconds, xp);
    const level = levelFromXp(total);
    if (level === storedLevel) return;
    await setMemberLevelValue(member.guild.id, member.id, level);
    if (level > storedLevel) {
        await syncRewardRoles(member, settings, level);
        await announce({ channel, guild: member.guild }, member, settings, level);
    }
}

/** Ajuste manual (/xp): devolve o nível antes e depois e acerta os cargos. */
export async function adjustMemberXp(member: GuildMember, mode: "add" | "remove" | "set" | "level", amount: number): Promise<{ before: number; after: number; xp: number }> {
    const settings = await getLevelsSettings(member.guild.id);
    const current = await getMemberLevel(member.guild.id, member.id);
    const before = current ? levelFromXp(current.xp) : 0;
    const startXp = current?.xp ?? 0;
    const xp = Math.max(0, mode === "add" ? startXp + amount : mode === "remove" ? startXp - amount : mode === "set" ? amount : totalXpFor(Math.max(0, amount)));
    const after = levelFromXp(xp);
    await setMemberXp(member.guild.id, member.id, xp, after);
    await syncRewardRoles(member, settings, after);
    return { before, after, xp };
}
