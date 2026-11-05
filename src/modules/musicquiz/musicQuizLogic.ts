// Adivinha a música — a parte pura: limpar títulos, comparar respostas (com erros de escrita),
// dicas e pontos. Sem Discord nem áudio.

/** Minúsculas, sem acentos nem pontuação, sem "(feat. …)", "[Remastered]", "- Radio Edit"… */
export function normalizeAnswer(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s*[([].*?[)\]]\s*/g, " ")
        .replace(/\s+-\s+.*(remaster|version|edit|mix|live|ao vivo|acoustic|versao).*$/i, "")
        .replace(/\b(feat|ft|featuring|with|com)\b\.?.*$/i, "")
        .replace(/&/g, " e ")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Artistas: igual, e sem o "the " do início ("The Weeknd" = "weeknd"). */
export function normalizeArtist(text: string): string {
    return normalizeAnswer(text).replace(/^the /, "");
}

export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[b.length]!;
}

export function similarity(a: string, b: string): number {
    const longest = Math.max(a.length, b.length);
    return longest ? 1 - levenshtein(a, b) / longest : 1;
}

/**
 * A resposta aparece no palpite? Aceita o palpite inteiro igual (ou quase, com erros de escrita),
 * e também a resposta escondida no meio de uma frase ("é o dracula do tame impala").
 */
export function matchesAnswer(guessRaw: string, answer: string, artist = false): boolean {
    const guess = artist ? normalizeArtist(guessRaw) : normalizeAnswer(guessRaw);
    if (!answer || !guess) return false;
    if (guess === answer) return true;
    // Respostas muito curtas ("u2", "abba") só contam certinhas.
    const tolerance = answer.length <= 4 ? 1 : answer.length <= 10 ? 0.8 : 0.75;
    if (tolerance < 1 && similarity(guess, answer) >= tolerance) return true;
    if (` ${guess} `.includes(` ${answer} `)) return true;
    const guessWords = guess.split(" ");
    const size = answer.split(" ").length;
    if (guessWords.length <= size || tolerance === 1) return false;
    for (let start = 0; start + size <= guessWords.length; start++) {
        if (similarity(guessWords.slice(start, start + size).join(" "), answer) >= tolerance) return true;
    }
    return false;
}

/** Dica: primeira letra de cada palavra e o resto em traços ("D______ · T___ I_____"). */
export function hintFor(text: string): string {
    return text
        .replace(/\s*[([].*?[)\]]\s*/g, " ")
        .trim()
        .split(/\s+/)
        .map((word) => [...word].map((char, index) => (index === 0 || !/[\p{L}\p{N}]/u.test(char) ? char : "_")).join(""))
        .join("  ");
}

export const TITLE_POINTS = 2;
export const ARTIST_POINTS = 1;
export const FAST_BONUS = 1;
export const FAST_MS = 10_000;

/** Pontos de um acerto (o título vale mais; acertar depressa no título dá bónus). */
export function pointsFor(kind: "title" | "artist", elapsedMs: number): number {
    if (kind === "artist") return ARTIST_POINTS;
    return TITLE_POINTS + (elapsedMs <= FAST_MS ? FAST_BONUS : 0);
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
}

/** Escolhe N músicas, sem repetir o mesmo artista enquanto houver alternativas. */
export function pickRounds<T extends { artist: string }>(tracks: T[], count: number, random: () => number = Math.random): T[] {
    const shuffled = shuffle(tracks, random);
    const picked: T[] = [];
    const artists = new Set<string>();
    for (const track of shuffled) {
        if (picked.length >= count) break;
        if (artists.has(track.artist.toLowerCase())) continue;
        artists.add(track.artist.toLowerCase());
        picked.push(track);
    }
    for (const track of shuffled) {
        if (picked.length >= count) break;
        if (!picked.includes(track)) picked.push(track);
    }
    return picked;
}
