import { createCommand } from "#base";
import { controlQuiz, QUIZ_CATEGORIES, quizRunning, startMusicQuiz, type QuizCategory } from "../../../modules/musicquiz/musicQuiz.js";

const QUIZ_CATEGORY_KEYS = Object.keys(QUIZ_CATEGORIES) as QuizCategory[];
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { query, queryOne } from "#database";
import { COLORS } from "../../../lib/branding.js";
import { buildContainer, errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";
import { logger } from "../../../lib/logger.js";
import { canControl, skipOrVote, voiceProblem } from "../../../modules/music/musicControl.js";
import { cycleLoop, destroyQueue, enqueue, getQueue, LOOP_LABELS, LOOP_MODES, nowPlayingView, shuffle, togglePause, updatePanel, type LoopMode } from "../../../modules/music/player.js";
import { findLyrics, formatDuration, musicAvailable, resolveTracks, type Track } from "../../../modules/music/ytdlp.js";

const fail = (interaction: ChatInputCommandInteraction, text: string) =>
    interaction.deferred || interaction.replied
        ? interaction.editReply({ components: [errorContainer(text)], flags: CV2_FLAG })
        : interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });

async function play(interaction: ChatInputCommandInteraction<"cached">, input: string, label?: string): Promise<void> {
    if (!musicAvailable()) return void fail(interaction, t("A música não está disponível neste servidor do bot (falta o yt-dlp/ffmpeg)."));
    const voice = interaction.member.voice.channel;
    if (!voice) return void fail(interaction, t("Entra primeiro num canal de voz."));
    const me = interaction.guild.members.me;
    if (me && !voice.permissionsFor(me).has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return void fail(interaction, t("Não tenho permissão para entrar ou falar em {channel}.", { channel: `<#${voice.id}>` }));
    if (quizRunning(interaction.guildId)) return void fail(interaction, t("Está a decorrer um quiz de música — espera que acabe (ou `/musica quiz-parar`)."));
    const existing = getQueue(interaction.guildId);
    if (existing && existing.voiceChannelId !== voice.id) return void fail(interaction, t("Já estou a tocar em {channel}.", { channel: `<#${existing.voiceChannelId}>` }));
    await interaction.deferReply();
    const tracks = await resolveTracks(input, interaction.user.id);
    if (!tracks.length) return void fail(interaction, t("Não encontrei nada para «{query}».", { query: input.slice(0, 100) }));
    try {
        const result = await enqueue(interaction.guild, voice, interaction.channel, tracks);
        const first = tracks[0]!;
        const text = result.added > 1
            ? t("🎶 Juntei **{count}** músicas{label} à fila.", { count: result.added, label: label ? ` (${label})` : "" })
            : result.startedNow ? t("▶️ A tocar **{title}** ({duration}).", { title: first.title, duration: formatDuration(first.duration) }) : t("➕ **{title}** entrou na fila (posição {pos}).", { title: first.title, pos: result.queue.tracks.length });
        await interaction.editReply({ components: [successContainer(text)], flags: CV2_FLAG });
    } catch (error) {
        logger.warn("Música: falha a entrar no canal:", error);
        await fail(interaction, t("Não consegui entrar no canal de voz. Tenta outra vez."));
    }
}

createCommand({
    name: "musica",
    description: t("Música no canal de voz: YouTube, SoundCloud e links do Spotify."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "tocar", description: t("Toca (ou junta à fila) uma música, link ou playlist."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "pesquisa", description: t("Nome da música ou link"), type: ApplicationCommandOptionType.String, required: true, maxLength: 300 }] },
        { name: "pular", description: t("Salta a música (ou vota para saltar)."), type: ApplicationCommandOptionType.Subcommand },
        { name: "pausar", description: t("Pausa ou retoma."), type: ApplicationCommandOptionType.Subcommand },
        { name: "parar", description: t("Para a música, limpa a fila e sai do canal."), type: ApplicationCommandOptionType.Subcommand },
        { name: "fila", description: t("A fila de reprodução."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "pagina", description: t("Página"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 1 }] },
        { name: "agora", description: t("O que está a tocar (com os controlos)."), type: ApplicationCommandOptionType.Subcommand },
        { name: "remover", description: t("Tira uma música da fila."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "posicao", description: t("Posição na fila"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1 }] },
        { name: "baralhar", description: t("Baralha a fila."), type: ApplicationCommandOptionType.Subcommand },
        { name: "repetir", description: t("Repetição: nenhuma, a música ou a fila."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "modo", description: t("Modo"), type: ApplicationCommandOptionType.String, required: false, choices: LOOP_MODES.map((value) => ({ name: t(LOOP_LABELS[value]), value })) }] },
        {
            name: "quiz",
            description: t("Adivinha a música: 30 s de cada música na voz, ganha quem acertar primeiro."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "categoria", description: t("Que músicas"), type: ApplicationCommandOptionType.String, required: false, choices: QUIZ_CATEGORY_KEYS.map((key) => ({ name: `${QUIZ_CATEGORIES[key].emoji} ${t(QUIZ_CATEGORIES[key].label)}`, value: key })) },
                { name: "rondas", description: t("Quantas músicas (5 a 20, por defeito 10)"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 5, maxValue: 20 },
                { name: "artista", description: t("Só músicas deste artista (em vez de uma categoria)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 80 },
            ],
        },
        { name: "quiz-parar", description: t("Termina o quiz de música (mostra a classificação)."), type: ApplicationCommandOptionType.Subcommand },
        { name: "letra", description: t("A letra da música (a que está a tocar ou outra)."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "musica", description: t("Outra música (vazio = a que está a tocar)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 200 }] },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        if (sub === "tocar") return play(interaction, interaction.options.getString("pesquisa", true));

        if (sub === "quiz") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (!interaction.channel) return void fail(interaction, t("Usa o comando num canal de texto."));
            const problem = await startMusicQuiz({
                member: interaction.member,
                channel: interaction.channel,
                category: (interaction.options.getString("categoria") as QuizCategory | null) ?? "top-pt",
                artist: interaction.options.getString("artista")?.trim() || null,
                rounds: interaction.options.getInteger("rondas") ?? 10,
            });
            return void interaction.editReply({ components: [problem ? errorContainer(problem) : successContainer(t("🎵 Quiz a começar! Vai ao chat e ao canal de voz."))], flags: CV2_FLAG });
        }
        if (sub === "quiz-parar") {
            const problem = await controlQuiz(interaction.member, "stop");
            return void interaction.reply({ components: [problem ? errorContainer(problem) : successContainer(t("Quiz terminado — a classificação vem já."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }

        if (sub === "letra") {
            const custom = interaction.options.getString("musica");
            const title = custom ?? getQueue(interaction.guildId)?.current?.title;
            if (!title) return void fail(interaction, t("Não está a tocar nada — diz qual é a música."));
            await interaction.deferReply();
            const found = await findLyrics(title);
            if (!found) return void fail(interaction, t("Não encontrei a letra de «{title}».", { title: title.slice(0, 100) }));
            return void interaction.editReply({
                components: [buildContainer({ color: COLORS.primary, title: `🎤 ${found.title} — ${found.artist}`, description: found.lyrics.length > 3800 ? `${found.lyrics.slice(0, 3800)}\n…` : found.lyrics, footerText: t("Letra: lrclib.net") })],
                flags: CV2_FLAG,
            });
        }

        const queue = getQueue(interaction.guildId);
        if (sub === "fila") {
            if (!queue?.current) return void fail(interaction, t("Não está a tocar nada."));
            const page = Math.max(1, interaction.options.getInteger("pagina") ?? 1);
            const pages = Math.max(1, Math.ceil(queue.tracks.length / 15));
            const current = Math.min(page, pages);
            const slice = queue.tracks.slice((current - 1) * 15, current * 15);
            const total = queue.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.primary,
                    title: `📜 ${t("Fila ({count} músicas · {duration})", { count: queue.tracks.length, duration: formatDuration(total) })}`,
                    description: [
                        `▶️ **${queue.current.title}** · ${formatDuration(queue.current.duration)}`,
                        "",
                        ...slice.map((track: Track, i) => `\`${(current - 1) * 15 + i + 1}.\` ${track.title.slice(0, 70)} · ${formatDuration(track.duration)} · <@${track.requestedBy}>`),
                    ].join("\n") || t("*A fila está vazia.*"),
                    footerText: t("Página {page} de {pages} · {loop}", { page: current, pages, loop: t(LOOP_LABELS[queue.loop]) }),
                })],
                flags: CV2_FLAG,
                allowedMentions: { parse: [] },
            });
        }
        if (sub === "agora") {
            if (!queue?.current) return void fail(interaction, t("Não está a tocar nada."));
            return void interaction.reply({ components: [nowPlayingView(queue)], flags: CV2_FLAG, allowedMentions: { parse: [] } });
        }

        const { queue: active, problem } = voiceProblem(interaction.member);
        if (problem || !active) return void fail(interaction, problem ?? t("Não está a tocar nada."));
        if (sub === "pular") return void interaction.reply({ components: [successContainer(await skipOrVote(interaction.member, active))], flags: CV2_FLAG });
        if (!(await canControl(interaction.member, active)) && sub !== "baralhar") return void fail(interaction, t("Só a equipa ou quem pediu a música pode fazer isso (os outros votam com `/musica pular`)."));
        switch (sub) {
            case "pausar": {
                const paused = togglePause(active);
                await updatePanel(active);
                return void interaction.reply({ components: [successContainer(paused ? t("⏸️ Em pausa.") : t("▶️ A tocar outra vez."))], flags: CV2_FLAG });
            }
            case "parar":
                destroyQueue(interaction.guildId, t("Parado por {user}.", { user: interaction.member.displayName }));
                return void interaction.reply({ components: [successContainer(t("⏹️ Música parada e fila limpa."))], flags: CV2_FLAG });
            case "remover": {
                const position = interaction.options.getInteger("posicao", true);
                const [removed] = active.tracks.splice(position - 1, 1);
                if (!removed) return void fail(interaction, t("Não há nada na posição {pos}.", { pos: position }));
                await updatePanel(active);
                return void interaction.reply({ components: [successContainer(t("Tirei **{title}** da fila.", { title: removed.title }))], flags: CV2_FLAG });
            }
            case "baralhar":
                shuffle(active);
                await updatePanel(active);
                return void interaction.reply({ components: [successContainer(t("🔀 Fila baralhada."))], flags: CV2_FLAG });
            case "repetir": {
                const chosen = interaction.options.getString("modo") as LoopMode | null;
                const mode = chosen ?? cycleLoop(active);
                active.loop = mode;
                await updatePanel(active);
                return void interaction.reply({ components: [successContainer(`🔁 ${t(LOOP_LABELS[mode])}`)], flags: CV2_FLAG });
            }
        }
    },
});

// ─── /playlist ───────────────────────────────────────────────────────────────
interface Playlist { id: number; name: string; tracks: Track[] }

async function playlistsOf(guildId: string, userId: string): Promise<Playlist[]> {
    const result = await query<Record<string, unknown>>("SELECT id, name, tracks FROM music_playlists WHERE guild_id = $1 AND user_id = $2 ORDER BY name", [guildId, userId]);
    return result.rows.map((row) => ({ id: Number(row.id), name: String(row.name), tracks: Array.isArray(row.tracks) ? (row.tracks as Track[]) : [] }));
}

async function findPlaylist(guildId: string, userId: string, name: string): Promise<Playlist | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT id, name, tracks FROM music_playlists WHERE guild_id = $1 AND user_id = $2 AND lower(name) = lower($3)", [guildId, userId, name.trim()]);
    return row ? { id: Number(row.id), name: String(row.name), tracks: Array.isArray(row.tracks) ? (row.tracks as Track[]) : [] } : null;
}

const nameOption = (description: string) => ({ name: "nome", description, type: ApplicationCommandOptionType.String as const, required: true, maxLength: 40, autocomplete: true as const });

createCommand({
    name: "playlist",
    description: t("As tuas playlists pessoais."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "criar", description: t("Cria uma playlist."), type: ApplicationCommandOptionType.Subcommand, options: [{ name: "nome", description: t("Nome"), type: ApplicationCommandOptionType.String, required: true, maxLength: 40 }] },
        {
            name: "adicionar",
            description: t("Junta uma música (ou a que está a tocar)."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [nameOption(t("Playlist")), { name: "pesquisa", description: t("Música ou link (vazio = a que está a tocar)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 300 }],
        },
        { name: "tocar", description: t("Põe a playlist a tocar."), type: ApplicationCommandOptionType.Subcommand, options: [nameOption(t("Playlist")), { name: "baralhar", description: t("Baralhar antes"), type: ApplicationCommandOptionType.Boolean, required: false }] },
        { name: "ver", description: t("As músicas de uma playlist."), type: ApplicationCommandOptionType.Subcommand, options: [nameOption(t("Playlist"))] },
        { name: "lista", description: t("As tuas playlists."), type: ApplicationCommandOptionType.Subcommand },
        { name: "remover", description: t("Tira uma música da playlist."), type: ApplicationCommandOptionType.Subcommand, options: [nameOption(t("Playlist")), { name: "posicao", description: t("Posição"), type: ApplicationCommandOptionType.Integer, required: true, minValue: 1 }] },
        { name: "apagar", description: t("Apaga a playlist."), type: ApplicationCommandOptionType.Subcommand, options: [nameOption(t("Playlist"))] },
    ],
    async autocomplete(interaction) {
        if (!interaction.inCachedGuild()) return;
        const focused = interaction.options.getFocused().toLowerCase();
        const lists = await playlistsOf(interaction.guildId, interaction.user.id);
        await interaction.respond(lists.filter((list) => list.name.toLowerCase().includes(focused)).slice(0, 25).map((list) => ({ name: `${list.name} (${list.tracks.length})`, value: list.name })));
    },
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        if (sub === "lista") {
            const lists = await playlistsOf(guildId, userId);
            return void interaction.reply({
                components: [buildContainer({ color: COLORS.primary, title: `🎶 ${t("As tuas playlists")}`, description: lists.length ? lists.map((list) => `**${list.name}** · ${t("{count, plural, one {# música} other {# músicas}}", { count: list.tracks.length })}`).join("\n") : t("Ainda não tens playlists. Cria uma com `/playlist criar`.") })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
        }
        if (sub === "criar") {
            const name = interaction.options.getString("nome", true).trim();
            if ((await playlistsOf(guildId, userId)).length >= 20) return void fail(interaction, t("No máximo 20 playlists."));
            if (await findPlaylist(guildId, userId, name)) return void fail(interaction, t("Já tens uma playlist com esse nome."));
            await query("INSERT INTO music_playlists (guild_id, user_id, name, tracks, created_at) VALUES ($1, $2, $3, '[]'::jsonb, $4)", [guildId, userId, name, Date.now()]);
            return void interaction.reply({ components: [successContainer(t("Playlist **{name}** criada.", { name }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const list = await findPlaylist(guildId, userId, interaction.options.getString("nome", true));
        if (!list) return void fail(interaction, t("Não encontrei essa playlist."));
        switch (sub) {
            case "apagar":
                await query("DELETE FROM music_playlists WHERE id = $1", [list.id]);
                return void interaction.reply({ components: [successContainer(t("Playlist **{name}** apagada.", { name: list.name }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            case "ver":
                return void interaction.reply({
                    components: [buildContainer({ color: COLORS.primary, title: `🎶 ${list.name}`, description: list.tracks.length ? list.tracks.slice(0, 40).map((track, i) => `\`${i + 1}.\` ${track.title.slice(0, 80)} · ${formatDuration(track.duration)}`).join("\n") : t("*Vazia — junta músicas com `/playlist adicionar`.*") })],
                    flags: CV2_FLAG | MessageFlags.Ephemeral,
                });
            case "remover": {
                const position = interaction.options.getInteger("posicao", true);
                const tracks = [...list.tracks];
                const [removed] = tracks.splice(position - 1, 1);
                if (!removed) return void fail(interaction, t("Não há nada na posição {pos}.", { pos: position }));
                await query("UPDATE music_playlists SET tracks = $2 WHERE id = $1", [list.id, JSON.stringify(tracks)]);
                return void interaction.reply({ components: [successContainer(t("Tirei **{title}** de {name}.", { title: removed.title, name: list.name }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            }
            case "adicionar": {
                if (list.tracks.length >= 200) return void fail(interaction, t("A playlist já tem 200 músicas."));
                const search = interaction.options.getString("pesquisa");
                let tracks: Track[];
                if (search) {
                    if (!musicAvailable()) return void fail(interaction, t("A música não está disponível neste servidor do bot."));
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    tracks = await resolveTracks(search, userId, 200 - list.tracks.length);
                } else {
                    const current = getQueue(guildId)?.current;
                    tracks = current ? [current] : [];
                }
                if (!tracks.length) return void fail(interaction, search ? t("Não encontrei nada.") : t("Não está a tocar nada — diz a música."));
                await query("UPDATE music_playlists SET tracks = tracks || $2::jsonb WHERE id = $1", [list.id, JSON.stringify(tracks.map((track) => ({ ...track, requestedBy: userId })))]);
                const payload = { components: [successContainer(t("Juntei {count, plural, one {**#** música} other {**#** músicas}} a **{name}**.", { count: tracks.length, name: list.name }))], flags: CV2_FLAG } as const;
                return void (interaction.deferred ? interaction.editReply(payload) : interaction.reply({ ...payload, flags: CV2_FLAG | MessageFlags.Ephemeral }));
            }
            case "tocar": {
                if (!list.tracks.length) return void fail(interaction, t("Essa playlist está vazia."));
                if (!musicAvailable()) return void fail(interaction, t("A música não está disponível neste servidor do bot."));
                const voice = interaction.member.voice.channel;
                if (!voice) return void fail(interaction, t("Entra primeiro num canal de voz."));
                const tracks = list.tracks.map((track) => ({ ...track, requestedBy: userId }));
                if (interaction.options.getBoolean("baralhar")) {
                    for (let i = tracks.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [tracks[i], tracks[j]] = [tracks[j]!, tracks[i]!];
                    }
                }
                await interaction.deferReply();
                try {
                    const result = await enqueue(interaction.guild, voice, interaction.channel, tracks);
                    return void interaction.editReply({ components: [successContainer(t("🎶 **{name}**: {count} músicas na fila.", { name: list.name, count: result.added }))], flags: CV2_FLAG });
                } catch {
                    return void fail(interaction, t("Não consegui entrar no teu canal de voz (já estou a tocar noutro?)."));
                }
            }
        }
    },
});
