import {
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    type AudioPlayer,
    type VoiceConnection,
} from "@discordjs/voice";
import { ButtonBuilder, ButtonStyle, PermissionFlagsBits, type GuildMember, type GuildTextBasedChannel, type Message, type MessageCollector } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t, tk } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { grantCoins } from "../economy/economyService.js";
import { track as trackGame } from "../games/gameCore.js";
import { getGamesSettings } from "../games/gamesSettings.js";
import { hasModAccess } from "../moderation/moderationService.js";
import { getQueue } from "../music/player.js";
import { ffmpegAvailable, openRemoteAudio } from "../music/ytdlp.js";
import { hintFor, matchesAnswer, normalizeAnswer, normalizeArtist, pickRounds, pointsFor } from "./musicQuizLogic.js";

// Adivinha a música (/musica quiz): o bot entra na voz e toca 30 s de uma música (amostras do
// Deezer — não dependem do YouTube); quem escrever primeiro o título ou o artista no chat ganha
// pontos. Dica a meio da ronda, revelação com a capa, ranking no fim e moedas para quem jogou.

export const QUIZ_CATEGORIES = {
    "top-pt": { label: tk("Top Portugal"), emoji: "🇵🇹", source: "playlist/1362519755" },
    "top-mundo": { label: tk("Top mundial"), emoji: "🌍", source: "chart/0/tracks?limit=100" },
    "anos80": { label: tk("Anos 80"), emoji: "📼", source: "playlist/867825522" },
    "anos90": { label: tk("Anos 90"), emoji: "💿", source: "playlist/878989033" },
    "anos2000": { label: tk("Anos 2000"), emoji: "📀", source: "playlist/248297032" },
    "anos2010": { label: tk("Anos 2010"), emoji: "📱", source: "playlist/8282573142" },
    "rock": { label: tk("Rock"), emoji: "🎸", source: "playlist/1306931615" },
    "rap": { label: tk("Rap e hip-hop"), emoji: "🎤", source: "chart/116/tracks?limit=100" },
    "anime": { label: tk("Anime"), emoji: "🍥", source: "playlist/9016993522" },
    "jogos": { label: tk("Videojogos"), emoji: "🎮", source: "playlist/4380597982" },
    "disney": { label: tk("Disney"), emoji: "🏰", source: "playlist/1962379246" },
    "latina": { label: tk("Latina e reggaeton"), emoji: "💃", source: "playlist/178699142" },
    "dance": { label: tk("Dance e EDM"), emoji: "🪩", source: "playlist/706093725" },
} as const;
export type QuizCategory = keyof typeof QUIZ_CATEGORIES;

const ROUND_MS = 30_000;
const HINT_AT_MS = 15_000;
const BETWEEN_MS = 5_000;
const NS = "mquiz";

interface QuizTrack { title: string; artist: string; preview: string; cover: string | null; link: string; answerTitle: string; answerArtist: string }

interface Score { points: number; titles: number; artists: number }

interface Session {
    guildId: string;
    hostId: string;
    channel: GuildTextBasedChannel;
    voiceChannelId: string;
    label: string;
    rounds: QuizTrack[];
    index: number;
    scores: Map<string, Score>;
    connection: VoiceConnection;
    player: AudioPlayer;
    kill: (() => void) | null;
    collector: MessageCollector | null;
    roundMessage: Message | null;
    stopped: boolean;
}

const sessions = new Map<string, Session>();

export function quizRunning(guildId: string): boolean {
    return sessions.has(guildId);
}

// ─── Músicas ─────────────────────────────────────────────────────────────────

interface DeezerTrack { title?: string; title_short?: string; preview?: string; link?: string; artist?: { name?: string }; album?: { cover_medium?: string; cover_big?: string } }

/** Só amostras do CDN do Deezer, em https (o link vai para o ffmpeg). */
export function isDeezerPreview(url: string | undefined): url is string {
    if (typeof url !== "string") return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && parsed.hostname.endsWith(".dzcdn.net") && !parsed.username && !parsed.password;
    } catch {
        return false;
    }
}

