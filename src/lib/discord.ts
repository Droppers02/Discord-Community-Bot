import {
    GuildMember,
    MessageFlags,
    PermissionFlagsBits,
    type APIMessageTopLevelComponent,
    type JSONEncodable,
    type RepliableInteraction,
    type MessageActionRowComponentBuilder,
    type ActionRowBuilder,
} from "discord.js";

import { isOwner } from "../config.js";

export const CV2_FLAG: MessageFlags.IsComponentsV2 = MessageFlags.IsComponentsV2;

type TopLevelComponent = JSONEncodable<APIMessageTopLevelComponent> | ActionRowBuilder<MessageActionRowComponentBuilder>;

export function hasSuperAdminAccess(member: GuildMember, adminRole: string | null): boolean {
    if (isOwner(member.id)) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (adminRole && member.roles.cache.has(adminRole)) return true;
    return false;
}

export function hasStaffAccess(member: GuildMember, staffRole: string | null, adminRole: string | null): boolean {
    if (hasSuperAdminAccess(member, adminRole)) return true;
    if (staffRole && member.roles.cache.has(staffRole)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageRoles)) return true;
    return false;
}

// ─── Hierarquia (a mesma regra do próprio Discord) ───────────────────────────
// O bot tem um dos cargos mais altos do servidor, por isso nunca pode fazer por alguém o que essa
// pessoa não podia fazer à mão: só se mexe em quem (e só se dá o que) está ABAIXO do cargo mais
// alto de quem pede. O dono do servidor está acima de tudo.

/** `actor` está acima de `target` na hierarquia? */
export function outranks(actor: GuildMember, target: GuildMember): boolean {
    if (actor.id === actor.guild.ownerId) return target.id !== actor.id;
    if (target.id === target.guild.ownerId) return false;
    return actor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

/** Permissões que dão poder sobre os outros — nunca vão em cargos dados automaticamente. */
export const POWER_PERMISSIONS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.ManageGuildExpressions,
    PermissionFlagsBits.ManageEvents,
    PermissionFlagsBits.ManageThreads,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.MuteMembers,
    PermissionFlagsBits.DeafenMembers,
    PermissionFlagsBits.MoveMembers,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ViewAuditLog,
] as const;

type RoleLike = { id: string; position: number; managed: boolean; name: string; permissions: { has(permission: bigint, checkAdmin?: boolean): boolean } };

export function hasPowerPermissions(role: RoleLike): boolean {
    return POWER_PERMISSIONS.some((permission) => role.permissions.has(permission, false));
}

/**
 * Problema por `actor` querer dar/tirar `role` (ou null se pode).
 * `automatic`: o cargo vai ser dado sozinho pelo bot (loja, níveis, verificação, auto-cargos,
 * boas-vindas…) — aí cargos com permissões de moderação/administração são sempre recusados.
 */
export function roleGrantProblem(actor: GuildMember, role: RoleLike, opts: { automatic?: boolean } = {}): string | null {
    if (role.id === actor.guild.id || role.managed) return `O cargo ${role.name} não pode ser dado (é @everyone ou de uma integração).`;
    const me = actor.guild.members.me;
    if (me && me.roles.highest.position <= role.position) return `O cargo ${role.name} está acima do cargo do bot.`;
    const power = hasPowerPermissions(role);
    if (opts.automatic && power) return `O cargo ${role.name} tem permissões de moderação ou administração — não pode ser dado automaticamente.`;
    if (actor.id === actor.guild.ownerId) return null;
    if (role.position >= actor.roles.highest.position) return `Não podes usar o cargo ${role.name}: está igual ou acima do teu cargo mais alto.`;
    if (power && !actor.permissions.has(PermissionFlagsBits.Administrator)) return `O cargo ${role.name} tem permissões de moderação — só um administrador o pode dar.`;
    return null;
}

export function safeFireAndForget(task: Promise<unknown>, onError?: (error: unknown) => void): void {
    void task.catch((error) => onError?.(error));
}

function toComponents(components: TopLevelComponent | TopLevelComponent[]): TopLevelComponent[] {
    return Array.isArray(components) ? components : [components];
}

/**
 * Reply with one or more CV2 top-level components, ephemerally.
 * `options.persist` fica por compatibilidade: aqui os efémeros não fecham sozinhos.
 */
export async function replyContainer(
    interaction: RepliableInteraction,
    components: TopLevelComponent | TopLevelComponent[],
    _options: { persist?: boolean } = {},
): Promise<void> {
    await interaction.reply({
        components: toComponents(components) as never,
        flags: CV2_FLAG | MessageFlags.Ephemeral,
    });
}

/** Reply ephemerally if fresh, otherwise follow up — for CV2 components. */
export async function replyOrFollowUpContainer(
    interaction: RepliableInteraction,
    components: TopLevelComponent | TopLevelComponent[],
): Promise<void> {
    const payload = { components: toComponents(components) as never, flags: CV2_FLAG | MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
        return;
    }
    await interaction.reply(payload);
}
