import { GuildPremiumTier, type SendableChannels } from "discord.js";
import { t } from "./i18n.js";

// Anexos enviados num formulário (modal) do Discord. O link que vem na interação é
// temporário, por isso os ficheiros são descarregados e voltam a ser enviados para o
// canal — assim ficam no canal e no transcript, como qualquer outra mensagem.
// Cópia IGUAL no PixelFx (src/utils/formAttachments.ts) — mudar nos dois.

const MB = 1024 * 1024;
/** Teto por mensagem, mesmo em servidores com boost: o ficheiro passa pela memória do bot. */
const MAX_REPOST_BYTES = 25 * MB;
const FILES_PER_MESSAGE = 10;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const DISCORD_CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

export interface FormFile {
    name: string;
    url: string;
    size: number;
}

/** Limite de upload de um bot num servidor (depende do nível de boost). */
export function uploadLimitFor(tier: GuildPremiumTier): number {
    if (tier === GuildPremiumTier.Tier3) return 100 * MB;
    if (tier === GuildPremiumTier.Tier2) return 50 * MB;
    return 10 * MB;
}

/** Agrupa os ficheiros em mensagens que cabem no limite; os que não cabem sozinhos ficam de fora. */
export function planBatches<T extends { size: number }>(files: T[], limit: number): { batches: T[][]; tooLarge: T[] } {
    const batches: T[][] = [];
    const tooLarge: T[] = [];
    let current: T[] = [];
    let total = 0;
    for (const file of files) {
        if (file.size > limit) {
            tooLarge.push(file);
            continue;
        }
        if (current.length >= FILES_PER_MESSAGE || total + file.size > limit) {
            batches.push(current);
            current = [];
            total = 0;
        }
        current.push(file);
        total += file.size;
    }
    if (current.length > 0) batches.push(current);
    return { batches, tooLarge };
}

/** Só se descarrega do CDN do Discord — é de lá que vêm os anexos de um modal. */
export function isDiscordCdnUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && DISCORD_CDN_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
}

/** Nome seguro e único para o ficheiro reenviado (mantém a extensão). */
export function safeFileName(name: string, index: number): string {
    const ext = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase();
    const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "anexo";
    return `${index + 1}-${base}${ext ? `.${ext}` : ""}`;
}

async function download(file: FormFile): Promise<Buffer> {
    const response = await fetch(file.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

/**
 * Volta a enviar para o canal os anexos de um formulário, com `heading` na primeira
 * mensagem. Os que não couberem no limite do servidor (ou falharem) ficam listados
 * numa nota, para o membro os enviar à mão. Nunca lança.
 */
export async function repostFormAttachments(channel: SendableChannels, tier: GuildPremiumTier, files: FormFile[], heading: string): Promise<{ posted: number; failed: FormFile[] }> {
    const valid = files.filter((file) => isDiscordCdnUrl(file.url));
    const { batches, tooLarge } = planBatches(valid, Math.min(uploadLimitFor(tier), MAX_REPOST_BYTES));
    const failed: FormFile[] = [...tooLarge];
    let posted = 0;
    let index = 0;

    for (const batch of batches) {
        const start = index;
        index += batch.length;
        try {
            const payload = await Promise.all(batch.map(async (file, i) => ({ attachment: await download(file), name: safeFileName(file.name, start + i) })));
            await channel.send({ content: posted === 0 ? heading : undefined, files: payload, allowedMentions: { parse: [] } });
            posted += batch.length;
        } catch {
            failed.push(...batch);
        }
    }

    if (failed.length > 0) {
        const names = failed.map((file) => `\`${file.name.slice(0, 80)}\` (${(file.size / MB).toFixed(1)} MB)`).join(", ");
        const one = failed.length === 1;
        await channel.send({
            content: `${posted === 0 ? `${heading}\n` : ""}-# ${one ? t("Não deu para guardar no canal: {names}. Envia esse ficheiro aqui diretamente.", { names }) : t("Não deu para guardar no canal: {names}. Envia esses ficheiros aqui diretamente.", { names })}`,
            allowedMentions: { parse: [] },
        }).catch(() => null);
    }
    return { posted, failed };
}
