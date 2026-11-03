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
