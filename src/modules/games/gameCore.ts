import { randomBytes } from "node:crypto";
import { MessageFlags, type RepliableInteraction } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, errorContainer, type Row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { formatNumber, t, tk } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { recordGame, type GameOutcome } from "../../repositories/gameStatsRepository.js";
import { accountOf, formatCoins, grantCoins, spendCoins } from "../economy/economyService.js";
import { getEconomySettings } from "../economy/economySettings.js";
import { getGamesSettings, type GamesSettings } from "./gamesSettings.js";

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const GAME_KEYS = ["galo", "4emlinha", "ppt", "forca", "quiz", "termo", "blackjack", "minas", "moeda", "dados", "slots", "roleta"] as const;
export type GameKey = (typeof GAME_KEYS)[number];

export const GAMES: Record<GameKey, { label: string; icon: string; command: string; description: string }> = {
    galo: { label: tk("Jogo do Galo"), icon: "❌", command: "/galo", description: tk("Contra um amigo ou contra o bot (3 dificuldades).") },
    "4emlinha": { label: tk("4 em Linha"), icon: "🔴", command: "/4emlinha", description: tk("Junta quatro antes do adversário — amigo ou bot.") },
    ppt: { label: tk("Pedra, Papel, Tesoura"), icon: "✂️", command: "/ppt", description: tk("À melhor de 1, 3 ou 5, com aposta opcional.") },
    forca: { label: tk("Forca"), icon: "🪢", command: "/forca", description: tk("Adivinha a palavra letra a letra — sozinho ou com o canal.") },
    quiz: { label: tk("Quiz"), icon: "🧠", command: "/quiz", description: tk("Perguntas para o canal inteiro; ganha quem acerta mais depressa.") },
    termo: { label: tk("Termo"), icon: "🟩", command: "/termo", description: tk("Descobre a palavra de 5 letras em 6 tentativas. Há um termo por dia.") },
    blackjack: { label: tk("Blackjack"), icon: "🃏", command: "/blackjack", description: tk("Chega aos 21 sem rebentar, contra o dealer.") },
    minas: { label: tk("Minas"), icon: "💣", command: "/minas", description: tk("Abre casas sem rebentar e levanta quando quiseres.") },
    moeda: { label: tk("Cara ou Coroa"), icon: "🪙", command: "/apostar moeda", description: tk("50/50, paga a dobrar.") },
    dados: { label: tk("Dados"), icon: "🎲", command: "/apostar dados", description: tk("Acerta no número do dado e ganha 5,5×.") },
    slots: { label: tk("Slots"), icon: "🎰", command: "/apostar slots", description: tk("Três iguais pagam até 250×.") },
    roleta: { label: tk("Roleta"), icon: "🎡", command: "/apostar roleta", description: tk("Cor, par/ímpar, metade ou número certo (36×).") },
};

export function isGameKey(value: string): value is GameKey {
    return (GAME_KEYS as readonly string[]).includes(value);
}

export function newGameId(): string {
    return randomBytes(5).toString("hex");
}

// ─── Sessões em memória ──────────────────────────────────────────────────────

export interface BaseSession {
    id: string;
    guildId: string;
    channelId: string;
    timer?: NodeJS.Timeout;
}

/** Jogos a decorrer, com um prazo de inatividade que se renova a cada jogada. */
export class Sessions<T extends BaseSession> {
    private readonly map = new Map<string, T>();

    get(id: string): T | undefined {
        return this.map.get(id);
    }

    set(session: T, idleMs: number, onExpire: (session: T) => void | Promise<void>): void {
        this.map.set(session.id, session);
        this.touch(session.id, idleMs, onExpire);
    }

    touch(id: string, idleMs: number, onExpire: (session: T) => void | Promise<void>): void {
        const session = this.map.get(id);
        if (!session) return;
        if (session.timer) clearTimeout(session.timer);
        session.timer = setTimeout(() => {
            if (this.map.get(id) !== session) return;
            this.map.delete(id);
            Promise.resolve(onExpire(session)).catch((error) => logger.warn("Jogo: falha ao expirar a sessão:", error));
        }, idleMs);
        session.timer.unref?.();
    }

    end(id: string): void {
        const session = this.map.get(id);
        if (session?.timer) clearTimeout(session.timer);
        this.map.delete(id);
    }

    countBy(predicate: (session: T) => boolean): number {
        let n = 0;
        for (const session of this.map.values()) if (predicate(session)) n++;
        return n;
    }
}

