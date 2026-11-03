import { t } from "../../lib/i18n.js";
import { GuildMember, PermissionFlagsBits, TextChannel, type Guild } from "discord.js";
import { hasStaffAccess } from "../../lib/discord.js";
import type { GuildConfig } from "../../types.js";
import { PermissionError, ValidationError } from "../../errors/index.js";

export function extractUserId(rawValue: string): string | null {
    const normalized = rawValue.trim().replace(/[<@!>]/g, "");
    if (!/^\d{16,20}$/.test(normalized)) return null;
    return normalized;
}

export async function fetchTargetMember(guild: Guild, rawValue: string): Promise<GuildMember> {
    const userId = extractUserId(rawValue);
    if (!userId) {
        throw new ValidationError(t("ID inválido. Introduz um ID de utilizador ou uma menção válida."));
    }
    return guild.members.fetch(userId);
}

export async function addTicketMember(channel: TextChannel, target: GuildMember): Promise<void> {
    await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
    });
}

export async function removeTicketMember(
    channel: TextChannel,
    ticketOwnerId: string,
    target: GuildMember,
    actingMember: GuildMember,
    config: GuildConfig,
): Promise<void> {
    if (target.id === ticketOwnerId) {
        throw new ValidationError(t("Não podes remover o dono do ticket."));
    }
    if (target.id === channel.guild.members.me?.id) {
        throw new ValidationError(t("Não podes remover o bot do ticket."));
    }

    await channel.permissionOverwrites.delete(target.id).catch(() => null);

    if (hasStaffAccess(target, config.staff_role, config.admin_role) || target.permissions.has(PermissionFlagsBits.Administrator)) {
        throw new PermissionError(t("O overwrite foi removido, mas esse membro pode continuar a ver o ticket por causa dos cargos/permissões que já tem."));
    }
    if (target.id === actingMember.id) {
        throw new PermissionError(t("O teu overwrite foi removido. Se continuares a ver o ticket é por causa dos teus cargos/permissões de staff."));
    }
}
