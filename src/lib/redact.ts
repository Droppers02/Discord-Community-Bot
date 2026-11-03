// ─── Segredos nunca chegam aos logs ──────────────────────────────────────────
// CÓPIA de PixelStudio/packages/shared/src/redact.ts (a fonte única). Mudar lá e copiar
// para aqui.
//
// Duas camadas:
//   1. Padrões de segredos conhecidos (token de bot do Discord, chaves da Stripe e da
//      Anthropic, `Bearer …`, password num URL de base de dados/Redis).
//   2. Os VALORES exatos dos segredos que o processo tem no ambiente (tudo o que se chama
//      *TOKEN*, *KEY*, *SECRET*, *PASSWORD* ou *_URL com credenciais) — apanha os que não
//      têm formato reconhecível, como a INTERNAL_API_KEY.
// Aplicado à consola inteira (`installConsoleRedaction`), por isso cobre também o que o
// framework e as bibliotecas escrevem, não só o nosso logger.

const MASK = "[oculto]";

const PATTERNS: Array<[RegExp, string]> = [
    // Token de bot do Discord: três blocos base64url separados por pontos.
    [/\b[A-Za-z\d_-]{24,28}\.[A-Za-z\d_-]{6,7}\.[A-Za-z\d_-]{27,40}\b/g, MASK],
    // Stripe (secretas, restritas, webhooks).
    [/\b(?:sk|rk)_(?:live|test)_[A-Za-z\d]{10,}\b/g, MASK],
    [/\bwhsec_[A-Za-z\d]{10,}\b/g, MASK],
    // Anthropic.
    [/\bsk-ant-[A-Za-z\d_-]{10,}\b/g, MASK],
    // Cabeçalho Authorization.
    [/(\bBearer\s+)[A-Za-z\d._~+/-]{16,}=*/gi, `$1${MASK}`],
    // Credenciais em URLs (postgres://user:PASSWORD@host, rediss://default:PASSWORD@host).
    [/(\b[a-z][a-z\d+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi, "$1***@"],
];

const SECRET_NAME = /(TOKEN|KEY|SECRET|PASSWORD|PASS)S?$|_URL$|(TOKEN|KEY|SECRET)S?_/i;
const MIN_SECRET_LENGTH = 12;

let secretValues: string[] = [];

/**
 * Regista os valores secretos do ambiente para os tapar nos logs. Valores curtos ou que
 * são só URLs sem credenciais ficam de fora (taparíamos texto inocente por todo o lado).
 */
export function registerSecretsFromEnv(env: Record<string, string | undefined>): void {
    const values = new Set<string>();
    for (const [name, raw] of Object.entries(env)) {
        const value = raw?.trim();
        if (!value || value.length < MIN_SECRET_LENGTH || !SECRET_NAME.test(name)) continue;
        if (/^https?:\/\/[^@]*$/i.test(value)) continue; // URL público, sem credenciais
        for (const part of value.split(",")) {
            // Listas `bot:chave,bot:chave` — tapa-se cada chave.
            const secret = part.includes(":") && !part.includes("://") ? part.slice(part.indexOf(":") + 1).trim() : part.trim();
            if (secret.length >= MIN_SECRET_LENGTH) values.add(secret);
        }
    }
    // Os mais compridos primeiro: um segredo que contenha outro é tapado inteiro.
    secretValues = [...values].sort((a, b) => b.length - a.length);
}

/** Texto com todos os segredos conhecidos tapados. */
export function redactSecrets(text: string): string {
    let out = text;
    for (const secret of secretValues) {
        if (out.includes(secret)) out = out.split(secret).join(MASK);
    }
    for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
    return out;
}

function redactArg(arg: unknown): unknown {
    if (typeof arg === "string") return redactSecrets(arg);
    if (arg instanceof Error) {
        const copy = new Error(redactSecrets(arg.message));
        copy.name = arg.name;
        copy.stack = arg.stack ? redactSecrets(arg.stack) : undefined;
        return copy;
    }
    return arg;
}

let installed = false;

/**
 * Passa TODA a escrita na consola pelo `redactSecrets`. Chamar uma vez, o mais cedo
 * possível no arranque (antes do framework começar a escrever).
 */
export function installConsoleRedaction(env: Record<string, string | undefined>): void {
    registerSecretsFromEnv(env);
    if (installed) return;
    installed = true;
    for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) {
        const original = console[method].bind(console);
        console[method] = (...args: unknown[]) => original(...args.map(redactArg));
    }
}
