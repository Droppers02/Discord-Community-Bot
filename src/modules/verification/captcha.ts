import type { CaptchaShape, ShapeKind } from "./captchaImage.js";

// O desafio: uma sequência de formas (3 ou 4) escolhida de entre 6 símbolos; os botões
// mostram os 6 baralhados e a pessoa toca neles pela ordem da imagem. As cores são as dos
// próprios emojis, para a forma do botão e a da imagem coincidirem à vista.

export interface CaptchaSymbol extends CaptchaShape {
    key: string;
    emoji: string;
}

export const CAPTCHA_SYMBOLS: readonly CaptchaSymbol[] = [
    { key: "rc", emoji: "🔴", kind: "circle", color: "#dd2e44" },
    { key: "bs", emoji: "🟦", kind: "square", color: "#55acee" },
    { key: "ys", emoji: "⭐", kind: "star", color: "#ffac33" },
    { key: "gs", emoji: "🟩", kind: "square", color: "#78b159" },
    { key: "od", emoji: "🔶", kind: "diamond", color: "#f4900c" },
    { key: "pc", emoji: "🟣", kind: "circle", color: "#aa8ed6" },
];

export interface Challenge {
    sequence: string[];
    /** Ordem dos botões. */
    buttons: string[];
    progress: number;
    createdAt: number;
}

export const CHALLENGE_TTL_MS = 5 * 60_000;

function shuffle<T>(items: readonly T[], random: () => number): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export function newChallenge(length: number, random: () => number = Math.random, now = Date.now()): Challenge {
    const keys = CAPTCHA_SYMBOLS.map((s) => s.key);
    return {
        sequence: shuffle(keys, random).slice(0, Math.max(2, Math.min(5, length))),
        buttons: shuffle(keys, random),
        progress: 0,
        createdAt: now,
    };
}

export function symbolOf(key: string): CaptchaSymbol | undefined {
    return CAPTCHA_SYMBOLS.find((s) => s.key === key);
}

export function shapesOf(challenge: Challenge): Array<{ kind: ShapeKind; color: string }> {
    return challenge.sequence.map((key) => symbolOf(key) as CaptchaSymbol);
}

export type PickResult = "next" | "done" | "wrong" | "expired";

/** Avança o desafio com um toque. Muda `challenge.progress` quando acerta. */
export function pick(challenge: Challenge, key: string, now = Date.now()): PickResult {
    if (now - challenge.createdAt > CHALLENGE_TTL_MS) return "expired";
    if (challenge.sequence[challenge.progress] !== key) return "wrong";
    challenge.progress++;
    return challenge.progress >= challenge.sequence.length ? "done" : "next";
}
