// Texto do bot. O EPA BOTCHI fala só português de Portugal, mas o texto continua dentro de
// `t("…")` — é o formato dos outros bots (PixelTickets/PixelFx) e dá-nos variáveis e plurais
// sem concatenações: `t("Olá, {name}!", { name })`,
// `t("{count, plural, one {# vitória} other {# vitórias}}", { count })`.

export type Vars = Record<string, string | number | null | undefined>;

const INTL_TAG = "pt-PT";
const pluralRules = new Intl.PluralRules(INTL_TAG);

/** Texto formatado (variáveis e plurais). */
export function t(source: string, vars?: Vars): string {
    return formatMessage(source, vars);
}

/** Marca um texto definido ao carregar um módulo; mostra-se depois com `t(valor)`. */
export function tk(source: string): string {
    return source;
}

/** Etiqueta BCP 47 para datas e números formatados no servidor. */
export function intlLocale(): string {
    return INTL_TAG;
}

/** Compatibilidade com módulos portados: aqui só há uma língua. */
export function withGuildLocale<T>(_guildId: string | null | undefined, fn: () => T): T {
    return fn();
}

/** `value` é igual ao texto por defeito `source`? */
export function isDefaultText(value: string | null | undefined, source: string): boolean {
    return value?.trim() === source;
}

/** Texto configurável com valor por defeito: vazio sai o texto por defeito. */
export function textOrDefault(value: string | null | undefined, source: string): string {
    const text = value?.trim();
    return text ? text : t(source);
}

/** Número com separadores portugueses (1 234 567). */
export function formatNumber(value: number): string {
    return new Intl.NumberFormat(INTL_TAG).format(value);
}

// ─── Formatação (ICU reduzido: variáveis, plural e select) ────────────────────

function matchingBrace(text: string, start: number): number {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) return i;
    }
    return -1;
}

function parseBranches(body: string): Map<string, string> {
    const branches = new Map<string, string>();
    let i = 0;
    while (i < body.length) {
        while (i < body.length && /\s/.test(body[i]!)) i++;
        const open = body.indexOf("{", i);
        if (open === -1) break;
        const key = body.slice(i, open).trim();
        const close = matchingBrace(body, open);
        if (close === -1) break;
        branches.set(key, body.slice(open + 1, close));
        i = close + 1;
    }
    return branches;
}

export function formatMessage(template: string, vars: Vars | undefined, hash?: number): string {
    if (!template.includes("{") && hash === undefined) return template;
    let out = "";
    let i = 0;
    while (i < template.length) {
        const ch = template[i]!;
        if (ch === "#" && hash !== undefined) {
            out += formatNumber(hash);
            i++;
            continue;
        }
        if (ch !== "{") {
            out += ch;
            i++;
            continue;
        }
        const close = matchingBrace(template, i);
        if (close === -1) {
            out += template.slice(i);
            break;
        }
        const inner = template.slice(i + 1, close);
        const comma = inner.indexOf(",");
        const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
        const value = vars?.[name];
        if (comma === -1) {
            // `{name}` sem valor fica como está — nunca apaga texto em silêncio.
            out += value === undefined || value === null ? template.slice(i, close + 1) : String(value);
        } else {
            const rest = inner.slice(comma + 1);
            const comma2 = rest.indexOf(",");
            const kind = rest.slice(0, comma2).trim();
            const branches = parseBranches(rest.slice(comma2 + 1));
            if (kind === "plural") {
                const n = Number(value ?? 0);
                const branch = branches.get(`=${n}`) ?? branches.get(pluralRules.select(n)) ?? branches.get("other") ?? "";
                out += formatMessage(branch, vars, n);
            } else {
                const branch = branches.get(String(value)) ?? branches.get("other") ?? "";
                out += formatMessage(branch, vars, hash);
            }
        }
        i = close + 1;
    }
    return out;
}
