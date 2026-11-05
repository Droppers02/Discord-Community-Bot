import { parseDelay, parseWhen } from "../../lib/when.js";

// Procurar grupo — regras puras (entrar, sair, lista de espera, passar a liderança).

export type LfgStatus = "open" | "full" | "started" | "closed";

export interface LfgGroupState {
    host_id: string;
    size: number;
    members: string[];
    waitlist: string[];
    status: LfgStatus;
}

export type JoinResult = "joined" | "waitlisted" | "already" | "closed";

export function joinGroup(group: LfgGroupState, userId: string): { group: LfgGroupState; result: JoinResult; filled: boolean } {
    if (group.status === "started" || group.status === "closed") return { group, result: "closed", filled: false };
    if (group.members.includes(userId) || group.waitlist.includes(userId)) return { group, result: "already", filled: false };
    if (group.members.length < group.size) {
        const members = [...group.members, userId];
        const filled = members.length >= group.size;
        return { group: { ...group, members, status: filled ? "full" : "open" }, result: "joined", filled };
    }
    return { group: { ...group, waitlist: [...group.waitlist, userId] }, result: "waitlisted", filled: false };
}

export interface LeaveOutcome {
    group: LfgGroupState;
    left: boolean;
    /** Quem saiu da lista de espera para a vaga. */
    promoted: string | null;
    /** Novo líder (o anterior saiu). */
    newHost: string | null;
    /** Ficou vazio — fecha. */
    empty: boolean;
}

export function leaveGroup(group: LfgGroupState, userId: string): LeaveOutcome {
    if (group.waitlist.includes(userId)) {
        return { group: { ...group, waitlist: group.waitlist.filter((id) => id !== userId) }, left: true, promoted: null, newHost: null, empty: false };
    }
    if (!group.members.includes(userId)) return { group, left: false, promoted: null, newHost: null, empty: false };
    let members = group.members.filter((id) => id !== userId);
    let waitlist = [...group.waitlist];
    let promoted: string | null = null;
    if (waitlist.length && group.status !== "started") {
        promoted = waitlist.shift()!;
        members = [...members, promoted];
    }
    if (!members.length) return { group: { ...group, members, waitlist, status: "closed" }, left: true, promoted: null, newHost: null, empty: true };
    const newHost = group.host_id === userId ? members[0]! : null;
    const status: LfgStatus = group.status === "started" ? "started" : members.length >= group.size ? "full" : "open";
    return { group: { ...group, host_id: newHost ?? group.host_id, members, waitlist, status }, left: true, promoted, newHost, empty: false };
}

/** Quando o grupo expira: com hora marcada, 2 h depois da hora; sem hora, ao fim de `hours`. */
export function expiryFor(createdAt: number, startsAt: number | null, hours: number): number {
    return startsAt ? startsAt + 2 * 3_600_000 : createdAt + hours * 3_600_000;
}

/** Tamanho típico por jogo (para importar dos auto-cargos). */
export const DEFAULT_GAME_SIZES: Record<string, number> = {
    valorant: 5, csgo: 5, cs2: 5, "counter-strike": 5, "league-of-legends": 5, lol: 5, overwatch: 5, "rocket-league": 3,
    fortnite: 4, minecraft: 10, "gta-v-rp": 4, "dead-by-daylight": 4, "marvel-rivals": 6, ark: 6, roblox: 6, runeterra: 2,
    apex: 3, "apex-legends": 3, warzone: 4, "rainbow-six": 5, r6: 5, dota: 5, "dota-2": 5, pubg: 4,
};

export function slugify(name: string): string {
    return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "jogo";
}

export function defaultSizeFor(name: string): number {
    const slug = slugify(name);
    return DEFAULT_GAME_SIZES[slug] ?? Object.entries(DEFAULT_GAME_SIZES).find(([key]) => slug.includes(key))?.[1] ?? 5;
}

/**
 * "21h", "21:30", "amanhã 18:00" (hora marcada) ou "daqui a 2h" / "30m" (espera).
 * "2h" sozinho é uma hora (02:00), como "21h"; para esperar, "daqui a 2h". "agora" (ou nada) = null.
 */
export function parseStart(input: string, now = Date.now()): number | null {
    const text = input.trim().toLowerCase();
    if (!text || /^(agora|ja|já)$/.test(text)) return null;
    const relative = text.match(/^(?:daqui a|dentro de|em)\s+(.+)$/);
    if (relative) {
        const delay = parseDelay(relative[1]!);
        return delay ? now + delay : null;
    }
    const fixed = parseWhen(text, now);
    if (fixed) return fixed;
    const delay = parseDelay(text);
    return delay ? now + delay : null;
}
