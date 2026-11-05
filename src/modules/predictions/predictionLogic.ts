// Previsões — contas puras (parimutuel, como as previsões da Twitch): quem acerta divide o bolo
// todo (menos a taxa da casa, se houver) em proporção ao que apostou. Se ninguém acertou, toda a
// gente recebe a aposta de volta.

export interface Bet { user_id: string; option: number; amount: number }

export interface OptionTotals { option: number; total: number; bettors: number }

export function totalsByOption(bets: Bet[], optionCount: number): OptionTotals[] {
    return Array.from({ length: optionCount }, (_, option) => {
        const on = bets.filter((bet) => bet.option === option);
        return { option, total: on.reduce((sum, bet) => sum + bet.amount, 0), bettors: on.length };
    });
}

/** Quanto paga cada moeda apostada nesta opção, se ganhar (ex.: 2.35 = "paga x2.35"). */
export function payoutMultiplier(bets: Bet[], option: number, houseCutPct: number): number | null {
    const pool = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const onOption = bets.filter((bet) => bet.option === option).reduce((sum, bet) => sum + bet.amount, 0);
    if (!onOption) return null;
    return (pool * (1 - houseCutPct / 100)) / onOption;
}

export interface Settlement {
    /** user_id → moedas a receber (aposta incluída). */
    payouts: Map<string, number>;
    refunded: boolean;
    pool: number;
    cut: number;
}

export function settle(bets: Bet[], winner: number, houseCutPct: number): Settlement {
    const pool = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const winners = bets.filter((bet) => bet.option === winner);
    const winningStake = winners.reduce((sum, bet) => sum + bet.amount, 0);
    const payouts = new Map<string, number>();
    if (!winningStake) {
        for (const bet of bets) payouts.set(bet.user_id, (payouts.get(bet.user_id) ?? 0) + bet.amount);
        return { payouts, refunded: true, pool, cut: 0 };
    }
    const cut = Math.floor(pool * houseCutPct / 100);
    const prize = pool - cut;
    // Arredondamentos: cada um recebe a parte inteira; os restos vão para os maiores apostadores.
    let distributed = 0;
    const shares = winners.map((bet) => {
        const exact = (bet.amount * prize) / winningStake;
        const whole = Math.floor(exact);
        distributed += whole;
        return { bet, whole, remainder: exact - whole };
    });
    let leftover = prize - distributed;
    shares.sort((a, b) => b.remainder - a.remainder || b.bet.amount - a.bet.amount);
    for (const share of shares) {
        const extra = leftover > 0 ? 1 : 0;
        leftover -= extra;
        payouts.set(share.bet.user_id, (payouts.get(share.bet.user_id) ?? 0) + share.whole + extra);
    }
    return { payouts, refunded: false, pool, cut };
}

/** "Sim | Não", "A, B, C" ou uma por linha → 2 a 8 opções sem repetir. */
export function parseOptions(input: string): string[] | null {
    const separator = input.includes("|") ? "|" : input.includes("\n") ? "\n" : input.includes(";") ? ";" : ",";
    const options = [...new Set(input.split(separator).map((part) => part.trim().slice(0, 60)).filter(Boolean))];
    return options.length >= 2 && options.length <= 8 ? options : null;
}

/** Barra de percentagem para o cartão. */
export function shareBar(part: number, total: number, width = 10): string {
    const ratio = total ? part / total : 0;
    const filled = Math.round(ratio * width);
    return "▰".repeat(filled) + "▱".repeat(width - filled);
}
