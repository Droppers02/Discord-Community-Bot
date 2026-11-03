import { withTransaction } from "#database";
import { formatNumber, t } from "../../lib/i18n.js";
import { applyDelta } from "../../repositories/economyRepository.js";

// Propostas de troca à espera de resposta (5 minutos).
export interface PendingTrade {
    guildId: string;
    fromId: string;
    toId: string;
    offer: number;
    ask: number;
    note: string | null;
}

const TTL_MS = 5 * 60_000;
const pending = new Map<string, { trade: PendingTrade; expires: number }>();

export const trades = {
    set(id: string, trade: PendingTrade): void {
        const now = Date.now();
        for (const [key, entry] of pending) if (entry.expires < now) pending.delete(key);
        pending.set(id, { trade, expires: now + TTL_MS });
    },
    get(id: string): PendingTrade | null {
        const entry = pending.get(id);
        return entry && entry.expires > Date.now() ? entry.trade : null;
    },
    delete(id: string): void {
        pending.delete(id);
    },
};

/** Executa a troca nos dois sentidos, numa só transação (ou nada). */
export async function executeTrade(guildId: string, fromId: string, toId: string, offer: number, ask: number, startBalance: number): Promise<string | null> {
    try {
        await withTransaction(async (client) => {
            if (offer > 0) {
                if (await applyDelta(guildId, fromId, -offer, "trade_out", `→ ${toId}`, startBalance, client) === null) throw new Error("from");
                await applyDelta(guildId, toId, offer, "trade_in", `← ${fromId}`, startBalance, client);
            }
            if (ask > 0) {
                if (await applyDelta(guildId, toId, -ask, "trade_out", `→ ${fromId}`, startBalance, client) === null) throw new Error("to");
                await applyDelta(guildId, fromId, ask, "trade_in", `← ${toId}`, startBalance, client);
            }
        });
        return null;
    } catch (error) {
        if (error instanceof Error && error.message === "from") return t("Quem propôs já não tem {amount}.", { amount: formatNumber(offer) });
        if (error instanceof Error && error.message === "to") return t("Não tens {amount} para a troca.", { amount: formatNumber(ask) });
        throw error;
    }
}
