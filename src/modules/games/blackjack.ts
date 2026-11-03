import { randomInt } from "node:crypto";
import { ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, type Message } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { formatCoins } from "../economy/economyService.js";
import { betLabel, betProblem, escrowBet, gameFrame, gameGate, newGameId, notYourGame, payOut, replyError, Sessions, track, type BaseSession } from "./gameCore.js";

// Blackjack contra o dealer (baralho de 6). O dealer pede até 17. Blackjack natural paga 3:2,
// vitória 1:1, empate devolve a aposta. Dá para dobrar com as duas primeiras cartas.

const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const IDLE_MS = 2 * 60_000;

interface Card { rank: (typeof RANKS)[number]; suit: (typeof SUITS)[number] }

interface BlackjackSession extends BaseSession {
    userId: string;
    bet: number;
    deck: Card[];
    player: Card[];
    dealer: Card[];
    doubled: boolean;
    /** 0 a decorrer · resultado final caso contrário */
    result: 0 | "blackjack" | "win" | "push" | "lose" | "bust" | "dealer_bust";
    payout: number;
    message: Message | null;
}

const sessions = new Sessions<BlackjackSession>();

function newDeck(): Card[] {
    const deck: Card[] = [];
    for (let d = 0; d < 6; d++) for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
    for (let i = deck.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    return deck;
}

export function handValue(cards: Card[]): { total: number; soft: boolean } {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
        if (card.rank === "A") { aces++; total += 11; } else if (["J", "Q", "K"].includes(card.rank)) total += 10;
        else total += Number(card.rank);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
}

const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;
const cardText = (card: Card) => `\`${card.rank}${card.suit}\``;

function render(session: BlackjackSession) {
    const ended = session.result !== 0;
    const player = handValue(session.player);
    const dealerShown = ended ? session.dealer : [session.dealer[0]!];
    const dealerValue = handValue(dealerShown);
    const dealerCards = ended ? session.dealer.map(cardText).join(" ") : `${cardText(session.dealer[0]!)} \`??\``;
    const outcome: Record<Exclude<BlackjackSession["result"], 0>, string> = {
        blackjack: `🃏 ${t("Blackjack! Ganhas {coins}.", { coins: formatCoins(session.payout) })}`,
        win: `🏆 ${t("Ganhaste! Recebes {coins}.", { coins: formatCoins(session.payout) })}`,
        dealer_bust: `💥 ${t("O dealer rebentou! Recebes {coins}.", { coins: formatCoins(session.payout) })}`,
        push: `🤝 ${t("Empate — a aposta volta para ti.")}`,
        lose: `😔 ${t("O dealer ganhou. Perdeste {coins}.", { coins: formatCoins(session.bet * (session.doubled ? 2 : 1)) })}`,
        bust: `💥 ${t("Rebentaste! Perdeste {coins}.", { coins: formatCoins(session.bet * (session.doubled ? 2 : 1)) })}`,
    };
    const canDouble = !ended && session.player.length === 2 && !session.doubled;
    return gameFrame({
        color: !ended ? COLORS.primary : ["blackjack", "win", "dealer_bust"].includes(session.result as string) ? COLORS.success : session.result === "push" ? COLORS.neutral : COLORS.danger,
        title: `🃏 ${t("Blackjack")}`,
        body: [
            `${t("Jogador: {user}", { user: `<@${session.userId}>` })} · ${betLabel(session.bet * (session.doubled ? 2 : 1))}`,
            "",
            `**${t("Dealer")}** — ${ended ? dealerValue.total : "?"}`,
            dealerCards,
            "",
            `**${t("Tu")}** — ${player.total}${player.soft && player.total <= 21 ? ` (${t("suave")})` : ""}`,
            session.player.map(cardText).join(" "),
            "",
            ended ? outcome[session.result as Exclude<BlackjackSession["result"], 0>] : t("Pedes carta ou ficas?"),
        ].join("\n"),
        rows: ended ? [] : [row(
            new ButtonBuilder().setCustomId(buildCustomId("g", "bj", session.id, "hit")).setLabel(t("Pedir")).setEmoji("➕").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(buildCustomId("g", "bj", session.id, "stand")).setLabel(t("Ficar")).setEmoji("✋").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(buildCustomId("g", "bj", session.id, "double")).setLabel(t("Dobrar")).setEmoji("✖️").setStyle(ButtonStyle.Success).setDisabled(!canDouble),
        )],
    });
}

async function settle(session: BlackjackSession, result: Exclude<BlackjackSession["result"], 0>): Promise<void> {
    session.result = result;
    sessions.end(session.id);
    const stake = session.bet * (session.doubled ? 2 : 1);
    const payout = result === "blackjack" ? Math.floor(stake * 2.5) : result === "win" || result === "dealer_bust" ? stake * 2 : result === "push" ? stake : 0;
    session.payout = payout;
    await payOut(session.guildId, session.userId, payout, "blackjack");
    const outcome = payout > stake ? "win" : payout === stake ? "draw" : "loss";
    track(session.guildId, session.userId, "blackjack", outcome, { coinsWon: Math.max(0, payout - stake), coinsLost: payout < stake ? stake : 0 });
}

async function dealerPlays(session: BlackjackSession): Promise<void> {
    while (handValue(session.dealer).total < 17) session.dealer.push(session.deck.pop()!);
    const player = handValue(session.player).total;
    const dealer = handValue(session.dealer).total;
    if (dealer > 21) return settle(session, "dealer_bust");
    if (player > dealer) return settle(session, "win");
    if (player === dealer) return settle(session, "push");
    return settle(session, "lose");
}

function expire(session: BlackjackSession): void {
    // Sem resposta: fica com o que tem (como carregar em "Ficar").
    void (async () => {
        await dealerPlays(session);
        await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    })();
}

export async function startBlackjack(interaction: ChatInputCommandInteraction<"cached">, bet: number): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    const problem = await betProblem(interaction.guildId, interaction.user.id, bet, settings);
    if (problem) return void replyError(interaction, problem);
    if (!(await escrowBet(interaction.guildId, interaction.user.id, bet, "blackjack"))) return void replyError(interaction, t("Não tens moedas suficientes."));
    const deck = newDeck();
    const session: BlackjackSession = {
        id: newGameId(), guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, bet, deck,
        player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], doubled: false, result: 0, payout: 0, message: null,
    };
    if (isBlackjack(session.player)) await settle(session, isBlackjack(session.dealer) ? "push" : "blackjack");
    else sessions.set(session, IDLE_MS, expire);
    const response = await interaction.reply({ components: [render(session)], flags: CV2_FLAG, allowedMentions: { parse: [] }, withResponse: true });
    session.message = response.resource?.message ?? null;
}

export async function handleBlackjackButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Esta mão já acabou."));
    if (session.userId !== interaction.user.id) return void notYourGame(interaction);
    session.message = interaction.message;

    if (action === "double") {
        if (session.player.length !== 2 || session.doubled) return void interaction.deferUpdate();
        if (!(await escrowBet(session.guildId, session.userId, session.bet, "blackjack"))) return void replyError(interaction, t("Não tens moedas para dobrar."));
        session.doubled = true;
        session.player.push(session.deck.pop()!);
        if (handValue(session.player).total > 21) await settle(session, "bust");
        else await dealerPlays(session);
    } else if (action === "hit") {
        session.player.push(session.deck.pop()!);
        const total = handValue(session.player).total;
        if (total > 21) await settle(session, "bust");
        else if (total === 21) await dealerPlays(session);
        else sessions.touch(session.id, IDLE_MS, expire);
    } else if (action === "stand") {
        await dealerPlays(session);
    }
    await interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
}
