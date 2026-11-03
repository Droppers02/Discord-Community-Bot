import { tk } from "../../lib/i18n.js";

// Anéis de casamento (do bot antigo): o Bronze vem com o casamento, os outros compram-se.
export const RING_TIERS = [
    { tier: 1, name: tk("Bronze"), icon: "🥉", price: 0 },
    { tier: 2, name: tk("Prata"), icon: "🥈", price: 50_000 },
    { tier: 3, name: tk("Ouro"), icon: "🥇", price: 150_000 },
    { tier: 4, name: tk("Diamante"), icon: "💎", price: 500_000 },
    { tier: 5, name: tk("Platina"), icon: "👑", price: 1_000_000 },
] as const;

export function ringOf(tier: number) {
    return RING_TIERS.find((entry) => entry.tier === tier) ?? RING_TIERS[0];
}
