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
import { ButtonBuilder, ButtonStyle, type Guild, type Message, type TextBasedChannel, type VoiceBasedChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t, tk } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { formatDuration, openAudio, type Track } from "./ytdlp.js";

// Uma fila por servidor. O bot entra no canal de voz de quem pede, toca por ordem e sai quando a
// fila acaba (depois de 3 minutos) ou quando fica sozinho no canal.

export const LOOP_MODES = ["off", "track", "queue"] as const;
export type LoopMode = (typeof LOOP_MODES)[number];
export const LOOP_LABELS: Record<LoopMode, string> = { off: tk("Sem repetição"), track: tk("Repetir música"), queue: tk("Repetir fila") };
export const MAX_QUEUE = 200;
const IDLE_LEAVE_MS = 3 * 60_000;

export interface GuildQueue {
    guildId: string;
    voiceChannelId: string;
    textChannel: TextBasedChannel | null;
    connection: VoiceConnection;
    player: AudioPlayer;
    tracks: Track[];
    current: Track | null;
    startedAt: number;
    loop: LoopMode;
    skipVotes: Set<string>;
    kill: (() => void) | null;
    panel: Message | null;
    idleTimer: NodeJS.Timeout | null;
    failures: number;
}

const queues = new Map<string, GuildQueue>();

export function getQueue(guildId: string): GuildQueue | undefined {
    return queues.get(guildId);
}

export function nowPlayingView(queue: GuildQueue): ContainerPlusBuilder {
    const track = queue.current;
    const paused = queue.player.state.status === AudioPlayerStatus.Paused;
    return buildContainer({
        color: COLORS.primary,
        title: track ? `🎵 ${paused ? t("Em pausa") : t("A tocar")}` : `🎵 ${t("Fila vazia")}`,
        thumbnailUrl: track?.thumbnail ?? null,
        description: track
            ? [
                `**[${track.title.replace(/[[\]]/g, "")}](${track.url})**`,
                track.author ? `-# ${track.author}` : null,
                t("Duração: {duration} · pedida por {user}", { duration: formatDuration(track.duration), user: `<@${track.requestedBy}>` }),
                paused ? null : t("Começou {at}", { at: `<t:${Math.floor(queue.startedAt / 1000)}:R>` }),
                "",
                t("Na fila: **{count}** · {loop}", { count: queue.tracks.length, loop: t(LOOP_LABELS[queue.loop]) }),
                queue.tracks[0] ? `-# ${t("A seguir: {title}", { title: queue.tracks[0].title.slice(0, 80) })}` : null,
            ].filter((line) => line !== null).join("\n")
            : t("Usa `/musica tocar` para pôr música."),
        rows: track ? [row(
            new ButtonBuilder().setCustomId("music/toggle").setEmoji(paused ? "▶️" : "⏸️").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music/skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("music/stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("music/shuffle").setEmoji("🔀").setStyle(ButtonStyle.Secondary).setDisabled(queue.tracks.length < 2),
            new ButtonBuilder().setCustomId("music/loop").setEmoji(queue.loop === "track" ? "🔂" : "🔁").setStyle(queue.loop === "off" ? ButtonStyle.Secondary : ButtonStyle.Success),
        )] : [],
    });
}

async function refreshPanel(queue: GuildQueue, resend = false): Promise<void> {
    const channel = queue.textChannel;
    if (!channel || !("send" in channel)) return;
    const payload = { components: [nowPlayingView(queue)], allowedMentions: { parse: [] } };
    if (queue.panel && !resend) {
        await queue.panel.edit(payload).catch(() => null);
        return;
    }
    if (queue.panel) await queue.panel.delete().catch(() => null);
    queue.panel = await channel.send({ ...payload, flags: CV2_FLAG }).catch(() => null);
}

function scheduleLeave(queue: GuildQueue): void {
    if (queue.idleTimer) clearTimeout(queue.idleTimer);
    queue.idleTimer = setTimeout(() => destroyQueue(queue.guildId, t("Fila terminada — saí do canal.")), IDLE_LEAVE_MS);
    queue.idleTimer.unref?.();
}

async function playNext(queue: GuildQueue): Promise<void> {
    queue.kill?.();
    queue.kill = null;
    queue.skipVotes.clear();
    const previous = queue.current;
    if (previous && queue.loop === "track") queue.tracks.unshift(previous);
    else if (previous && queue.loop === "queue") queue.tracks.push(previous);
    const next = queue.tracks.shift() ?? null;
    queue.current = next;
    if (!next) {
        await refreshPanel(queue);
        scheduleLeave(queue);
        return;
    }
    if (queue.idleTimer) clearTimeout(queue.idleTimer);
    try {
        const audio = openAudio(next);
        queue.kill = audio.kill;
        const resource = createAudioResource(audio.stream, { inputType: StreamType.OggOpus, metadata: next });
        queue.player.play(resource);
        queue.startedAt = Date.now();
        await refreshPanel(queue, true);
    } catch (error) {
        logger.warn("Música: falha a tocar:", error);
        queue.failures++;
        if (queue.failures > 3) return destroyQueue(queue.guildId, t("Várias músicas falharam seguidas — parei a reprodução."));
        await playNext(queue);
    }
}

function createQueue(guild: Guild, voice: VoiceBasedChannel, textChannel: TextBasedChannel | null): GuildQueue {
    const connection = joinVoiceChannel({ channelId: voice.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    connection.subscribe(player);
    const queue: GuildQueue = {
        guildId: guild.id, voiceChannelId: voice.id, textChannel, connection, player, tracks: [], current: null, startedAt: 0,
        loop: "off", skipVotes: new Set(), kill: null, panel: null, idleTimer: null, failures: 0,
    };
    player.on(AudioPlayerStatus.Idle, () => {
        if (queues.get(guild.id) !== queue) return;
        // Uma música que acaba em menos de 3 segundos falhou (ex.: bloqueio do YouTube).
        if (queue.current && Date.now() - queue.startedAt < 3_000) queue.failures++;
        else queue.failures = 0;
        if (queue.failures > 3) return void destroyQueue(guild.id, t("Não estou a conseguir tocar estas músicas (a fonte recusou). Tenta outra pesquisa."));
        void playNext(queue);
    });
    player.on("error", (error) => logger.warn("Música: erro no player:", error.message));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch {
            destroyQueue(guild.id, null);
        }
    });
    queues.set(guild.id, queue);
    return queue;
}

/** Junta músicas à fila (e entra no canal, se for preciso). Devolve quantas entraram. */
export async function enqueue(guild: Guild, voice: VoiceBasedChannel, textChannel: TextBasedChannel | null, tracks: Track[]): Promise<{ added: number; startedNow: boolean; queue: GuildQueue }> {
    let queue = queues.get(guild.id);
    if (queue && queue.voiceChannelId !== voice.id) throw new Error("other_channel");
    if (!queue) {
        queue = createQueue(guild, voice, textChannel);
        await entersState(queue.connection, VoiceConnectionStatus.Ready, 20_000).catch((error) => {
            destroyQueue(guild.id, null);
            throw error;
        });
    }
    if (textChannel) queue.textChannel = textChannel;
    const room = Math.max(0, MAX_QUEUE - queue.tracks.length);
    const accepted = tracks.slice(0, room);
    queue.tracks.push(...accepted);
    const startedNow = !queue.current;
    if (startedNow) await playNext(queue);
    else await refreshPanel(queue);
    return { added: accepted.length, startedNow, queue };
}

export function skip(queue: GuildQueue): void {
    const loop = queue.loop;
    if (loop === "track") queue.loop = "off";
    queue.player.stop(true);
    queue.loop = loop;
}

export function togglePause(queue: GuildQueue): boolean {
    if (queue.player.state.status === AudioPlayerStatus.Paused) {
        queue.player.unpause();
        return false;
    }
    queue.player.pause();
    return true;
}

export function shuffle(queue: GuildQueue): void {
    for (let i = queue.tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j]!, queue.tracks[i]!];
    }
}

