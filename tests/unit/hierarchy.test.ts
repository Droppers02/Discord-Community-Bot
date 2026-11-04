import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import { hasPowerPermissions, outranks, roleGrantProblem } from "../../src/lib/discord.js";

// Servidor de teste: bot (65) > Founder (64) > Owner (63) > Staff (40) > Membros (5).
const OWNER_ID = "1";
const BOT_POSITION = 65;

function role(id: string, position: number, perms: bigint[] = []) {
    const bits = perms.reduce((acc, perm) => acc | perm, 0n);
    return {
        id, position, managed: false, name: id,
        permissions: { has: (permission: bigint) => (bits & permission) === permission },
        comparePositionTo: (other: { position: number }) => position - other.position,
    };
}

const guild = { id: "guild", ownerId: OWNER_ID, members: { me: { roles: { highest: role("bot", BOT_POSITION) } } } };

function member(id: string, highest: ReturnType<typeof role>, perms: bigint[] = []): GuildMember {
    const bits = perms.reduce((acc, perm) => acc | perm, 0n);
    return {
        id,
        guild,
        roles: { highest },
        permissions: { has: (permission: bigint) => (bits & permission) === permission || (bits & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator },
    } as unknown as GuildMember;
}

const founder = role("Founder", 64);
const ownerRole = role("Owner", 63, [PermissionFlagsBits.Administrator]);
const staff = role("Staff", 40, [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageRoles]);
const members = role("Membros", 5);
const vip = role("VIP", 10);

describe("hierarquia", () => {
    const serverOwner = member(OWNER_ID, founder);
    const coOwner = member("2", ownerRole, [PermissionFlagsBits.Administrator]);
    const mod = member("3", staff, [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageRoles]);
    const normal = member("4", members);

    it("o dono do servidor está acima de toda a gente (o caso do teste de ban)", () => {
        expect(outranks(serverOwner, coOwner)).toBe(true);
        expect(outranks(coOwner, serverOwner)).toBe(false);
    });

    it("ninguém mexe em quem tem cargo igual ou acima", () => {
        expect(outranks(mod, coOwner)).toBe(false);
        expect(outranks(mod, member("5", staff))).toBe(false);
        expect(outranks(mod, normal)).toBe(true);
    });

    it("a staff não dá a si própria cargos acima do seu (o furo do /cargotemp)", () => {
        expect(roleGrantProblem(mod, founder)).not.toBeNull();
        expect(roleGrantProblem(mod, ownerRole)).not.toBeNull();
        expect(roleGrantProblem(mod, vip)).toBeNull();
    });

    it("cargos com poderes só por administradores, e nunca automaticamente", () => {
        const helper = role("Helper", 20, [PermissionFlagsBits.KickMembers]);
        expect(hasPowerPermissions(helper)).toBe(true);
        expect(roleGrantProblem(mod, helper)).not.toBeNull();
        expect(roleGrantProblem(coOwner, helper)).toBeNull();
        expect(roleGrantProblem(coOwner, helper, { automatic: true })).not.toBeNull();
        expect(roleGrantProblem(serverOwner, helper, { automatic: true })).not.toBeNull();
    });

    it("nada acima do bot nem @everyone", () => {
        expect(roleGrantProblem(serverOwner, role("Topo", 70))).not.toBeNull();
        expect(roleGrantProblem(serverOwner, role("guild", 0))).not.toBeNull();
    });
});
