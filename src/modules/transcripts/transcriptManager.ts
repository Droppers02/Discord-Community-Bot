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

function renderHtml(channel: TextChannel, ticket: TicketRecord, transcriptId: string, messages: Message[]): string {
    const rows = messages.map((message) => {
        const content = message.content || componentText(message);
        const attachments = [...message.attachments.values()].map((attachment) => {
            const isImage = attachment.contentType?.startsWith("image/");
            const name = escapeHtml(attachment.name ?? "ficheiro");
            return isImage
                ? `<a href="${attachment.url}" target="_blank" rel="noreferrer noopener"><img class="attachment" src="${attachment.url}" alt="${name}"></a>`
                : `<a class="file" href="${attachment.url}" target="_blank" rel="noreferrer noopener">📎 ${name}</a>`;
        }).join("");
        const avatar = message.author.displayAvatarURL({ extension: "png", size: 64 });
        const time = message.createdAt.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
        const botTag = message.author.bot ? `<span class="bot">BOT</span>` : "";
        return `<div class="msg">
  <img class="avatar" src="${avatar}" alt="">
  <div class="body">
    <div class="head"><span class="name">${escapeHtml(message.member?.displayName ?? message.author.username)}</span>${botTag}<span class="time">${escapeHtml(time)}</span></div>
    <div class="content">${content ? renderContent(content, message) : `<span class="muted">${escapeHtml(t("[sem texto]"))}</span>`}</div>
    ${attachments ? `<div class="attachments">${attachments}</div>` : ""}
  </div>
</div>`;
    }).join("\n");

    const opened = new Date(ticket.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
    const closed = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
    return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(transcriptId)} · #${escapeHtml(channel.name)}</title>
<style>
:root{--bg:#313338;--panel:#2b2d31;--text:#dbdee1;--muted:#949ba4;--accent:#7c5cff;--mention:rgba(124,92,255,.25)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 "gg sans","Segoe UI",system-ui,sans-serif}
header{background:var(--panel);padding:20px 24px;border-bottom:1px solid #1e1f22}
h1{margin:0 0 6px;font-size:20px}dl{display:flex;flex-wrap:wrap;gap:6px 24px;margin:0;color:var(--muted);font-size:13px}dt{font-weight:600;color:var(--text)}dd{margin:0}
main{padding:12px 16px 40px;max-width:1100px}.msg{display:flex;gap:14px;padding:8px;border-radius:6px}.msg:hover{background:#2e3035}
.avatar{width:40px;height:40px;border-radius:50%;flex:none}.body{min-width:0;flex:1}.head{display:flex;align-items:baseline;gap:8px}
.name{font-weight:600;color:#fff}.time{color:var(--muted);font-size:12px}.bot{background:var(--accent);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px}
.content{word-wrap:break-word;white-space:normal}.muted{color:var(--muted);font-style:italic}code{background:#1e1f22;padding:1px 4px;border-radius:4px}
pre{background:#1e1f22;padding:8px;border-radius:6px;overflow:auto}.mention{background:var(--mention);color:#c9bcff;border-radius:3px;padding:0 2px}
a{color:#00a8fc}.attachments{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.attachment{max-width:min(420px,100%);max-height:320px;border-radius:6px}
.file{display:inline-block;background:var(--panel);padding:8px 12px;border-radius:6px}footer{color:var(--muted);font-size:12px;padding:0 24px 24px}
</style>
</head>
<body>
<header>
<h1>#${escapeHtml(channel.name)}</h1>
<dl>
<div><dt>Transcript</dt><dd>${escapeHtml(transcriptId)}</dd></div>
<div><dt>Categoria</dt><dd>${escapeHtml(ticket.category)}</dd></div>
<div><dt>Criador</dt><dd>${escapeHtml(ticket.owner_tag)} (${escapeHtml(ticket.owner_id)})</dd></div>
<div><dt>Staff</dt><dd>${escapeHtml(ticket.staff_tag ?? "—")}</dd></div>
<div><dt>Aberto</dt><dd>${escapeHtml(opened)}</dd></div>
<div><dt>Fechado</dt><dd>${escapeHtml(closed)}</dd></div>
<div><dt>Mensagens</dt><dd>${messages.length}</dd></div>
</dl>
</header>
<main>
${rows}
</main>
<footer>EPA BOTCHI · as imagens e anexos apontam para o Discord e podem deixar de abrir quando o canal for apagado.</footer>
</body>
</html>`;
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