export function cycleLoop(queue: GuildQueue): LoopMode {
    queue.loop = LOOP_MODES[(LOOP_MODES.indexOf(queue.loop) + 1) % LOOP_MODES.length]!;
    return queue.loop;
}

export function destroyQueue(guildId: string, notice: string | null): void {
    const queue = queues.get(guildId);
    if (!queue) return;
    queues.delete(guildId);
    if (queue.idleTimer) clearTimeout(queue.idleTimer);
    queue.kill?.();
    queue.tracks = [];
    queue.current = null;
    queue.player.stop(true);
    try {
        queue.connection.destroy();
    } catch {
        // já destruída
    }
    if (queue.panel) void queue.panel.edit({ components: [buildContainer({ color: COLORS.neutral, description: `⏹️ ${notice ?? t("Música parada.")}` })], allowedMentions: { parse: [] } }).catch(() => null);
}

export function updatePanel(queue: GuildQueue): Promise<void> {
    return refreshPanel(queue);
}

/** O bot ficou sozinho no canal? Sai ao fim de 1 minuto. */
const aloneTimers = new Map<string, NodeJS.Timeout>();
export function checkAlone(guild: Guild): void {
    const queue = queues.get(guild.id);
    if (!queue) return;
    const channel = guild.channels.cache.get(queue.voiceChannelId);
    const humans = channel?.isVoiceBased() ? channel.members.filter((member) => !member.user.bot).size : 0;
    const existing = aloneTimers.get(guild.id);
    if (humans > 0) {
        if (existing) clearTimeout(existing);
        aloneTimers.delete(guild.id);
        return;
    }
    if (existing) return;
    const timer = setTimeout(() => {
        aloneTimers.delete(guild.id);
        destroyQueue(guild.id, t("Fiquei sozinho no canal — saí."));
    }, 60_000);
    timer.unref?.();
    aloneTimers.set(guild.id, timer);
}
