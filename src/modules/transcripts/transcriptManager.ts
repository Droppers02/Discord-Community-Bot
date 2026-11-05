import { randomBytes } from "node:crypto";
import { AttachmentBuilder, type Message, type TextChannel } from "discord.js";
import { DEFAULT_TRANSCRIPT_PREFIX, normalizeTranscriptPrefix } from "../../lib/branding.js";
import { t } from "../../lib/i18n.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import type { TicketRecord } from "../../types.js";

// Transcripts sem site: ao fechar, o ticket inteiro vira um ficheiro HTML autónomo (abre em
// qualquer browser, sem internet) que segue anexado ao log do fecho. O ficheiro fica guardado
// à espera do log durante alguns minutos — `takeTranscriptFile` entrega-o uma única vez.

const PENDING_TTL_MS = 10 * 60_000;
const MAX_MESSAGES = 5_000;
const pendingFiles = new Map<string, { file: AttachmentBuilder; timer: NodeJS.Timeout }>();

function newTranscriptId(prefix: string): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const segment = (length: number) => [...randomBytes(length)].map((byte) => alphabet[byte % alphabet.length]).join("");
    return `${normalizeTranscriptPrefix(prefix)}-${segment(5)}-${segment(5)}`;
}

async function fetchAllMessages(channel: TextChannel): Promise<Message[]> {
    const messages: Message[] = [];
    let before: string | undefined;
    while (messages.length < MAX_MESSAGES) {
        const batch = await channel.messages.fetch({ limit: 100, before });
        if (batch.size === 0) break;
        messages.push(...batch.values());
        before = batch.last()?.id;
        if (batch.size < 100) break;
    }
    return messages.reverse();
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

/** Markdown básico do Discord → HTML (depois de escapar). Menções ficam legíveis. */
function renderContent(raw: string, message: Message): string {
    let text = escapeHtml(raw);
    text = text.replace(/```(?:[a-z0-9]+)?\n?([\s\S]*?)```/gi, "<pre>$1</pre>");
    text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    text = text.replace(/__([^_\n]+)__/g, "<u>$1</u>");
    text = text.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
    text = text.replace(/&lt;@!?(\d+)&gt;/g, (_m, id: string) => {
        const user = message.mentions.users.get(id);
        return `<span class="mention">@${escapeHtml(user?.username ?? id)}</span>`;
    });
    text = text.replace(/&lt;@&amp;(\d+)&gt;/g, (_m, id: string) => {
        const role = message.guild?.roles.cache.get(id);
        return `<span class="mention">@${escapeHtml(role?.name ?? id)}</span>`;
    });
    text = text.replace(/&lt;#(\d+)&gt;/g, (_m, id: string) => {
        const channel = message.guild?.channels.cache.get(id);
        return `<span class="mention">#${escapeHtml(channel?.name ?? id)}</span>`;
    });
    text = text.replace(/&lt;(a?):(\w+):\d+&gt;/g, ":$2:");
    text = text.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`);
    return text.replaceAll("\n", "<br>");
}

/** Texto de mensagens do bot em Components V2 (que não têm `content`). */
function componentText(message: Message): string {
    const parts: string[] = [];
    const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const value = node as { content?: unknown; components?: unknown[]; component?: unknown };
        if (typeof value.content === "string") parts.push(value.content);
        if (Array.isArray(value.components)) value.components.forEach(walk);
        if (value.component) walk(value.component);
    };
    for (const component of message.components) walk(component.toJSON());
    return parts.join("\n");
}

export interface MessagesHtmlOptions {
    /** Título do separador do browser. */
    title: string;
    /** Título no topo da página. */
    heading: string;
    /** Pares "nome: valor" do cabeçalho. */
    meta: Array<[string, string]>;
    /** Da mais antiga para a mais recente. */
    messages: Message[];
    /** Mostrar o #canal em cada mensagem (cópias com mensagens de vários canais). */
    showChannel?: boolean;
    /** Imagens já descarregadas (id do anexo → data URI): continuam a abrir depois de apagadas. */
    images?: Map<string, string>;
    footer?: string;
}

/** Página HTML autónoma com uma lista de mensagens (transcripts dos tickets e cópias das limpezas). */
export function renderMessagesHtml(options: MessagesHtmlOptions): string {
    const rows = options.messages.map((message) => {
        const content = message.content || componentText(message);
        const files = [...message.attachments.values()].map((attachment) => {
            const isImage = attachment.contentType?.startsWith("image/");
            const name = escapeHtml(attachment.name ?? "ficheiro");
            const src = options.images?.get(attachment.id) ?? attachment.url;
            return isImage
                ? `<a href="${attachment.url}" target="_blank" rel="noreferrer noopener"><img class="attachment" src="${src}" alt="${name}"></a>`
                : `<a class="file" href="${attachment.url}" target="_blank" rel="noreferrer noopener">📎 ${name}</a>`;
        });
        const stickers = [...message.stickers.values()].map((sticker) => `<span class="file">🏷️ ${escapeHtml(sticker.name)}</span>`);
        const extras = [...files, ...stickers].join("");
        const embeds = message.embeds.map((embed) => {
            const parts = [
                embed.title ? `<strong>${escapeHtml(embed.title)}</strong>` : "",
                embed.description ? renderContent(embed.description, message) : "",
                embed.url ? `<a href="${escapeHtml(embed.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(embed.url)}</a>` : "",
            ].filter(Boolean);
            return parts.length ? `<div class="embed">${parts.join("<br>")}</div>` : "";
        }).join("");
        const avatar = message.author.displayAvatarURL({ extension: "png", size: 64 });
        const time = message.createdAt.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
        const botTag = message.author.bot ? `<span class="bot">BOT</span>` : "";
        const channelName = options.showChannel && "name" in message.channel ? String(message.channel.name) : null;
        const channelTag = channelName ? `<span class="chan">#${escapeHtml(channelName)}</span>` : "";
        const empty = embeds || extras ? "" : `<span class="muted">${escapeHtml(t("[sem texto]"))}</span>`;
        return `<div class="msg">
  <img class="avatar" src="${avatar}" alt="">
  <div class="body">
    <div class="head"><span class="name">${escapeHtml(message.member?.displayName ?? message.author.username)}</span>${botTag}<span class="time">${escapeHtml(time)}</span>${channelTag}<span class="id">${escapeHtml(message.author.username)} · ${message.author.id}</span></div>
    <div class="content">${content ? renderContent(content, message) : empty}</div>
    ${embeds}
    ${extras ? `<div class="attachments">${extras}</div>` : ""}
  </div>
</div>`;
    }).join("\n");

    const meta = options.meta.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("\n");
    return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(options.title)}</title>
