// The bot's visual uses its own application emojis (uploaded from assets/emojis by
// emojiService). Each semantic name below maps to an icon file; until the emoji set is
// synced (or if an upload fails) we fall back to the unicode glyph so the UI never breaks.

const UNICODE_FALLBACK = {
    ticket: "🎟️",
    open: "📨",
    close: "🔒",
    lock: "🔒",
    settings: "⚙️",
    staff: "🧑‍💼",
    user: "👤",
    users: "👥",
    note: "📝",
    id: "🪪",
    rename: "✏️",
    move: "🗂️",
    assign: "👤",
    add: "➕",
    remove: "➖",
    keyboard: "⌨️",
    info: "ℹ️",
    success: "✅",
    error: "⛔",
    warn: "⚠️",
    pending: "⏳",
    hourglass: "⏳",
    clock: "🕒",
    calendar: "📅",
    transcript: "📜",
    chart: "📊",
    report: "🚩",
    shield: "🛡️",
    bug: "🐛",
    star: "⭐",
    arrowLeft: "⬅️",
    arrowRight: "➡️",
    accept: "✅",
    decline: "🟡",
    bell: "🔔",
    folder: "📁",
    key: "🔑",
    flask: "🧪",
    rocket: "🚀",
    unlock: "🔓",
    attach: "📎",
    arrowUp: "⬆️",
    arrowDown: "⬇️",
    home: "🏠",
    // ─── Giveaways / Sugestões / Logs / Anti-spam / Cargos ───────────────────
    gift: "🎁",
    trophy: "🏆",
    crown: "👑",
    megaphone: "📣",
    hammer: "🔨",
    ban: "🔨",
    mute: "🔇",
    timeout: "⏲️",
    link: "🔗",
    globe: "🌐",
    upvote: "⬆️",
    downvote: "⬇️",
    priority: "🔥",
    flame: "🔥",
    message: "💬",
    voice: "🔊",
    role: "🏷️",
    channel: "📺",
    join: "📥",
    leave: "📤",
    plus: "➕",
    minus: "➖",
    heart: "❤️",
    reroll: "🔁",
    trash: "🗑️",
    edit: "✏️",
    // ─── Economia / jogos / perfil (EPA BOTCHI) ───────────────────────────────
    coin: "🪙",
    wallet: "👛",
    bank: "🏦",
    shop: "🛒",
    cart: "🛒",
    moneybag: "💰",
    transfer: "💸",
    receipt: "🧾",
    jigsaw: "🧩",
    dice: "🎲",
    cards: "🃏",
    sparks: "✨",
    lightning: "⚡",
    wand: "🪄",
    question: "❔",
    target: "🎯",
    gamepad: "🎮",
    medal: "🏅",
    pin: "📌",
    mic: "🎙️",
    hidden: "🙈",
    visible: "👀",
    play: "▶️",
    stop: "⏹️",
    bot: "🤖",
    newspaper: "📰",
    sleeping: "😴",
    wrench: "🔧",
    notes: "📝",
} as const;

export type EmojiName = keyof typeof UNICODE_FALLBACK;

// Semantic name → icon file name (in assets/emojis/**). Names not listed here use the
// same string as the icon file name (e.g. "settings" → settings.png).
const ICON_ALIASES: Partial<Record<EmojiName, string>> = {
    ticket: "coupon",
    open: "send",
    close: "lock",
    staff: "user",
    note: "notes",
    rename: "brush",
    move: "route",
    assign: "user",
    transcript: "newspaper",
    error: "cancel",
    arrowLeft: "arrowl",
    arrowRight: "arrowr",
    arrowUp: "arrowu",
    arrowDown: "arrowd",
    accept: "check",
    decline: "warn",
    megaphone: "announcementc",
    ban: "block",
    timeout: "timedout",
    link: "world",
    globe: "world",
    upvote: "up",
    downvote: "down",
    priority: "flame",
    voice: "voicec",
    channel: "textc",
    join: "arrowd",
    leave: "arrowu",
    reroll: "torefresh",
    trash: "trashcan",
    edit: "brush",
};

export interface AppEmojiEntry {
    id: string;
    animated: boolean;
}

// Emojis da aplicação (carregados de assets/emojis pelo emojiService). Um application emoji
// só pode ser usado pela aplicação que o carregou — aqui há só uma, o EPA BOTCHI.
let appEmojis: Map<string, AppEmojiEntry> | null = null;

/** Called by emojiService once the application's emojis are fetched/uploaded. */
export function registerAppEmojis(entries: Map<string, AppEmojiEntry>): void {
    appEmojis = entries;
}

function currentAppEmojis(): Map<string, AppEmojiEntry> | null {
    return appEmojis;
}

/** All registered application emojis (name → entry), sorted by name. For the emoji picker. */
export function listAppEmojis(): Array<{ name: string; animated: boolean }> {
    const appEmojis = currentAppEmojis();
    if (!appEmojis) return [];
    return [...appEmojis.entries()]
        .map(([name, entry]) => ({ name, animated: entry.animated }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function iconNameOf(name: EmojiName): string {
    return ICON_ALIASES[name] ?? name;
}

/** Icon file names the bot actually uses — emojiService only uploads these. */
export function getUsedIconNames(): Set<string> {
    return new Set((Object.keys(UNICODE_FALLBACK) as EmojiName[]).map(iconNameOf));
}

const fallbackMap = UNICODE_FALLBACK as Record<string, string | undefined>;

function resolveIcon(name: string): string {
    return ICON_ALIASES[name as EmojiName] ?? name;
}

/**
 * Formatted emoji string for message content: `<:name:id>` / `<a:name:id>`.
 * Accepts any icon file name (resolved from the bot's application emojis); falls back
 * to a unicode glyph only for the curated semantic names, otherwise "".
 */
export function e(name: EmojiName | string): string {
    const icon = resolveIcon(name);
    const entry = currentAppEmojis()?.get(icon);
    if (entry) return entry.animated ? `<a:${icon}:${entry.id}>` : `<:${icon}:${entry.id}>`;
    return fallbackMap[name] ?? "";
}

/** Emoji object for `.setEmoji()` (button/select), or a unicode fallback string. */
export function ei(name: EmojiName | string): { id: string; name: string; animated: boolean } | string {
    const icon = resolveIcon(name);
    const entry = currentAppEmojis()?.get(icon);
    if (entry) return { id: entry.id, name: icon, animated: entry.animated };
    return fallbackMap[name] ?? icon;
}

// `emoji.success` etc. resolve at access time so the same call sites pick up the custom
// application emojis once they are synced (and fall back to unicode before that).
export const emoji = new Proxy({} as Record<EmojiName, string>, {
    get(_target, prop: string) {
        return e(prop as EmojiName);
    },
});
