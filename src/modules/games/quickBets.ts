import { randomInt } from "node:crypto";
import type { ChatInputCommandInteraction } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t, tk } from "../../lib/i18n.js";
import { formatCoins } from "../economy/economyService.js";
import { betProblem, escrowBet, gameFrame, gameGate, payOut, replyError, track, type GameKey } from "./gameCore.js";

// Apostas rápidas, de uma só mensagem: moeda, dados, slots e roleta.

interface Outcome {
    title: string;
    lines: string[];
    multiplier: number;
}

async function play(interaction: ChatInputCommandInteraction<"cached">, game: GameKey, bet: number, roll: () => Outcome): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    if (bet <= 0) return void replyError(interaction, t("Indica quanto queres apostar."));
    const problem = await betProblem(interaction.guildId, interaction.user.id, bet, settings);
    if (problem) return void replyError(interaction, problem);
    if (!(await escrowBet(interaction.guildId, interaction.user.id, bet, game))) return void replyError(interaction, t("Não tens moedas suficientes."));
    const outcome = roll();
    const prize = Math.floor(bet * outcome.multiplier);
    await payOut(interaction.guildId, interaction.user.id, prize, game);
    track(interaction.guildId, interaction.user.id, game, prize > bet ? "win" : prize === bet ? "draw" : "loss", { coinsWon: Math.max(0, prize - bet), coinsLost: prize < bet ? bet - prize : 0 });
    const won = prize > bet;
    await interaction.reply({
        components: [gameFrame({
            color: won ? COLORS.success : prize === bet ? COLORS.neutral : COLORS.danger,
            title: outcome.title,
            body: [
                ...outcome.lines,
                "",
                won
                    ? `🎉 ${t("Ganhaste {coins} (×{mult})!", { coins: formatCoins(prize), mult: outcome.multiplier })}`
                    : prize === bet ? `🤝 ${t("Recuperaste a aposta.")}` : `😔 ${t("Perdeste {coins}.", { coins: formatCoins(bet) })}`,
            ].join("\n"),
            footer: t("Aposta de {user}: {bet}", { user: interaction.member.displayName, bet: bet.toLocaleString("pt-PT") }),
        })],
        flags: CV2_FLAG,
        allowedMentions: { parse: [] },
    });
}

// ─── Moeda ───────────────────────────────────────────────────────────────────
export function playCoin(interaction: ChatInputCommandInteraction<"cached">, bet: number, side: "cara" | "coroa"): Promise<void> {
    return play(interaction, "moeda", bet, () => {
        const result = randomInt(0, 2) === 0 ? "cara" : "coroa";
        return {
            title: `🪙 ${t("Cara ou Coroa")}`,
            lines: [t("Escolheste **{side}** · saiu **{result}**", { side: side === "cara" ? t("cara") : t("coroa"), result: result === "cara" ? t("cara") : t("coroa") })],
            multiplier: result === side ? 2 : 0,
        };
    });
}

// ─── Dados ───────────────────────────────────────────────────────────────────
const DICE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
export function playDice(interaction: ChatInputCommandInteraction<"cached">, bet: number, guess: number): Promise<void> {
    return play(interaction, "dados", bet, () => {
        const result = randomInt(1, 7);
        return {
            title: `🎲 ${t("Dados")}`,
            lines: [t("Apostaste no **{guess}** · saiu {face} **{result}**", { guess, face: DICE[result]!, result })],
            multiplier: result === guess ? 5.5 : 0,
        };
    });
}

// ─── Slots ───────────────────────────────────────────────────────────────────
// Pesos e prémios afinados para a slot devolver ~94% do apostado a longo prazo.
const SLOT_SYMBOLS: Array<{ icon: string; weight: number; triple: number }> = [
    { icon: "🍒", weight: 30, triple: 8 },
    { icon: "🍋", weight: 25, triple: 10 },
    { icon: "🍇", weight: 20, triple: 15 },
    { icon: "🔔", weight: 13, triple: 25 },
    { icon: "⭐", weight: 8, triple: 50 },
    { icon: "7️⃣", weight: 3, triple: 100 },
    { icon: "💎", weight: 1, triple: 250 },
];
const SLOT_TOTAL = SLOT_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);

function spinSymbol(): (typeof SLOT_SYMBOLS)[number] {
    let n = randomInt(0, SLOT_TOTAL);
    for (const symbol of SLOT_SYMBOLS) {
        if (n < symbol.weight) return symbol;
        n -= symbol.weight;
    }
    return SLOT_SYMBOLS[0]!;
}

export function playSlots(interaction: ChatInputCommandInteraction<"cached">, bet: number): Promise<void> {
    return play(interaction, "slots", bet, () => {
        const reels = [spinSymbol(), spinSymbol(), spinSymbol()];
        const [a, b, c] = reels as [typeof reels[0], typeof reels[0], typeof reels[0]];
        let multiplier = 0;
        let label = t("Nada desta vez.");
        if (a.icon === b.icon && b.icon === c.icon) {
            multiplier = a.triple;
            label = a.icon === "💎" ? `💎 **${t("JACKPOT!")}**` : t("Três iguais!");
        } else if (a.icon === b.icon || b.icon === c.icon) {
            // Par seguido: os símbolos baixos devolvem a aposta, os altos pagam a dobrar.
            const pair = a.icon === b.icon ? a : c;
            multiplier = pair.triple >= 25 ? 2 : 1;
            label = t("Par de {icon}!", { icon: pair.icon });
        }
        return { title: `🎰 ${t("Slots")}`, lines: [`## ┃ ${reels.map((reel) => reel.icon).join(" ┃ ")} ┃`, label], multiplier };
    });
}

// ─── Roleta (europeia, um zero) ──────────────────────────────────────────────
export const ROULETTE_BETS = ["vermelho", "preto", "par", "impar", "baixo", "alto", "numero"] as const;
export type RouletteBet = (typeof ROULETTE_BETS)[number];
export const ROULETTE_LABELS: Record<RouletteBet, string> = {
    vermelho: tk("Vermelho"), preto: tk("Preto"), par: tk("Par"), impar: tk("Ímpar"), baixo: tk("1–18"), alto: tk("19–36"), numero: tk("Número certo"),
};
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function rouletteWins(kind: RouletteBet, number: number | null, result: number): boolean {
    if (result === 0) return kind === "numero" && number === 0;
    switch (kind) {
        case "vermelho": return RED.has(result);
        case "preto": return !RED.has(result);
        case "par": return result % 2 === 0;
        case "impar": return result % 2 === 1;
        case "baixo": return result <= 18;
        case "alto": return result >= 19;
        case "numero": return number === result;
    }
}

export function playRoulette(interaction: ChatInputCommandInteraction<"cached">, bet: number, kind: RouletteBet, number: number | null): Promise<void> {
    return play(interaction, "roleta", bet, () => {
        const result = randomInt(0, 37);
        const color = result === 0 ? "🟢" : RED.has(result) ? "🔴" : "⚫";
        const target = kind === "numero" ? t("no número **{n}**", { n: number ?? 0 }) : `**${t(ROULETTE_LABELS[kind])}**`;
        return {
            title: `🎡 ${t("Roleta")}`,
            lines: [t("Apostaste {target} · saiu {color} **{result}**", { target, color, result })],
            multiplier: rouletteWins(kind, number, result) ? (kind === "numero" ? 36 : 2) : 0,
        };
    });
}
