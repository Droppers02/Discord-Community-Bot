import { tk } from "../../lib/i18n.js";
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CONFIGURAÇÃO DO ANTI-SPAM (afinação no código)                            ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  Adaptado do Purple Discord AntiSpam (Franco / purplecoders).             ║
 * ║                                                                            ║
 * ║  Os valores BÁSICOS (ativar, canal de logs, cargos isentos, whitelist,    ║
 * ║  limiar, flood, idade mínima de conta) ajustam-se em `/config → Anti-spam`.║
 * ║  Os valores AVANÇADOS de pontuação ficam AQUI — edita-os se houver falsos  ║
 * ║  positivos ou para apertar a deteção. Pontuação alvo: 0–100; quando a soma ║
 * ║  iguala/passa o limiar (default 60) a mensagem é apagada e aplica-se       ║
 * ║  timeout progressivo.                                                      ║
 * ║                                                                            ║
 * ║  ALVO PRINCIPAL: self-bots que entram, escrevem 1 mensagem com um LINK +   ║
 * ║  IMAGENS e desaparecem. Por isso o combo "link + média" pesa muito, mas    ║
 * ║  um link sozinho OU imagens sozinhas NÃO disparam (evita falsos positivos).║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

export interface SpamPattern {
    /** Marca o padrão de convite Discord para poder ser ignorado se allow_invites=true. */
    key?: "discord_invite";
    name: string;
    regex: RegExp;
    score: number;
}

// Padrões de texto típicos de scam/self-bot. Cada match soma `score`.
export const SPAM_PATTERNS: SpamPattern[] = [
    { key: "discord_invite", name: tk("Convite Discord externo"), regex: /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/i, score: 80 },
    { name: tk("Crypto / NFT / Airdrop"), regex: /\b(airdrop|nft|free\s*crypto|pump|giveaway.*token|mint\s*now|claim.*token|presale)\b/i, score: 70 },
    { name: tk("Golpe estilo \"Elon Musk\""), regex: /\b(elon\s*musk|elon)\b.{0,60}\b(crypto|bitcoin|btc|eth|token|double|investment)\b/i, score: 90 },
    { name: tk("Spam NSFW / Cam"), regex: /\b(cam\s*girl|camgirl|nsfw|onlyfans|only\s*fans|join.*cam|cam.*discord|teen|leak(?:ed)?\s*nudes?)\b/i, score: 95 },
    { name: tk("Link encurtado suspeito"), regex: /\b(bit\.ly|tinyurl\.com|t\.co|rb\.gy|cutt\.ly|short\.gg|is\.gd)\b.{0,40}\b(free|earn|join|click|nitro)\b/i, score: 75 },
    { name: tk("Promessa de dinheiro"), regex: /\b(earn|ganhe|ganhar|lucre|free\s*nitro|steam\s*gift)\b.{0,30}(\$|USD|BRL|R\$|reais|euros?|€)/i, score: 65 },
];

// Extensões consideradas "média" (imagens/vídeos). Também detetamos pelo contentType.
export const MEDIA_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi", ".webm", ".mkv"]);

export const SCORES = {
    /** Link externo (fora da whitelist). */
    externalLink: 55,
    /** Menção a @everyone / @here. */
    mentionEveryone: 100,
    /** A partir de `minMentions` utilizadores mencionados. */
    multiMention: 70,
    minMentions: 3,
    /** A partir de `minMedia` anexos de média (sozinhos — mantém abaixo do limiar para não punir álbuns normais). */
    mediaMulti: 50,
    minMedia: 2,
    /** Texto fortemente ofuscado/símbolos (tentativa de bypass). */
    obfuscation: 20,
} as const;

// ── Bónus por COMBINAÇÕES (é aqui que se apanha o self-bot) ───────────────────
export const COMBO_SCORES = {
    /** Menção massiva + convite Discord. */
    mentionInvite: 30,
    /** Menção massiva + múltiplos anexos. */
    mentionMedia: 30,
    /** Múltiplos anexos + convite Discord. */
    mediaInvite: 30,
    /** MELHORIA: link externo + QUALQUER média (1+). Este é o padrão exato do self-bot. */
    linkMedia: 45,
    /** MELHORIA: conta nova/suspeita + (link externo OU média). Reforça o alvo sem punir membros antigos. */
    newAccountPayload: 25,
} as const;

// ── Flood / mensagens repetidas (dentro da janela configurável) ───────────────
export const FLOOD = {
    /** Nº de mensagens idênticas no mesmo canal para disparar. */
    duplicateThreshold: 3,
    /** Nº de mensagens muito parecidas no mesmo canal para disparar. */
    similarThreshold: 3,
    /** Limiar de semelhança (0–1) para considerar duas mensagens "quase iguais". */
    similarityRatio: 0.9,
    /** Mesmo conteúdo espalhado por ≥ N canais. */
    crossChannelMinChannels: 2,
    /** ... quando há no máximo este nº de conteúdos distintos (i.e. repetição). */
    crossChannelMaxDistinct: 2,
    /** Volume alto: ≥ N canais e ≥ M mensagens na janela. */
    highVolumeChannels: 3,
    highVolumeMessages: 4,
    /** Boost de score quando há flood (garante que passa o limiar). */
    scoreBoost: 85,
} as const;

// ── Deteção de raid (vaga de contas novas) ────────────────────────────────────
export const RAID = {
    /** Janela para contar contas novas a enviar mensagens. */
    windowSec: 10,
    /** Nº de contas novas suspeitas distintas para considerar raid. */
    userThreshold: 5,
    /** Tempo após a entrada em que a conta ainda é "recém-chegada". */
    joinGraceSec: 900,
    /** Cooldown entre alertas de raid por servidor. */
    cooldownSec: 30,
    /** Boost de score aplicado às mensagens durante um raid. */
    scoreBoost: 95,
} as const;

// Progressão de timeout (minutos) por reincidência: 1ª, 2ª, 3ª, 4ª+. Última repete-se.
export const TIMEOUT_STEPS_MINUTES = [10, 60, 1440, 4320];

// Score máximo (clamp).
export const MAX_SCORE = 100;
