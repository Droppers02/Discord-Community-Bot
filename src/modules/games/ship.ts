import { createHash, randomUUID } from "node:crypto";
import { AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type ButtonInteraction, type GuildMember } from "discord.js";
import { createContainer, createMediaGallery, Separator, type ContainerPlusBuilder } from "@magicyan/discord";
import { errorContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { getFriendship, marriageOf } from "../../repositories/socialRepository.js";
import { lisbonDay } from "../economy/economyService.js";
import { plainName, renderShipImage } from "./shipImage.js";

// /ship — compatibilidade entre dois membros. O resultado é o mesmo para o mesmo par durante o
// dia (o amor muda à meia-noite!), por isso não dá para "rolar até dar 100". A administração pode
// forçar a percentagem para a brincadeira. Os casamentos e amizades do bot também contam.

const IMAGE_NAME = "ship.png";

interface Tier {
    min: number;
    color: number;
    emoji: string;
    badge: string;
    verdicts: string[];
    predictions: string[];
}

const TIERS: Tier[] = [
    {
        min: 95, color: 0xff2d7a, emoji: "💞", badge: "💍 Material de casamento",
        verdicts: ["**Almas gémeas!** Marquem já a data, o bot quer ser padrinho. 💒", "Isto já nem é ship, é destino. ✨", "Os astros alinharam-se e o servidor inteiro sente."],
        predictions: ["vão ter 3 gatos, 1 cão e um grupo de WhatsApp só para os fotografar 🐱🐱🐱🐶", "casamento em Sintra, copo-d'água no Algarve 💒", "vão discutir quem ama mais e os dois vão ganhar 🥹"],
    },
    {
        min: 80, color: 0xff4f9a, emoji: "💖", badge: "👑 Casal goals",
        verdicts: ["Muito compatíveis! Há futuro aqui. 💘", "Química de sobra — só falta um de vocês ter coragem.", "O chat todo já shippa, só vocês é que não sabem."],
        predictions: ["primeiras férias a dois e 400 fotos do pôr do sol 🏖️", "vão adotar uma planta e ela vai sobreviver 🪴", "vão começar a acabar as frases um do outro 🗣️"],
    },
    {
        min: 65, color: 0xff7a85, emoji: "💗", badge: "💘 Pombinhos",
        verdicts: ["Boa química! E que tal um date? 😉", "Há faísca — é só não a apagarem com mensagens às 4 da manhã.", "Têm tudo para dar certo, se um deles responder às mensagens."],
        predictions: ["primeiro jantar romântico, segundo jantar já em pijama 🍝", "vão ser aquele casal que joga em duo 🎮", "um vai roubar o casaco do outro e nunca mais devolve 🧥"],
    },
    {
        min: 50, color: 0xffb347, emoji: "💛", badge: "🤝 Potencial casal",
        verdicts: ["Há potencial... com esforço pode funcionar! 💪", "Meio caminho andado — a outra metade é coragem.", "Nem sim nem não, antes pelo contrário."],
        predictions: ["talvez amigos muito próximos 👥", "vão rir muito juntos e depois logo se vê 😅", "o bot volta a perguntar daqui a um ano 📅"],
    },
    {
        min: 30, color: 0x5d9cec, emoji: "💙", badge: "👋 Friendzone",
        verdicts: ["Melhor ficarem como amigos... 🫂", "Bons parceiros de jogo, péssimos namorados.", "Isto tem cheiro a friendzone de luxo."],
        predictions: ["vão rir-se muito deste ship 😂", "padrinhos do casamento de outra pessoa 🤵", "duo imbatível no quiz do servidor 🧠"],
    },
    {
        min: 1, color: 0x8b8f99, emoji: "💔", badge: "😬 Constrangedor",
        verdicts: ["Incompatíveis... aceitem e sigam em frente. 🚶", "Nem com muita sorte. 🍀❌", "O bot fez as contas três vezes. Deu sempre mal."],
        predictions: ["nem se vão lembrar disto 🤷", "cada um no seu canal de voz 🎧", "vão fingir que não viram este ship 👀"],
    },
    {
        min: 0, color: 0x2b2d31, emoji: "☠️", badge: "⚠️ Zona de perigo",
        verdicts: ["**EVITEM-SE A TODO O CUSTO!** 🚨", "Este ship foi denunciado à Proteção Civil.", "Erro crítico de compatibilidade. Reiniciem o universo."],
        predictions: ["em continentes diferentes... esperemos 🌍", "um pede ban do outro 🔨", "o bot vai fingir que este ship nunca existiu 🫣"],
    },
];

const DATE_SPOTS = [
    "um pôr do sol no Miradouro da Senhora do Monte 🌅", "um passeio na Ribeira do Porto e francesinha a seguir 🥪",
    "pastéis de nata em Belém (o segundo é obrigatório) 🥧", "uma tarde na Costa da Caparica 🏖️", "subir a Serra da Estrela e fazer um boneco de neve ☃️",
    "um passeio de bicicleta em Aveiro 🚲", "um jantar com vista no Castelo de São Jorge 🏰", "Sintra, Pena e travesseiros da Piriquita 🍰",
    "uma noite de jogos de tabuleiro com pipocas 🎲", "karaoke a dois (o bot não se responsabiliza) 🎤", "uma escape room — teste de confiança 🔐",
    "um piquenique no Gerês 🌲", "cinema e partilhar as pipocas sem discutir 🍿", "uma maratona de séries até às 4 da manhã 📺",
];

const SONGS = [
    "Amar pelos dois — Salvador Sobral 🎻", "Perfect — Ed Sheeran 💍", "Ai Se Eu Te Pego — Michel Teló 💃", "All of Me — John Legend 🎹",
    "Até ao Fim — Plutónio 🎤", "Can't Help Falling in Love — Elvis 🕺", "Shallow — Lady Gaga & Bradley Cooper 🌊", "A Thousand Years — Christina Perri 🕰️",
    "Despacito — Luis Fonsi 🌴", "Never Gonna Give You Up — Rick Astley (vocês foram rickrollados) 🕺", "Flowers — Miley Cyrus (sinal de alerta) 🌸",
    "Sem Ti — Calema 🎶", "Lisboa Menina e Moça — Carlos do Carmo 🏙️", "Bohemian Rhapsody — Queen (é complicado) 🎸",
];

const TIPS = [
    "Mandem memes um ao outro — é a base de qualquer relação moderna 📱", "Joguem em duo e vejam quem culpa quem quando perdem 🎮",
    "Levem-se a jantar à luz das velas 🕯️", "Cozinhem juntos (e alguém lava a loiça) 👩‍🍳", "Respondam às mensagens em menos de 3 dias ⏱️",
    "Escolham um filme sem demorar 45 minutos 🎬", "Partilhem a password da Netflix — é compromisso sério 🔑", "Sejam sinceros: quem é que ressona? 😴",
    "Um café a meio da tarde resolve tudo ☕", "Façam uma playlist a dois 🎧", "Netflix and chill? 📺😏", "Não discutam sobre ananás na pizza 🍍🍕",
];

const ATTRIBUTES = [
    { key: "quimica", icon: "🧪", label: "Química" },
    { key: "atracao", icon: "✨", label: "Atração" },
    { key: "humor", icon: "😂", label: "Humor" },
    { key: "conversa", icon: "💬", label: "Conversa" },
    { key: "confianca", icon: "🤝", label: "Confiança" },
    { key: "futuro", icon: "🔮", label: "Futuro" },
    { key: "ciumes", icon: "😤", label: "Ciúmes" },
] as const;

export interface ShipResult {
    score: number;
    attributes: Array<{ icon: string; label: string; value: number }>;
    tier: Tier;
    verdict: string;
    prediction: string;
    dateSpot: string;
    song: string;
    tip: string;
    shipName: string;
    shipNumber: number;
    notes: string[];
    seed: number;
}

function hashBytes(...parts: string[]): Buffer {
    return createHash("sha256").update(`epa-ship:${parts.join(":")}`).digest();
}

/** Percentagem base do par para um dia (igual nos dois sentidos). */
export function shipScore(a: string, b: string, day = lisbonDay(Date.now())): number {
    const [first, second] = [a, b].sort();
    return hashBytes(first!, second!, day).readUInt16BE(0) % 101;
}

function lastWord(name: string): string {
    const words = plainName(name).split(" ").filter((word) => word.length >= 3);
    return words.at(-1) ?? plainName(name);
}

/** "Lord dos Chatos" + "Lorda das Pipas" → "Chapas". */
export function shipName(a: string, b: string): string {
    const left = lastWord(a);
    const right = lastWord(b);
    const name = `${left.slice(0, Math.ceil(left.length / 2))}${right.slice(Math.floor(right.length / 2)).toLowerCase()}`;
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function pick<T>(list: readonly T[], byte: number): T {
    return list[byte % list.length]!;
}

export async function computeShip(a: GuildMember, b: GuildMember, forced: number | null): Promise<ShipResult> {
    const day = lisbonDay(Date.now());
    const [first, second] = [a.id, b.id].sort();
    const bytes = hashBytes(first!, second!, day);
    let score = shipScore(a.id, b.id, day);
    const notes: string[] = [];

    // Easter eggs e o que o bot sabe da vida deles.
    if (a.id === b.id) {
        score = 100;
        notes.push(t("🪞 Amor-próprio é o mais importante. 💅"));
    } else if (a.user.bot || b.user.bot) {
        score = 0;
        notes.push(t("🤖 Erro 404: sentimentos não encontrados. O bot só ama o servidor."));
    } else {
        const [marriageA, marriageB, friendship] = await Promise.all([marriageOf(a.guild.id, a.id), marriageOf(a.guild.id, b.id), getFriendship(a.guild.id, a.id, b.id)]);
        if (marriageA?.partner === b.id) {
            score = Math.max(score, 95);
            notes.push(t("💍 Já são casados no EPA — o bot abençoa esta união."));
        } else {
            if (friendship?.status === "accepted") {
                score = Math.min(100, score + 10);
                notes.push(t("🤝 São amigos no EPA (+10%)."));
            }
            for (const [member, marriage] of [[a, marriageA], [b, marriageB]] as const) {
                if (marriage) {
                    score = Math.max(0, score - 15);
                    notes.push(t("👀 {user} é casado(a) com {partner}... isto é traição? (−15%)", { user: member.displayName, partner: `<@${marriage.partner}>` }));
                }
            }
        }
    }
    if (forced !== null) score = forced;
    if (score === 69) notes.push(t("😏 Nice."));
    if (score === 42) notes.push(t("🌌 A resposta para a vida, o universo e tudo o resto."));
    if (score === 13) notes.push(t("🐈‍⬛ Número do azar... cuidado com os gatos pretos."));
    if (score === 100 && a.id !== b.id) notes.push(t("💯 **PERFECT MATCH!** O servidor inteiro é testemunha."));

    // Atributos coerentes com a percentagem (à volta dela), mas cada um com a sua personalidade.
    const attributes = ATTRIBUTES.map((attribute, i) => {
        const swing = ((bytes[4 + i]! / 255) * 70) - 35;
        const base = attribute.key === "ciumes" ? 100 - score : score;
        return { icon: attribute.icon, label: attribute.label, value: Math.max(0, Math.min(100, Math.round(base + swing))) };
    });
    const tier = TIERS.find((entry) => score >= entry.min) ?? TIERS.at(-1)!;
    return {
        score,
        attributes,
        tier,
        verdict: pick(tier.verdicts, bytes[12]!),
        prediction: pick(tier.predictions, bytes[13]!),
        dateSpot: pick(DATE_SPOTS, bytes[14]!),
        song: pick(SONGS, bytes[15]!),
        tip: pick(TIPS, bytes[16]!),
        shipName: a.id === b.id ? plainName(a.displayName) : shipName(a.displayName, b.displayName),
        shipNumber: bytes.readUInt16BE(18) % 9000 + 1000,
        notes,
        seed: bytes.readUInt32BE(20),
    };
}

function bar(value: number, width = 10): string {
    const filled = Math.round((value / 100) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
}

// ─── Votação ─────────────────────────────────────────────────────────────────
// O servidor vota se aprova o casal. Fica em memória durante 24 h (depois de um reinício os
// botões avisam que a votação fechou).

interface ShipVotes { a: string; b: string; score: number; name: string; up: Set<string>; down: Set<string>; expires: number; container: ContainerPlusBuilder }
const votes = new Map<string, ShipVotes>();
const VOTE_TTL_MS = 24 * 3_600_000;
const MAX_POLLS = 500;

function voteRow(id: string, up: number, down: number) {
    return row(
        new ButtonBuilder().setCustomId(`shipv/${id}/up`).setLabel(t("Aprovo ({n})", { n: up })).setEmoji("💖").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`shipv/${id}/down`).setLabel(t("Recuso ({n})", { n: down })).setEmoji("💔").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`shipv/${id}/stats`).setLabel(t("Ver votos")).setEmoji("📊").setStyle(ButtonStyle.Secondary),
    );
}

function rememberPoll(id: string, entry: ShipVotes): void {
    const now = Date.now();
    for (const [key, poll] of votes) if (poll.expires < now) votes.delete(key);
    while (votes.size >= MAX_POLLS) {
        const oldest = votes.keys().next().value;
        if (oldest === undefined) break;
        votes.delete(oldest);
    }
    votes.set(id, entry);
}

/** O ship completo: container, imagem e botões de votação. */
export async function buildShipMessage(a: GuildMember, b: GuildMember, forced: number | null, requestedBy: GuildMember): Promise<{ container: ContainerPlusBuilder; files: AttachmentBuilder[] }> {
    const result = await computeShip(a, b, forced);
    const image = await renderShipImage({
        shipName: result.shipName,
        nameA: plainName(a.displayName),
        nameB: plainName(b.displayName),
        avatarA: a.displayAvatarURL({ extension: "png", size: 256 }),
        avatarB: b.displayAvatarURL({ extension: "png", size: 256 }),
        score: result.score,
        seed: result.seed,
    });
    const id = randomUUID().replaceAll("-", "").slice(0, 12);

    const header = [
        `## ${result.tier.emoji} ${t("Ship: {name}", { name: result.shipName })}`,
        a.id === b.id ? `${a} 🪞 ${b}` : `${a} ❤️ ${b}`,
        `**${t(result.tier.badge)}**`,
        ...result.notes.map((note) => `-# ${note}`),
    ].join("\n");
    const compat = [
        `### 💖 ${t("Compatibilidade")}`,
        `\`\`\`[${bar(result.score, 20)}] ${result.score}%\`\`\``,
    ].join("\n");
    const analysis = [
        `### 📊 ${t("Análise detalhada")}`,
        ...result.attributes.map((attribute) => `${attribute.icon} **${t(attribute.label)}** \`${bar(attribute.value)}\` ${attribute.value}%`),
    ].join("\n");
    const story = [
        `### 💬 ${t("Veredito")}`,
        t(result.verdict),
        `### 🔮 ${t("Previsão para {year}", { year: new Date().getFullYear() + 1 })}`,
        t(result.prediction),
        `### 📍 ${t("Primeiro encontro ideal")}`,
        t(result.dateSpot),
        `### 🎵 ${t("Música do casal")}`,
        t(result.song),
        `### 💝 ${t("Dica do bot")}`,
        `💡 ${t(result.tip)}`,
    ].join("\n");
    const footer = `-# ✨ ${t("Pedido por {user} · Ship #{n} · o amor muda todos os dias à meia-noite", { user: requestedBy.displayName, n: result.shipNumber })}`;

    const files = image ? [new AttachmentBuilder(image, { name: IMAGE_NAME, description: t("Ship de {a} e {b}", { a: plainName(a.displayName), b: plainName(b.displayName) }) })] : [];
    const container = createContainer(
        result.tier.color,
        header,
        ...(image ? [createMediaGallery(`attachment://${IMAGE_NAME}`)] : []),
        compat,
        Separator.Default,
        analysis,
        Separator.Default,
        story,
        Separator.Default,
        footer,
        voteRow(id, 0, 0),
    );
    rememberPoll(id, { a: a.id, b: b.id, score: result.score, name: result.shipName, up: new Set(), down: new Set(), expires: Date.now() + VOTE_TTL_MS, container });
    return { container, files };
}

/** Aplica um voto: carregar outra vez no mesmo botão retira o voto; no outro, troca. */
export function applyShipVote(up: Set<string>, down: Set<string>, userId: string, choice: "up" | "down"): "added" | "removed" | "switched" {
    const [mine, other] = choice === "up" ? [up, down] : [down, up];
    if (mine.has(userId)) {
        mine.delete(userId);
        return "removed";
    }
    const switched = other.delete(userId);
    mine.add(userId);
    return switched ? "switched" : "added";
}

function percent(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0;
}

function voterList(ids: Set<string>): string {
    if (!ids.size) return `-# ${t("ninguém ainda")}`;
    const list = [...ids].slice(0, 15).map((id) => `<@${id}>`).join(", ");
    return ids.size > 15 ? `${list} ${t("e mais {n}", { n: ids.size - 15 })}` : list;
}

function statsContainer(poll: ShipVotes): ContainerPlusBuilder {
    const total = poll.up.size + poll.down.size;
    const approval = percent(poll.up.size, total);
    let crowd = t("Ainda ninguém votou — sê o primeiro! 🗳️");
    if (total) {
        if (approval >= 75) crowd = t("O povo **shippa** forte! 💒");
        else if (approval >= 50) crowd = t("O povo até aprova... com reservas. 🤔");
        else if (approval >= 25) crowd = t("O povo não está convencido. 😬");
        else crowd = t("O povo pede a separação imediata. 🚫");
    }
    let agreement = "";
    if (total) {
        if (Math.abs(approval - poll.score) <= 15) agreement = t("O bot e o povo estão de acordo. 🤝");
        else if (approval > poll.score) agreement = t("O povo acredita mais neste casal do que o bot! 💪");
        else agreement = t("O bot acredita mais neste casal do que o povo. 🤖💘");
    }
    return createContainer(
        approval >= 50 || !total ? 0xff4f9a : 0x5d9cec,
        [
            `## 📊 ${t("Votos do ship {name}", { name: poll.name })}`,
            `<@${poll.a}> ❤️ <@${poll.b}>`,
            `\`\`\`[${bar(approval, 20)}] ${t("{n}% aprovam", { n: approval })}\`\`\``,
            `💖 **${t("Aprovam")}** — ${poll.up.size} (${approval}%)`,
            voterList(poll.up),
            `💔 **${t("Recusam")}** — ${poll.down.size} (${total ? 100 - approval : 0}%)`,
            voterList(poll.down),
        ].join("\n"),
        Separator.Default,
        [`🤖 ${t("Bot: **{score}%** · Povo: **{approval}%** ({total, plural, one {# voto} other {# votos}})", { score: poll.score, approval, total })}`, crowd, agreement].filter(Boolean).join("\n"),
    );
}

export async function handleShipVote(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const poll = votes.get(id);
    if (!poll || poll.expires < Date.now()) {
        return void interaction.reply({ components: [errorContainer(t("Esta votação já fechou (dura 24 horas). Faz outro `/ship`! 💘"))], flags: CV2_FLAG | MessageFlags.Ephemeral });
    }
    if (action === "stats") {
        return void interaction.reply({ components: [statsContainer(poll)], flags: CV2_FLAG | MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    if (action !== "up" && action !== "down") return void interaction.deferUpdate();
    applyShipVote(poll.up, poll.down, interaction.user.id, action);
    poll.container.spliceComponents(poll.container.components.length - 1, 1, voteRow(id, poll.up.size, poll.down.size));
    // Sem `files`: a imagem que já está na mensagem continua a ser usada (attachment://ship.png).
    await interaction.update({ components: [poll.container], allowedMentions: { parse: [] } });
}

