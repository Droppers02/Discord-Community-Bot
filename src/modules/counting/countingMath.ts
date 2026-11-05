// Canal de contagem — a parte pura: ler o número (ou a conta) de uma mensagem e decidir o que
// acontece. Sem Discord e sem base de dados, para se poder testar tudo.

const MAX_EXPRESSION = 60;
const MAX_ABS = 1e12;

type Token = { kind: "num"; value: number } | { kind: "op"; value: string };

function tokenize(input: string): Token[] | null {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
        const char = input[i]!;
        if (/\s/.test(char)) { i++; continue; }
        if (/\d/.test(char)) {
            let j = i;
            while (j < input.length && /[\d.,]/.test(input[j]!)) j++;
            const raw = input.slice(i, j).replace(",", ".");
            if ((raw.match(/\./g) ?? []).length > 1) return null;
            tokens.push({ kind: "num", value: Number(raw) });
            i = j;
            continue;
        }
        const op = char === "x" || char === "×" ? "*" : char === "÷" || char === ":" ? "/" : char;
        if (!"+-*/^()".includes(op)) return null;
        tokens.push({ kind: "op", value: op });
        i++;
    }
    return tokens;
}

/** Conta segura (sem eval): + − × ÷ ^ e parênteses. Devolve null se não for uma conta válida. */
export function evaluate(input: string): number | null {
    if (input.length > MAX_EXPRESSION) return null;
    const tokens = tokenize(input);
    if (!tokens?.length) return null;
    let pos = 0;
    const peek = () => tokens[pos];
    const isOp = (value: string) => peek()?.kind === "op" && peek()!.value === value;

    const primary = (): number | null => {
        const token = peek();
        if (!token) return null;
        if (token.kind === "num") { pos++; return token.value; }
        if (token.value === "-") { pos++; const value = primary(); return value === null ? null : -value; }
        if (token.value === "(") {
            pos++;
            const value = expression();
            if (value === null || !isOp(")")) return null;
            pos++;
            return value;
        }
        return null;
    };
    const power = (): number | null => {
        const base = primary();
        if (base === null) return null;
        if (!isOp("^")) return base;
        pos++;
        const exponent = power();
        if (exponent === null || Math.abs(exponent) > 40) return null;
        return base ** exponent;
    };
    const term = (): number | null => {
        let value = power();
        while (value !== null && (isOp("*") || isOp("/"))) {
            const op = peek()!.value;
            pos++;
            const right = power();
            if (right === null || (op === "/" && right === 0)) return null;
            value = op === "*" ? value * right : value / right;
        }
        return value;
    };
    const expression = (): number | null => {
        let value = term();
        while (value !== null && (isOp("+") || isOp("-"))) {
            const op = peek()!.value;
            pos++;
            const right = term();
            if (right === null) return null;
            value = op === "+" ? value + right : value - right;
        }
        return value;
    };

    const result = expression();
    if (result === null || pos !== tokens.length || !Number.isFinite(result) || Math.abs(result) > MAX_ABS) return null;
    return result;
}

/**
 * O número que a mensagem conta, ou null se não for uma contagem (conversa no canal).
 * Conta o início da mensagem: "42", "42 boa!", e com contas ligadas "6*7" ou "(40+2) yay".
 */
export function parseCount(content: string, allowMath: boolean): number | null {
    const text = content.trim();
    if (!allowMath) {
        const match = text.match(/^(\d{1,13})(?!\d)(?:\s|$|[!?.,])/) ?? text.match(/^(\d{1,13})$/);
        return match ? Number(match[1]) : null;
    }
    const prefix = text.match(/^[\d\s+\-*/x×÷:^().,]+/i)?.[0]?.trim();
    if (!prefix || !/\d/.test(prefix)) return null;
    // Só números (sem operadores) seguidos de texto: lê o primeiro número, como sem contas.
    if (/^\d+$/.test(prefix)) return Number(prefix);
    const value = evaluate(prefix.replace(/[.,]$/, ""));
    if (value === null || !Number.isInteger(Math.round(value * 1e9) / 1e9)) return null;
    return Math.round(value);
}

export interface CountState {
    current: number;
    lastUserId: string | null;
    record: number;
    /** O recorde quando esta ronda começou (para só fazer festa no número que o bate). */
    runRecord: number;
    saves: number;
}

export type CountOutcome =
    /** `record`: passa a ser o recorde; `beatRecord`: é o número que bate o recorde anterior (festa uma vez). */
    | { kind: "ok"; value: number; record: boolean; beatRecord: boolean; milestone: boolean; reward: boolean }
    | { kind: "saved"; expected: number; got: number; double: boolean }
    | { kind: "fail"; expected: number; got: number; double: boolean; reached: number }
    | { kind: "wrong"; expected: number; got: number; double: boolean };

export interface CountRules {
    noDouble: boolean;
    resetOnFail: boolean;
    milestoneEvery: number;
    rewardEvery: number;
}

/** O que acontece com esta contagem. Não altera o estado — quem chama aplica o resultado. */
export function judgeCount(state: CountState, value: number, userId: string, rules: CountRules): CountOutcome {
    const expected = state.current + 1;
    const double = rules.noDouble && state.lastUserId === userId;
    if (value === expected && !double) {
        return {
            kind: "ok",
            value,
            record: value > state.record,
            beatRecord: state.runRecord > 0 && value === state.runRecord + 1,
            milestone: rules.milestoneEvery > 0 && value % rules.milestoneEvery === 0,
            reward: rules.rewardEvery > 0 && value % rules.rewardEvery === 0,
        };
    }
    if (!rules.resetOnFail) return { kind: "wrong", expected, got: value, double };
    if (state.saves > 0) return { kind: "saved", expected, got: value, double };
    return { kind: "fail", expected, got: value, double, reached: state.current };
}

/** Reação para cada número certo (números especiais têm direito a festa). */
export function reactionFor(value: number, milestone: boolean, beatRecord: boolean): string {
    if (value === 69) return "😏";
    if (value === 100) return "💯";
    if (value === 404) return "🔍";
    if (value === 420) return "🌿";
    if (value === 666) return "😈";
    if (value === 777) return "🎰";
    if (value === 1000) return "🏆";
    if (milestone) return "🎉";
    if (beatRecord) return "⭐";
    return "✅";
}
