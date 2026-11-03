import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

// O @discordjs/rest faz `new Headers(res.headers)` com o que o undici lhe devolve.
// A partir do undici 7 o HTTP/2 ficou LIGADO POR OMISSÃO ("enabled by default", em
// lib/dispatcher/client.js), e as cabeceiras que chegam por h2 trazem agarrado o
// Symbol(sensitiveHeaders) do node:http2 — que o construtor Headers recusa:
//
//   TypeError: Headers constructor: Key Symbol(sensitiveHeaders) in init is a symbol,
//   which cannot be converted to a ByteString.
//
// Isso derruba TODAS as chamadas à API do Discord. Um override de undici sem teto
// (">=6.28.0") resolve para a 8.x e reproduz exatamente isto — foi o que aconteceu.
// Medido com um servidor h2 local sobre TLS+ALPN: na 8.10.2 o símbolo vem e o Headers
// rebenta; na 6.28.1 não vem, mesmo forçando allowH2.
//
// Este teste existe para que a próxima subida de major falhe AQUI, e não em produção.

const require_ = createRequire(import.meta.url);

/** Versão do undici que o @discordjs/rest carrega de facto (pode estar aninhado). */
function versaoUndiciQueORestUsa(): string {
    // Nota: "@discordjs/rest/package.json" NÃO serve — o mapa de exports com curinga
    // transforma-o em dist/strategies/package.json.js. Resolve-se a entrada e caminha-se.
    const entradaRest = require_.resolve("@discordjs/rest");
    const entradaUndici = createRequire(entradaRest).resolve("undici");

    let dir = path.dirname(entradaUndici);
    for (;;) {
        const pkg = path.join(dir, "package.json");
        if (fs.existsSync(pkg)) {
            const conteudo = JSON.parse(fs.readFileSync(pkg, "utf8")) as { name?: string; version?: string };
            if (conteudo.name === "undici" && conteudo.version) return conteudo.version;
        }
        const pai = path.dirname(dir);
        if (pai === dir) throw new Error(`package.json do undici não encontrado a partir de ${entradaUndici}`);
        dir = pai;
    }
}

describe("undici: o major tem de continuar na linha 6", () => {
    it("o undici que o @discordjs/rest carrega é 6.x", () => {
        const versao = versaoUndiciQueORestUsa();
        expect(versao.split(".")[0], `undici resolvido: ${versao}`).toBe("6");
    });
});
