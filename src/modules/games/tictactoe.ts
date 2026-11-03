import { ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember, type Message } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { t, tk } from "../../lib/i18n.js";
import { sendChallenge, type Challenge } from "./challenge.js";
import { betLabel, betProblem, escrowBet, gameFrame, gameGate, newGameId, notYourGame, payOut, refundBet, replyError, rewardWin, Sessions, track, type BaseSession } from "./gameCore.js";
import { formatCoins } from "../economy/economyService.js";
import { getGamesSettings } from "./gamesSettings.js";

// Jogo do Galo. ❌ começa sempre (quem desafia, ou o membro contra o bot).
// Contra o bot há 3 dificuldades; com aposta, ganhar paga 1,5× / 2× / 3× e empatar devolve.

export const TTT_DIFFICULTIES = ["facil", "normal", "dificil"] as const;
export type TttDifficulty = (typeof TTT_DIFFICULTIES)[number];
export const TTT_DIFFICULTY_LABELS: Record<TttDifficulty, string> = { facil: tk("Fácil"), normal: tk("Normal"), dificil: tk("Impossível") };
const BOT_PAYOUT: Record<TttDifficulty, number> = { facil: 1.5, normal: 2, dificil: 3 };

const IDLE_MS = 3 * 60_000;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]] as const;
const MARK = ["", "❌", "⭕"] as const;

type Cell = 0 | 1 | 2;

interface TttSession extends BaseSession {
    players: [string, string];
    vsBot: boolean;
    difficulty: TttDifficulty;
    board: Cell[];
    turn: 1 | 2;
    bet: number;
    /** 0 a decorrer · 1/2 vencedor · 3 empate · 4 abandonado */
    result: 0 | 1 | 2 | 3 | 4;
    line: readonly number[] | null;
    note: string | null;
    message: Message | null;
}

const sessions = new Sessions<TttSession>();

function winnerOf(board: Cell[]): { winner: Cell; line: readonly number[] | null } {
    for (const line of LINES) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line };
    }
    return { winner: 0, line: null };
}

function minimax(board: Cell[], player: 1 | 2, me: 1 | 2, depth: number): number {
    const { winner } = winnerOf(board);
    if (winner) return winner === me ? 10 - depth : depth - 10;
    if (board.every(Boolean)) return 0;
    const scores: number[] = [];
    for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = player;
        scores.push(minimax(board, player === 1 ? 2 : 1, me, depth + 1));
        board[i] = 0;
    }
    return player === me ? Math.max(...scores) : Math.min(...scores);
}

function bestMove(board: Cell[], me: 1 | 2): number {
    let best = -Infinity;
    let moves: number[] = [];
    for (let i = 0; i < 9; i++) {
        if (board[i]) continue;
        board[i] = me;
        const score = minimax(board, me === 1 ? 2 : 1, me, 0);
        board[i] = 0;
        if (score > best) { best = score; moves = [i]; } else if (score === best) moves.push(i);
    }
    return moves[Math.floor(Math.random() * moves.length)] ?? -1;
}

function botMove(session: TttSession): number {
    const free = session.board.map((cell, i) => (cell ? -1 : i)).filter((i) => i >= 0);
    const random = () => free[Math.floor(Math.random() * free.length)]!;
    // Fácil: ganha se puder, senão joga ao calhas. Normal: perfeito 65% das vezes.
    if (session.difficulty === "dificil") return bestMove(session.board, 2);
    if (session.difficulty === "normal") return Math.random() < 0.65 ? bestMove(session.board, 2) : random();
    for (const i of free) {
        session.board[i] = 2;
        const wins = winnerOf(session.board).winner === 2;
        session.board[i] = 0;
        if (wins) return i;
    }
    return random();
}

