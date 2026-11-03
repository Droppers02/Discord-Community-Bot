// Comparação de letras sem acentos (Ã → A, Ç → C), para os jogos de palavras.

export function baseLetter(char: string): string {
    return char.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

export function baseWord(word: string): string {
    return [...word].map(baseLetter).join("");
}

export function isLetter(char: string): boolean {
    return /^[A-Z]$/.test(baseLetter(char));
}

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
}
