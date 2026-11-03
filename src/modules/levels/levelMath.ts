import type { LevelReward, LevelsSettings } from "./levelSettings.js";

// Curva de XP: do nível N para o N+1 são precisos 5N² + 50N + 100 XP (100, 155, 220, …) — a
// curva que a maioria das comunidades já conhece. Fácil ao início, cada vez mais longa.

export const MAX_LEVEL = 500;

export function xpToNext(level: number): number {
    return 5 * level * level + 50 * level + 100;
}

/** XP total para chegar ao nível `level` a partir do zero. */
export function totalXpFor(level: number): number {
    let total = 0;
    for (let i = 0; i < Math.min(level, MAX_LEVEL); i++) total += xpToNext(i);
    return total;
}

export function levelFromXp(xp: number): number {
    let level = 0;
    let remaining = Math.max(0, xp);
    while (level < MAX_LEVEL && remaining >= xpToNext(level)) {
        remaining -= xpToNext(level);
        level++;
    }
    return level;
}

/** Onde está um membro dentro do nível atual. */
export function levelProgress(xp: number): { level: number; into: number; needed: number; ratio: number } {
    const level = levelFromXp(xp);
    const into = Math.max(0, xp) - totalXpFor(level);
    const needed = xpToNext(level);
    return { level, into, needed, ratio: needed > 0 ? Math.min(1, into / needed) : 1 };
}

/** Barra de progresso em texto (▰▱), para os containers. */
export function progressBar(ratio: number, width = 12): string {
    const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width);
    return "▰".repeat(filled) + "▱".repeat(width - filled);
}

/** XP de uma mensagem: aleatório entre o mínimo e o máximo, vezes o maior multiplicador do membro. */
export function rollXp(settings: Pick<LevelsSettings, "xp_min" | "xp_max" | "multipliers">, memberRoleIds: Iterable<string>, random: () => number = Math.random): number {
    const base = settings.xp_min + Math.floor(random() * (settings.xp_max - settings.xp_min + 1));
    const roles = new Set(memberRoleIds);
    const multiplier = settings.multipliers.reduce((best, m) => (roles.has(m.role_id) && m.multiplier > best ? m.multiplier : best), 1);
    return Math.max(1, Math.round(base * multiplier));
}

/**
 * Cargos de recompensa a dar e a tirar para um membro num certo nível. Com `stack`, ficam
 * todos os dos níveis já atingidos; sem, fica só o do nível mais alto atingido.
 */
export function rewardChanges(rewards: LevelReward[], level: number, stack: boolean, memberRoleIds: Iterable<string>): { add: string[]; remove: string[] } {
    const has = new Set(memberRoleIds);
    const earned = rewards.filter((r) => r.level <= level).sort((a, b) => a.level - b.level);
    const keep = new Set(stack ? earned.map((r) => r.role_id) : earned.slice(-1).map((r) => r.role_id));
    const add = [...keep].filter((id) => !has.has(id));
    const remove = rewards.map((r) => r.role_id).filter((id) => has.has(id) && !keep.has(id));
    return { add, remove: [...new Set(remove)] };
}

/** A próxima recompensa ainda por atingir. */
export function nextReward(rewards: LevelReward[], level: number): LevelReward | null {
    return rewards.filter((r) => r.level > level).sort((a, b) => a.level - b.level)[0] ?? null;
}
