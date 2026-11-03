import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";
import { registerAppEmojis, type AppEmojiEntry } from "../lib/emojis.js";
import { logger } from "../lib/logger.js";

// Os ícones vivem em assets/emojis/<categoria>/<nome>.png|gif — o nome do ficheiro é o nome do
// emoji. Procura-se a pasta a partir da raiz do projeto (cwd) e, em alternativa, a partir deste
// ficheiro (build/services → ../../assets), para funcionar em dev, no build e no Docker.
function resolveIconsDir(): string | null {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(process.cwd(), "assets", "emojis"),
        join(here, "..", "..", "assets", "emojis"),
    ];
    return candidates.find((dir) => existsSync(dir)) ?? null;
}

function sanitizeEmojiName(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
}

// assets/emojis/** → { nome: { path, animated } }
async function buildIconFileMap(iconsDir: string): Promise<Map<string, { path: string; animated: boolean }>> {
    const map = new Map<string, { path: string; animated: boolean }>();
    const categories = await readdir(iconsDir, { withFileTypes: true }).catch(() => []);
    for (const category of categories) {
        if (!category.isDirectory()) continue;
        const files = await readdir(join(iconsDir, category.name)).catch(() => []);
        for (const file of files) {
            if (!/\.(png|gif|webp|jpe?g)$/i.test(file)) continue;
            const name = sanitizeEmojiName(file.replace(/\.[^.]+$/, ""));
            if (!name || name.length < 2) continue;
            if (!map.has(name)) map.set(name, { path: join(iconsDir, category.name, file), animated: /\.gif$/i.test(file) });
        }
    }
    return map;
}

// Uma aplicação pode ter até 2000 emojis; o conjunto completo tem ~240.
async function uploadMissing(client: Client<true>, entries: Map<string, AppEmojiEntry>): Promise<void> {
    const iconsDir = resolveIconsDir();
    if (!iconsDir) {
        logger.warn("Pasta assets/emojis não encontrada — os painéis usam emojis unicode até ser enviada.");
        return;
    }
    const fileMap = await buildIconFileMap(iconsDir);
    const missing = [...fileMap].filter(([name]) => !entries.has(name));
    if (!missing.length) return;
    logger.info(`Emojis da aplicação: a enviar ${missing.length} em falta…`);
    let created = 0;
    for (const [name, info] of missing) {
        try {
            const emoji = await client.application.emojis.create({ attachment: info.path, name });
            entries.set(name, { id: emoji.id, animated: emoji.animated ?? info.animated });
            created += 1;
        } catch (err) {
            logger.warn(`Falha a criar o emoji "${name}": ${err instanceof Error ? err.message : "erro"}`);
        }
    }
    logger.info(`Emojis da aplicação: ${created} novo(s) enviado(s) (${entries.size} disponíveis).`);
}

/**
 * Garante que a aplicação tem TODOS os ícones de assets/emojis como application emojis e regista
 * o mapa nome→id para os painéis CV2. Os que já existem ficam disponíveis de imediato; os que
 * faltam são enviados em segundo plano — o `entries` é o mesmo Map registado, por isso o conjunto
 * completa-se sozinho. Idempotente: nos arranques seguintes não envia nada.
 */
export async function syncApplicationEmojis(client: Client<true>): Promise<void> {
    try {
        await client.application.emojis.fetch();
        const entries = new Map<string, AppEmojiEntry>();
        for (const emoji of client.application.emojis.cache.values()) {
            if (emoji.name) entries.set(emoji.name, { id: emoji.id, animated: emoji.animated ?? false });
        }
        registerAppEmojis(entries);
        void uploadMissing(client, entries).catch((err) => logger.error("Falha ao sincronizar os emojis da aplicação:", err));
    } catch (err) {
        logger.error("Falha ao obter os emojis da aplicação:", err);
    }
}