function render(session: TttSession) {
    const [p1, p2] = session.players;
    const name = (id: string) => (session.vsBot && id === session.players[1] ? t("o bot") : `<@${id}>`);
    let status: string;
    if (session.result === 0) status = t("Vez de {mark} {player}.", { mark: MARK[session.turn], player: name(session.players[session.turn - 1]!) });
    else if (session.result === 3) status = `🤝 ${t("Empate!")}`;
    else if (session.result === 4) status = `⌛ ${t("Jogo abandonado.")}`;
    else status = `🏆 ${t("{player} ganhou!", { player: name(session.players[session.result - 1]!) })}`;

    const cells = session.board.map((cell, i) => {
        const button = new ButtonBuilder()
            .setCustomId(buildCustomId("g", "ttt", session.id, i))
            .setStyle(session.line?.includes(i) ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(Boolean(cell) || session.result !== 0);
        return cell ? button.setEmoji(MARK[cell]) : button.setLabel("​");
    });
    const rows = [row(...cells.slice(0, 3)), row(...cells.slice(3, 6)), row(...cells.slice(6, 9))];
    if (session.result !== 0) {
        rows.push(row(new ButtonBuilder().setCustomId(buildCustomId("g", "ttt", session.id, "again")).setLabel(t("Desforra")).setEmoji("🔁").setStyle(ButtonStyle.Primary)));
    }
    return gameFrame({
        color: session.result === 0 ? COLORS.primary : session.result === 3 || session.result === 4 ? COLORS.neutral : COLORS.success,
        title: `❌ ${t("Jogo do Galo")}`,
        body: [
            `❌ ${name(p1)}  ${t("vs")}  ⭕ ${name(p2)}${session.vsBot ? ` (${t(TTT_DIFFICULTY_LABELS[session.difficulty])})` : ""}`,
            betLabel(session.bet),
            "",
            status,
            session.note,
        ].filter((line) => line !== null).join("\n"),
        rows,
    });
}

async function finish(session: TttSession, result: 1 | 2 | 3 | 4): Promise<void> {
    session.result = result;
    sessions.end(session.id);
    rememberForRematch(session);
    const { guildId } = session;
    const [p1, p2] = session.players;
    if (session.vsBot) {
        if (result === 4) {
            await refundBet(guildId, p1, session.bet, "galo");
            session.note = session.bet ? t("A aposta foi devolvida.") : null;
            return;
        }
        if (result === 1) {
            const prize = Math.floor(session.bet * BOT_PAYOUT[session.difficulty]);
            await payOut(guildId, p1, prize, "galo");
            session.note = session.bet ? t("Ganhaste {coins}!", { coins: formatCoins(prize) }) : null;
            track(guildId, p1, "galo", "win", { coinsWon: prize - session.bet });
        } else if (result === 3) {
            await refundBet(guildId, p1, session.bet, "galo");
            session.note = session.bet ? t("A aposta foi devolvida.") : null;
            track(guildId, p1, "galo", "draw");
        } else {
            session.note = session.bet ? t("Perdeste {coins}.", { coins: formatCoins(session.bet) }) : null;
            track(guildId, p1, "galo", "loss", { coinsLost: session.bet });
        }
        return;
    }
    // Contra outro membro.
    if (result === 3) {
        await refundBet(guildId, p1, session.bet, "galo");
        await refundBet(guildId, p2, session.bet, "galo");
        track(guildId, p1, "galo", "draw");
        track(guildId, p2, "galo", "draw");
        session.note = session.bet ? t("As apostas foram devolvidas.") : null;
        return;
    }
    // Vitória (ou abandono: perde quem tinha a vez).
    const winnerIdx = result === 4 ? (session.turn === 1 ? 2 : 1) : result;
    if (result === 4) session.result = winnerIdx as 1 | 2;
    const winner = session.players[winnerIdx - 1]!;
    const loser = session.players[winnerIdx === 1 ? 1 : 0]!;
    const pot = session.bet * 2;
    await payOut(guildId, winner, pot, "galo");
    const reward = session.bet ? 0 : await rewardWin(guildId, winner, (await getGamesSettings(guildId)).win_reward, "galo");
    track(guildId, winner, "galo", "win", { coinsWon: session.bet + reward });
    track(guildId, loser, "galo", "loss", { coinsLost: session.bet });
    const prefix = result === 4 ? `⌛ ${t("{loser} não jogou a tempo.", { loser: `<@${loser}>` })} ` : "";
    session.note = `${prefix}${session.bet ? t("{winner} leva {coins}.", { winner: `<@${winner}>`, coins: formatCoins(pot) }) : reward ? t("Prémio: {coins}.", { coins: formatCoins(reward) }) : ""}`.trim() || null;
}

function expire(session: TttSession): void {
    void (async () => {
        await finish(session, 4);
        await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    })();
}

function createSession(guildId: string, channelId: string, players: [string, string], vsBot: boolean, difficulty: TttDifficulty, bet: number): TttSession {
    return { id: newGameId(), guildId, channelId, players, vsBot, difficulty, board: Array(9).fill(0) as Cell[], turn: 1, bet, result: 0, line: null, note: null, message: null };
}

/** /galo contra o bot. */
export async function startTttVsBot(interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">, difficulty: TttDifficulty, bet: number, viaUpdate = false): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    const problem = await betProblem(interaction.guildId, interaction.user.id, bet, settings);
    if (problem) return void replyError(interaction, problem);
    if (!(await escrowBet(interaction.guildId, interaction.user.id, bet, "galo"))) return void replyError(interaction, t("Não tens moedas suficientes."));
    const session = createSession(interaction.guildId, interaction.channelId, [interaction.user.id, interaction.client.user.id], true, difficulty, bet);
    sessions.set(session, IDLE_MS, expire);
    const payload = { components: [render(session)], allowedMentions: { parse: [] } };
    if (viaUpdate && interaction.isButton()) {
        await interaction.reply({ ...payload, flags: CV2_FLAG });
        session.message = await interaction.fetchReply().catch(() => null);
    } else {
        const response = await interaction.reply({ ...payload, flags: CV2_FLAG, withResponse: true });
        session.message = response.resource?.message ?? null;
    }
}

/** /galo @adversário — lança o desafio. */
export async function challengeTtt(interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">, opponent: GuildMember, bet: number): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    await sendChallenge(interaction, settings, {
        game: "galo",
        opponent,
        bet,
        start: async (accept: ButtonInteraction<"cached">, challenge: Challenge) => {
            const session = createSession(challenge.guildId, challenge.channelId, [challenge.challengerId, challenge.opponentId], false, "normal", challenge.bet);
            sessions.set(session, IDLE_MS, expire);
            session.message = accept.message;
            await accept.update({ components: [render(session)], allowedMentions: { users: [challenge.challengerId] } });
        },
    });
}