function toQuizTrack(item: DeezerTrack): QuizTrack | null {
    if (!isDeezerPreview(item.preview) || !item.title || !item.artist?.name) return null;
    const title = item.title_short || item.title;
    const answerTitle = normalizeAnswer(title);
    if (!answerTitle) return null;
    return { title, artist: item.artist.name, preview: item.preview, cover: item.album?.cover_big ?? item.album?.cover_medium ?? null, link: item.link ?? "https://www.deezer.com", answerTitle, answerArtist: normalizeArtist(item.artist.name) };
}

async function deezer(path: string): Promise<unknown> {
    const response = await fetch(`https://api.deezer.com/${path}`, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Deezer ${response.status}`);
    return response.json();
}

/** Músicas de uma categoria, ou o top de um artista. */
export async function loadTracks(category: QuizCategory | null, artist: string | null): Promise<QuizTrack[]> {
    let items: DeezerTrack[] = [];
    if (artist) {
        const found = await deezer(`search/artist?q=${encodeURIComponent(artist)}&limit=1`) as { data?: Array<{ id: number }> };
        const id = found.data?.[0]?.id;
        if (id) items = ((await deezer(`artist/${id}/top?limit=60`)) as { data?: DeezerTrack[] }).data ?? [];
    } else {
        const source = QUIZ_CATEGORIES[category ?? "top-pt"].source;
        const json = await deezer(source.startsWith("playlist/") ? `${source}?limit=200` : source) as { data?: DeezerTrack[]; tracks?: { data?: DeezerTrack[] } };
        items = json.tracks?.data ?? json.data ?? [];
    }
    const seen = new Set<string>();
    return items.map(toQuizTrack).filter((entry): entry is QuizTrack => {
        if (!entry) return false;
        const key = `${entry.answerTitle}|${entry.answerArtist}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ─── Vistas ──────────────────────────────────────────────────────────────────

function controls(guildId: string): ReturnType<typeof row> {
    return row(
        new ButtonBuilder().setCustomId(buildCustomId(NS, "skip", guildId)).setLabel(t("Saltar")).setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(buildCustomId(NS, "stop", guildId)).setLabel(t("Terminar")).setEmoji("⏹️").setStyle(ButtonStyle.Danger),
    );
}

function leaderboard(session: Session, limit = 5): string {
    const ranked = [...session.scores.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, limit);
    const medals = ["🥇", "🥈", "🥉"];
    return ranked.length ? ranked.map(([id, score], index) => `${medals[index] ?? `**${index + 1}.**`} <@${id}> — **${score.points}** ${t("pts")}`).join("\n") : t("*Ninguém pontuou ainda.*");
}

function send(session: Session, container: ContainerPlusBuilder, mentions: string[] = []): Promise<Message | null> {
    return session.channel.send({ components: [container], flags: CV2_FLAG, allowedMentions: { users: mentions } }).catch(() => null);
}

// ─── Jogo ────────────────────────────────────────────────────────────────────

function award(session: Session, userId: string, kind: "title" | "artist", elapsed: number): number {
    const score = session.scores.get(userId) ?? { points: 0, titles: 0, artists: 0 };
    const points = pointsFor(kind, elapsed);
    score.points += points;
    if (kind === "title") score.titles++;
    else score.artists++;
    session.scores.set(userId, score);
    return points;
}

async function playRound(session: Session): Promise<void> {
    const round = session.rounds[session.index]!;
    const started = Date.now();
    let titleBy: string | null = null;
    let artistBy: string | null = null;

    session.roundMessage = await send(session, buildContainer({
        color: COLORS.primary,
        title: `🎶 ${t("Ronda {n} de {total}", { n: session.index + 1, total: session.rounds.length })}`,
        description: t("A tocar… escreve o **título** ({tp} pts, +1 se for nos primeiros 10 s) ou o **artista** ({ap} pt).", { tp: 2, ap: 1 }),
        rows: [controls(session.guildId)],
    }));

    try {
        const audio = openRemoteAudio(round.preview);
        session.kill = audio.kill;
        session.player.play(createAudioResource(audio.stream, { inputType: StreamType.OggOpus }));
    } catch (error) {
        logger.warn("Quiz de música: falha a tocar:", error);
    }

    const hintTimer = setTimeout(() => {
        if (titleBy || session.stopped) return;
        void send(session, buildContainer({ color: COLORS.info, description: `💡 ${t("Dica do título:")} \`${hintFor(round.title)}\`${artistBy ? "" : `\n-# ${t("O artista começa por **{c}**.", { c: round.artist.charAt(0).toUpperCase() })}`}` }));
    }, HINT_AT_MS);

    await new Promise<void>((resolve) => {
        const collector = session.channel.createMessageCollector({ filter: (message) => !message.author.bot, time: ROUND_MS });
        session.collector = collector;
        collector.on("collect", (message) => {
            const elapsed = Date.now() - started;
            const gotTitle = !titleBy && matchesAnswer(message.content, round.answerTitle);
            const gotArtist = !artistBy && matchesAnswer(message.content, round.answerArtist, true);
            if (gotTitle) {
                titleBy = message.author.id;
                award(session, message.author.id, "title", elapsed);
                void message.react("✅").catch(() => null);
            }
            if (gotArtist) {
                artistBy = message.author.id;
                award(session, message.author.id, "artist", elapsed);
                void message.react("🎤").catch(() => null);
            }
            if (titleBy && artistBy) collector.stop("found");
        });
        collector.on("end", () => resolve());
    });

    clearTimeout(hintTimer);
    session.collector = null;
    session.kill?.();
    session.kill = null;
    session.player.stop(true);
    await session.roundMessage?.edit({ components: [buildContainer({ color: COLORS.neutral, title: `🎶 ${t("Ronda {n} de {total}", { n: session.index + 1, total: session.rounds.length })}`, description: t("Ronda terminada.") })] }).catch(() => null);

    const reveal = buildContainer({
        color: titleBy || artistBy ? COLORS.success : COLORS.warning,
        title: `🎵 ${round.title} — ${round.artist}`,
        thumbnailUrl: round.cover,
        description: [
            titleBy ? t("Título: {user}", { user: `<@${titleBy}>` }) : t("Título: *ninguém acertou*"),
            artistBy ? t("Artista: {user}", { user: `<@${artistBy}>` }) : t("Artista: *ninguém acertou*"),
        ].join("\n"),
        fields: [{ name: t("Pontuação"), value: leaderboard(session) }],
        rows: [row(new ButtonBuilder().setLabel(t("Ouvir no Deezer")).setStyle(ButtonStyle.Link).setURL(round.link))],
    });
    await send(session, reveal);
}

async function finish(session: Session): Promise<void> {
    sessions.delete(session.guildId);
    session.kill?.();
    try { session.player.stop(true); } catch { /* já parado */ }
    try { session.connection.destroy(); } catch { /* já saiu */ }

    const ranked = [...session.scores.entries()].sort((a, b) => b[1].points - a[1].points);
    const settings = await getGamesSettings(session.guildId).catch(() => null);
    const perPoint = settings?.enabled ? Math.max(1, Math.round(settings.quiz_reward / 2)) : 0;
    const winnerBonus = settings?.enabled ? settings.win_reward : 0;
    const rewards: string[] = [];
    for (const [index, [userId, score]] of ranked.entries()) {
        const coins = score.points * perPoint + (index === 0 && score.points > 0 ? winnerBonus : 0);
        if (coins > 0) {
            await grantCoins(session.guildId, userId, coins, "game-musica", t("Adivinha a música")).catch(() => null);
            rewards.push(`<@${userId}> +${formatNumber(coins)}`);
        }
        trackGame(session.guildId, userId, "musica", index === 0 && score.points > 0 ? "win" : "played", { score: score.points, coinsWon: coins });
    }
    const winner = ranked[0];
    await send(session, buildContainer({
        color: COLORS.gold,
        title: `🏁 ${t("Fim do quiz — {label}", { label: session.label })}`,
        description: [
            winner && winner[1].points > 0 ? t("🏆 Venceu {user} com **{n}** pontos ({titles} títulos, {artists} artistas)!", { user: `<@${winner[0]}>`, n: winner[1].points, titles: winner[1].titles, artists: winner[1].artists }) : t("Ninguém pontuou desta vez. 🙈"),
            session.stopped ? `-# ${t("Terminado antes do fim ({n} de {total} rondas).", { n: session.index + 1, total: session.rounds.length })}` : null,
        ].filter(Boolean).join("\n"),
        fields: [
            { name: t("Classificação"), value: leaderboard(session, 10) },
            ...(rewards.length ? [{ name: t("Moedas"), value: rewards.join(" · ") }] : []),
        ],
    }), winner ? [winner[0]] : []);
}

async function run(session: Session): Promise<void> {
    try {
        for (session.index = 0; session.index < session.rounds.length && !session.stopped; session.index++) {
            await playRound(session);
            if (session.stopped || session.index === session.rounds.length - 1) break;
            await new Promise((resolve) => setTimeout(resolve, BETWEEN_MS));
        }
    } catch (error) {
        logger.warn("Quiz de música: falha no jogo:", error);
    } finally {
        if (session.index >= session.rounds.length) session.index = session.rounds.length - 1;
        await finish(session);
    }
}

export interface StartOptions { member: GuildMember; channel: GuildTextBasedChannel; category: QuizCategory | null; artist: string | null; rounds: number }

/** Arranca o quiz. Devolve o texto de um problema, ou null se começou. */
export async function startMusicQuiz(options: StartOptions): Promise<string | null> {
    const { member, channel } = options;
    const guild = member.guild;
    if (!ffmpegAvailable()) return t("O áudio não está disponível neste servidor do bot (falta o ffmpeg).");
    if (sessions.has(guild.id)) return t("Já está a decorrer um quiz de música.");
    if (getQueue(guild.id)) return t("A música está a tocar — usa `/musica parar` antes do quiz.");
    const voice = member.voice.channel;
    if (!voice) return t("Entra primeiro num canal de voz.");
    const me = guild.members.me;
    if (me && !voice.permissionsFor(me).has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return t("Não tenho permissão para entrar ou falar em {channel}.", { channel: `<#${voice.id}>` });

    const tracks = await loadTracks(options.category, options.artist).catch((error) => { logger.warn("Quiz de música: Deezer falhou:", error); return []; });
    if (tracks.length < 3) return options.artist ? t("Não encontrei músicas suficientes de «{artist}».", { artist: options.artist }) : t("Não consegui carregar as músicas agora — tenta daqui a pouco.");
    const rounds = pickRounds(tracks, Math.min(options.rounds, tracks.length));

    const connection = joinVoiceChannel({ channelId: voice.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    } catch {
        connection.destroy();
        return t("Não consegui entrar no canal de voz.");
    }
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    connection.subscribe(player);
    player.on("error", (error) => logger.warn("Quiz de música: erro no leitor:", error.message));
    player.on(AudioPlayerStatus.Idle, () => null);

    const label = options.artist ? options.artist : `${QUIZ_CATEGORIES[options.category ?? "top-pt"].emoji} ${t(QUIZ_CATEGORIES[options.category ?? "top-pt"].label)}`;
    const session: Session = { guildId: guild.id, hostId: member.id, channel, voiceChannelId: voice.id, label, rounds, index: 0, scores: new Map(), connection, player, kill: null, collector: null, roundMessage: null, stopped: false };
    sessions.set(guild.id, session);
    connection.on(VoiceConnectionStatus.Disconnected, () => { session.stopped = true; session.collector?.stop("disconnected"); });

    await send(session, buildContainer({
        color: COLORS.primary,
        title: `🎵 ${t("Adivinha a música — {label}", { label })}`,
        description: [
            t("**{n} rondas** de 30 segundos em {voice}. Escrevam no chat o título ou o artista!", { n: rounds.length, voice: `<#${voice.id}>` }),
            t("Título = **2 pts** (+1 nos primeiros 10 s) · artista = **1 pt** · há dica a meio da ronda."),
            `-# ${t("Erros de escrita contam. Primeira ronda daqui a 5 segundos…")}`,
        ].join("\n"),
    }));
    setTimeout(() => void run(session), 5_000);
    return null;
}

export async function controlQuiz(member: GuildMember, action: "skip" | "stop"): Promise<string | null> {
    const session = sessions.get(member.guild.id);
    if (!session) return t("Não há nenhum quiz a decorrer.");
    const allowed = member.id === session.hostId || await hasModAccess(member, PermissionFlagsBits.ManageMessages);
    if (!allowed) return t("Só quem começou o quiz (ou a equipa) pode fazer isso.");
    if (action === "stop") session.stopped = true;
    session.collector?.stop(action);
    return null;
}