<style>
:root{--bg:#313338;--panel:#2b2d31;--text:#dbdee1;--muted:#949ba4;--accent:#7c5cff;--mention:rgba(124,92,255,.25)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 "gg sans","Segoe UI",system-ui,sans-serif}
header{background:var(--panel);padding:20px 24px;border-bottom:1px solid #1e1f22}
h1{margin:0 0 6px;font-size:20px}dl{display:flex;flex-wrap:wrap;gap:6px 24px;margin:0;color:var(--muted);font-size:13px}dt{font-weight:600;color:var(--text)}dd{margin:0}
main{padding:12px 16px 40px;max-width:1100px}.msg{display:flex;gap:14px;padding:8px;border-radius:6px}.msg:hover{background:#2e3035}
.avatar{width:40px;height:40px;border-radius:50%;flex:none}.body{min-width:0;flex:1}.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
.name{font-weight:600;color:#fff}.time,.id{color:var(--muted);font-size:12px}.chan{color:#c9bcff;font-size:12px}.bot{background:var(--accent);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px}
.content{word-wrap:break-word;white-space:normal}.muted{color:var(--muted);font-style:italic}code{background:#1e1f22;padding:1px 4px;border-radius:4px}
pre{background:#1e1f22;padding:8px;border-radius:6px;overflow:auto}.mention{background:var(--mention);color:#c9bcff;border-radius:3px;padding:0 2px}
.embed{border-left:4px solid var(--accent);background:var(--panel);padding:8px 12px;border-radius:4px;margin-top:6px;max-width:560px;word-wrap:break-word}
a{color:#00a8fc}.attachments{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.attachment{max-width:min(420px,100%);max-height:320px;border-radius:6px}
.file{display:inline-block;background:var(--panel);padding:8px 12px;border-radius:6px}footer{color:var(--muted);font-size:12px;padding:0 24px 24px}
</style>
</head>
<body>
<header>
<h1>${escapeHtml(options.heading)}</h1>
<dl>
${meta}
</dl>
</header>
<main>
${rows}
</main>
<footer>${escapeHtml(options.footer ?? "EPA BOTCHI")}</footer>
</body>
</html>`;
}

function renderHtml(channel: TextChannel, ticket: TicketRecord, transcriptId: string, messages: Message[]): string {
    const lisbon = (value: string | number | Date) => new Date(value).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
    return renderMessagesHtml({
        title: `${transcriptId} · #${channel.name}`,
        heading: `#${channel.name}`,
        meta: [
            ["Transcript", transcriptId],
            ["Categoria", ticket.category],
            ["Criador", `${ticket.owner_tag} (${ticket.owner_id})`],
            ["Staff", ticket.staff_tag ?? "—"],
            ["Aberto", lisbon(ticket.created_at)],
            ["Fechado", lisbon(Date.now())],
            ["Mensagens", String(messages.length)],
        ],
        messages,
        footer: "EPA BOTCHI · as imagens e anexos apontam para o Discord e podem deixar de abrir quando o canal for apagado.",
    });
}

/**
 * Gera o transcript HTML do canal e guarda-o para o log do fecho. Devolve o ID do transcript
 * (fica no registo do ticket). Uma falha nunca impede o fecho: devolve null.
 */
export async function generateTranscript(channel: TextChannel, ticket: TicketRecord): Promise<string> {
    const config = await ensureGuildConfig(ticket.guild_id);
    const transcriptId = newTranscriptId(config.transcript_prefix ?? DEFAULT_TRANSCRIPT_PREFIX);
    const messages = await fetchAllMessages(channel);
    const html = renderHtml(channel, ticket, transcriptId, messages);
    const file = new AttachmentBuilder(Buffer.from(html, "utf8"), { name: `${transcriptId.toLowerCase()}.html`, description: `Transcript ${transcriptId}` });
    const timer = setTimeout(() => pendingFiles.delete(transcriptId), PENDING_TTL_MS);
    timer.unref?.();
    pendingFiles.set(transcriptId, { file, timer });
    return transcriptId;
}

/** O ficheiro do transcript (uma vez só), para anexar ao log do fecho. */
export function takeTranscriptFile(transcriptId: string | null | undefined): AttachmentBuilder | null {
    if (!transcriptId) return null;
    const entry = pendingFiles.get(transcriptId);
    if (!entry) return null;
    clearTimeout(entry.timer);
    pendingFiles.delete(transcriptId);
    return entry.file;
}