// ─── Respostas ───────────────────────────────────────────────────────────────

export async function replyError(interaction: RepliableInteraction, text: string): Promise<void> {
    const payload = { components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral } as const;
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
}

export async function notYourGame(interaction: RepliableInteraction): Promise<void> {
    await replyError(interaction, t("Este jogo não é teu — começa o teu com `/jogos`."));
}

export function gameFrame(opts: { color?: number; title: string; body: string; rows?: Row[]; footer?: string | null }): ContainerPlusBuilder {
    return buildContainer({ color: opts.color ?? COLORS.primary, title: opts.title, description: opts.body, rows: opts.rows, footerText: opts.footer ?? null });
}

// ─── Regras de acesso ────────────────────────────────────────────────────────

/** Os jogos estão ligados e este canal é permitido? Responde com o erro se não. */
export async function gameGate(interaction: RepliableInteraction): Promise<GamesSettings | null> {
    if (!interaction.guildId) return null;
    const settings = await getGamesSettings(interaction.guildId);
    if (!settings.enabled) {
        await replyError(interaction, t("Os mini-jogos estão desligados neste servidor."));
        return null;
    }
    if (settings.channels.length && interaction.channelId && !settings.channels.includes(interaction.channelId)) {
        const channel = interaction.channel;
        const parent = channel && "parentId" in channel ? channel.parentId : null;
        if (!parent || !settings.channels.includes(parent)) {
            await replyError(interaction, t("Aqui não se joga. Canais dos jogos: {list}", { list: settings.channels.map((id) => `<#${id}>`).join(", ") }));
            return null;
        }
    }
    return settings;
}

/** Valida uma aposta (0 = sem aposta). Devolve o texto do erro, ou null se estiver tudo bem. */
export async function betProblem(guildId: string, userId: string, bet: number, settings: GamesSettings): Promise<string | null> {
    if (bet <= 0) return null;
    const economy = await getEconomySettings(guildId);
    if (!economy.enabled) return t("A economia está desligada — joga sem aposta.");
    if (bet < settings.min_bet) return t("A aposta mínima é {value}.", { value: formatCoins(settings.min_bet) });
    if (bet > settings.max_bet) return t("A aposta máxima é {value}.", { value: formatCoins(settings.max_bet) });
    const account = await accountOf(guildId, userId);
    if (account.balance < bet) return t("Não tens moedas suficientes — tens {balance}.", { balance: formatCoins(account.balance) });
    return null;
}

// ─── Dinheiro (apostas em caução) ────────────────────────────────────────────
// A aposta sai da carteira quando o jogo começa e só volta (a dobrar, ou o que for) quando
// acaba. Um jogo abandonado devolve-a. Assim ninguém aposta o que já gastou noutro jogo.

export async function escrowBet(guildId: string, userId: string, bet: number, game: GameKey): Promise<boolean> {
    if (bet <= 0) return true;
    return (await spendCoins(guildId, userId, bet, "bet", game)) !== null;
}

export async function payOut(guildId: string, userId: string, amount: number, game: GameKey): Promise<void> {
    if (amount <= 0) return;
    await grantCoins(guildId, userId, amount, "bet_win", game);
}

export async function refundBet(guildId: string, userId: string, bet: number, game: GameKey): Promise<void> {
    if (bet <= 0) return;
    await grantCoins(guildId, userId, bet, "bet_refund", game);
}

/** Prémio por ganhar (sem aposta). Só paga com a economia ligada. Devolve o que pagou. */
export async function rewardWin(guildId: string, userId: string, amount: number, game: GameKey): Promise<number> {
    if (amount <= 0) return 0;
    const economy = await getEconomySettings(guildId);
    if (!economy.enabled) return 0;
    await grantCoins(guildId, userId, amount, "game_reward", game);
    return amount;
}

/** Regista o resultado nas estatísticas sem nunca rebentar o jogo. */
export function track(guildId: string, userId: string, game: GameKey, outcome: GameOutcome, extra?: { score?: number; coinsWon?: number; coinsLost?: number }): void {
    void recordGame(guildId, userId, game, outcome, extra).catch((error) => logger.warn(`Jogos: falha a guardar as estatísticas de ${game}:`, error));
}

export function coinsLine(amount: number): string {
    return `${formatCoins(amount)}`;
}

export function betLabel(bet: number): string {
    return bet > 0 ? t("Aposta: {bet}", { bet: formatCoins(bet) }) : t("Sem aposta");
}

export { formatNumber };