export async function handleTttButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    if (action === "again") return rematch(interaction, id);
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    if (!session.players.includes(interaction.user.id) || (session.vsBot && interaction.user.id !== session.players[0])) return void notYourGame(interaction);
    if (session.players[session.turn - 1] !== interaction.user.id) return void replyError(interaction, t("Não é a tua vez."));
    const cell = Number(action);
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || session.board[cell]) return void interaction.deferUpdate();

    session.board[cell] = session.turn;
    let outcome = winnerOf(session.board);
    if (!outcome.winner && session.board.every(Boolean)) {
        await finish(session, 3);
    } else if (outcome.winner) {
        session.line = outcome.line;
        await finish(session, outcome.winner as 1 | 2);
    } else {
        session.turn = session.turn === 1 ? 2 : 1;
        if (session.vsBot) {
            const move = botMove(session);
            if (move >= 0) session.board[move] = 2;
            outcome = winnerOf(session.board);
            if (outcome.winner) {
                session.line = outcome.line;
                await finish(session, 2);
            } else if (session.board.every(Boolean)) {
                await finish(session, 3);
            } else {
                session.turn = 1;
            }
        }
        if (session.result === 0) sessions.touch(session.id, IDLE_MS, expire);
    }
    session.message = interaction.message;
    await interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
}

// Desforra: guarda-se o essencial do jogo acabado pelo id da mensagem.
const finished = new Map<string, { players: [string, string]; vsBot: boolean; difficulty: TttDifficulty; bet: number }>();

async function rematch(interaction: ButtonInteraction<"cached">, id: string): Promise<void> {
    const info = finished.get(id);
    if (!info) return void replyError(interaction, t("Já não dá para pedir desforra deste jogo — começa outro com `/galo`."));
    if (!info.players.includes(interaction.user.id)) return void notYourGame(interaction);
    if (info.vsBot) return startTttVsBot(interaction, info.difficulty, info.bet, true);
    const otherId = info.players.find((player) => player !== interaction.user.id)!;
    const opponent = await interaction.guild.members.fetch(otherId).catch(() => null);
    if (!opponent) return void replyError(interaction, t("O adversário já não está no servidor."));
    await challengeTtt(interaction, opponent, info.bet);
}

/** Guarda o essencial de um jogo acabado durante 30 min, para a desforra. */
function rememberForRematch(session: TttSession): void {
    finished.set(session.id, { players: session.players, vsBot: session.vsBot, difficulty: session.difficulty, bet: session.bet });
    setTimeout(() => finished.delete(session.id), 30 * 60_000).unref?.();
}
