import type { Client, Collection, Guild, Invite } from "discord.js";

// Tracks invite usage so we can tell which invite a new member used. We keep a per-guild
// snapshot of each invite's use count and, on join, diff it against a fresh fetch.
// Requires the Manage Server permission to read invites; if missing, it degrades to null.

const cache = new Map<string, Map<string, number>>();

function snapshot(invites: Collection<string, Invite>): Map<string, number> {
    const map = new Map<string, number>();
    for (const invite of invites.values()) map.set(invite.code, invite.uses ?? 0);
    return map;
}

export async function cacheGuildInvites(guild: Guild): Promise<void> {
    try {
        const invites = await guild.invites.fetch();
        cache.set(guild.id, snapshot(invites));
    } catch {
        // No permission / no invites — leave uncached.
    }
}

export async function cacheAllInvites(client: Client): Promise<number> {
    let total = 0;
    for (const guild of client.guilds.cache.values()) {
        await cacheGuildInvites(guild);
        total += cache.get(guild.id)?.size ?? 0;
    }
    return total;
}

export function trackInviteCreate(invite: Invite): void {
    const guildId = invite.guild?.id;
    if (!guildId) return;
    const map = cache.get(guildId) ?? new Map<string, number>();
    map.set(invite.code, invite.uses ?? 0);
    cache.set(guildId, map);
}

export function trackInviteDelete(invite: Invite): void {
    const guildId = invite.guild?.id;
    if (!guildId) return;
    cache.get(guildId)?.delete(invite.code);
}

export interface UsedInvite {
    code: string;
    inviterId: string | null;
    uses: number;
}

/** Best-effort: which invite the latest joiner used (by diffing cached use counts). */
export async function resolveUsedInvite(guild: Guild): Promise<UsedInvite | null> {
    let invites: Collection<string, Invite>;
    try {
        invites = await guild.invites.fetch();
    } catch {
        return null;
    }
    const previous = cache.get(guild.id) ?? new Map<string, number>();
    let used: UsedInvite | null = null;
    for (const invite of invites.values()) {
        const before = previous.get(invite.code) ?? 0;
        const now = invite.uses ?? 0;
        if (now > before && !used) {
            used = { code: invite.code, inviterId: invite.inviter?.id ?? null, uses: now };
        }
    }
    cache.set(guild.id, snapshot(invites)); // refresh for the next join
    return used;
}
