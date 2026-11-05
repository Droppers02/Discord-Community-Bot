// Equipas — regras puras: nomes, tags, cores, quem pode fazer o quê, semanas da guerra semanal.

export type TeamRank = "owner" | "officer" | "member";
export const RANK_LABELS: Record<TeamRank, string> = { owner: "👑 Dono", officer: "⭐ Oficial", member: "Membro" };
const RANK_ORDER: Record<TeamRank, number> = { owner: 3, officer: 2, member: 1 };

export type TeamAction = "invite" | "kick" | "promote" | "demote" | "transfer" | "edit" | "withdraw" | "delete";

/** O cargo `actor` pode fazer `action` a alguém com o cargo `target`? */
export function canDo(actor: TeamRank, action: TeamAction, target: TeamRank | null = null): boolean {
    switch (action) {
        case "invite":
        case "edit":
            return actor === "owner" || actor === "officer";
        case "kick":
            return target !== null && RANK_ORDER[actor] > RANK_ORDER[target] && actor !== "member";
        case "promote":
        case "demote":
        case "transfer":
        case "withdraw":
        case "delete":
            return actor === "owner";
    }
}

export function sortByRank<T extends { rank: TeamRank; points: number }>(members: T[]): T[] {
    return [...members].sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank] || b.points - a.points);
}

export function validName(input: string): string | null {
    const name = input.trim().replace(/\s+/g, " ");
    if (name.length < 3 || name.length > 32) return null;
    if (!/^[\p{L}\p{N} '._-]+$/u.test(name)) return null;
    return name;
}

export function validTag(input: string): string | null {
    const tag = input.trim().toUpperCase();
    return /^[A-Z0-9]{2,5}$/.test(tag) ? tag : null;
}

const NAMED_COLORS: Record<string, number> = {
    vermelho: 0xe74c3c, laranja: 0xe67e22, amarelo: 0xf1c40f, verde: 0x2ecc71, azul: 0x3498db, roxo: 0x9b59b6,
    rosa: 0xff6b9d, preto: 0x23272a, branco: 0xffffff, cinzento: 0x95a5a6, ciano: 0x1abc9c, dourado: 0xd4af37,
};

/** "#ff0000", "ff0000", "vermelho" → número da cor; null se não perceber. */
export function parseColor(input: string): number | null {
    const text = input.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (NAMED_COLORS[text] !== undefined) return NAMED_COLORS[text]!;
    const hex = text.replace(/^#/, "");
    return /^[0-9a-f]{6}$/.test(hex) ? Number.parseInt(hex, 16) : null;
}

export function colorHex(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
}

const weekParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" });

/** Semana ISO em Lisboa ("2026-W45") — a guerra semanal vai de segunda a domingo. */
export function isoWeek(ms: number): string {
    const [year, month, day] = weekParts.format(new Date(ms)).split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = (date.getUTCDay() + 6) % 7; // segunda = 0
    date.setUTCDate(date.getUTCDate() - weekday + 3); // quinta-feira desta semana decide o ano
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** A semana anterior a `week` (para fechar a guerra quando começa a nova). */
export function previousWeek(ms: number): string {
    return isoWeek(ms - 7 * 86_400_000);
}
