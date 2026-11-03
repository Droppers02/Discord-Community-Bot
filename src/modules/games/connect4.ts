import { ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember, type Message } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { t, tk } from "../../lib/i18n.js";
import { formatCoins } from "../economy/economyService.js";
import { sendChallenge, type Challenge } from "./challenge.js";
import { betLabel, betProblem, escrowBet, gameFrame, gameGate, newGameId, notYourGame, payOut, refundBet, replyError, rewardWin, Sessions, track, type BaseSession } from "./gameCore.js";
import { getGamesSettings } from "./gamesSettings.js";

// 4 em Linha: tabuleiro 6×7. 🔴 começa (quem desafia, ou o membro contra o bot).

export const C4_DIFFICULTIES = ["facil", "normal", "dificil"] as const;
export type C4Difficulty = (typeof C4_DIFFICULTIES)[number];
export const C4_DIFFICULTY_LABELS: Record<C4Difficulty, string> = { facil: tk("Fácil"), normal: tk("Normal"), dificil: tk("Difícil") };
const BOT_DEPTH: Record<C4Difficulty, number> = { facil: 1, normal: 3, dificil: 6 };
const BOT_PAYOUT: Record<C4Difficulty, number> = { facil: 1.5, normal: 2, dificil: 3 };

const ROWS = 6;
const COLS = 7;
const IDLE_MS = 4 * 60_000;
const DISC = ["⚫", "🔴", "🟡"] as const;
const WIN_DISC = ["⚫", "❤️", "💛"] as const;
const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];

type Cell = 0 | 1 | 2;

interface C4Session extends BaseSession {
    players: [string, string];
    vsBot: boolean;
    difficulty: C4Difficulty;
    /** board[r][c], r=0 em cima. */
    board: Cell[][];
    turn: 1 | 2;
    bet: number;
    result: 0 | 1 | 2 | 3 | 4;
    winCells: Array<[number, number]>;
    lastMove: [number, number] | null;
    note: string | null;
    message: Message | null;
}

const sessions = new Sessions<C4Session>();
const finished = new Map<string, { players: [string, string]; vsBot: boolean; difficulty: C4Difficulty; bet: number }>();

function emptyBoard(): Cell[][] {
    return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}

function dropRow(board: Cell[][], col: number): number {
    for (let r = ROWS - 1; r >= 0; r--) if (!board[r]![col]) return r;
    return -1;
}

function findWin(board: Cell[][]): { winner: Cell; cells: Array<[number, number]> } {
    const dirs: Array<[number, number]> = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const p = board[r]![c]!;
            if (!p) continue;
            for (const [dr, dc] of dirs) {
                const cells: Array<[number, number]> = [[r, c]];
                for (let k = 1; k < 4; k++) {
                    const rr = r + dr * k;
                    const cc = c + dc * k;
                    if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || board[rr]![cc] !== p) break;
                    cells.push([rr, cc]);
                }
                if (cells.length === 4) return { winner: p, cells };
            }
        }
    }
    return { winner: 0, cells: [] };
}

const isFull = (board: Cell[][]) => board[0]!.every(Boolean);

// ─── Bot (negamax com cortes alfa-beta) ──────────────────────────────────────

function scoreWindow(window: Cell[], me: Cell): number {
    const other: Cell = me === 1 ? 2 : 1;
    const mine = window.filter((cell) => cell === me).length;
    const theirs = window.filter((cell) => cell === other).length;
    const empty = window.filter((cell) => cell === 0).length;
    if (mine === 4) return 1000;
    if (mine === 3 && empty === 1) return 6;
    if (mine === 2 && empty === 2) return 2;
    if (theirs === 3 && empty === 1) return -8;
    return 0;
}

function evaluate(board: Cell[][], me: Cell): number {
    let score = 0;
    for (let r = 0; r < ROWS; r++) if (board[r]![3] === me) score += 3;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (c + 3 < COLS) score += scoreWindow([0, 1, 2, 3].map((k) => board[r]![c + k]!), me);
            if (r + 3 < ROWS) score += scoreWindow([0, 1, 2, 3].map((k) => board[r + k]![c]!), me);
            if (r + 3 < ROWS && c + 3 < COLS) score += scoreWindow([0, 1, 2, 3].map((k) => board[r + k]![c + k]!), me);
            if (r + 3 < ROWS && c - 3 >= 0) score += scoreWindow([0, 1, 2, 3].map((k) => board[r + k]![c - k]!), me);
        }
    }
    return score;
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];

function negamax(board: Cell[][], depth: number, alpha: number, beta: number, player: Cell): number {
    const { winner } = findWin(board);
    if (winner) return winner === player ? 100_000 + depth : -100_000 - depth;
    if (isFull(board)) return 0;
    if (depth === 0) return evaluate(board, player) - evaluate(board, player === 1 ? 2 : 1);
    let best = -Infinity;
    for (const col of ORDER) {
        const r = dropRow(board, col);
        if (r < 0) continue;
        board[r]![col] = player;
        const score = -negamax(board, depth - 1, -beta, -alpha, player === 1 ? 2 : 1);
        board[r]![col] = 0;
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

function botColumn(session: C4Session): number {
    const valid = ORDER.filter((col) => dropRow(session.board, col) >= 0);
    if (session.difficulty === "facil" && Math.random() < 0.35) return valid[Math.floor(Math.random() * valid.length)] ?? -1;
    let best = -Infinity;
    let choices: number[] = [];
    for (const col of valid) {
        const r = dropRow(session.board, col);
        session.board[r]![col] = 2;
        const score = -negamax(session.board, BOT_DEPTH[session.difficulty] - 1, -Infinity, Infinity, 1);
        session.board[r]![col] = 0;
        if (score > best) { best = score; choices = [col]; } else if (score === best) choices.push(col);
    }
    return choices[Math.floor(Math.random() * choices.length)] ?? -1;
}

// ─── Desenho ─────────────────────────────────────────────────────────────────

function render(session: C4Session) {
    const name = (id: string) => (session.vsBot && id === session.players[1] ? t("o bot") : `<@${id}>`);
    const winSet = new Set(session.winCells.map(([r, c]) => `${r}:${c}`));
    const grid = session.board.map((cells, r) => cells.map((cell, c) => (winSet.has(`${r}:${c}`) ? WIN_DISC[cell] : DISC[cell])).join("")).join("\n");
    let status: string;
    if (session.result === 0) status = t("Vez de {disc} {player}.", { disc: DISC[session.turn], player: name(session.players[session.turn - 1]!) });
    else if (session.result === 3) status = `🤝 ${t("Empate — tabuleiro cheio!")}`;
    else if (session.result === 4) status = `⌛ ${t("Jogo abandonado.")}`;
    else status = `🏆 ${t("{player} ganhou!", { player: name(session.players[session.result - 1]!) })}`;

    const column = (col: number) => new ButtonBuilder()
        .setCustomId(buildCustomId("g", "c4", session.id, col))
        .setLabel(String(col + 1))
        .setStyle(session.lastMove?.[1] === col ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(session.result !== 0 || dropRow(session.board, col) < 0);
    const rows = session.result === 0
        ? [row(...[0, 1, 2, 3].map(column)), row(...[4, 5, 6].map(column))]
        : [row(new ButtonBuilder().setCustomId(buildCustomId("g", "c4", session.id, "again")).setLabel(t("Desforra")).setEmoji("🔁").setStyle(ButtonStyle.Primary))];

    return gameFrame({
        color: session.result === 0 ? (session.turn === 1 ? COLORS.danger : COLORS.warning) : session.result >= 3 ? COLORS.neutral : COLORS.success,
        title: `🔴 ${t("4 em Linha")}`,
        body: [
            `🔴 ${name(session.players[0])}  ${t("vs")}  🟡 ${name(session.players[1])}${session.vsBot ? ` (${t(C4_DIFFICULTY_LABELS[session.difficulty])})` : ""}`,
            betLabel(session.bet),
            "",
            NUMBERS.join(""),
            grid,
            "",
            status,
            session.note,
        ].filter((line) => line !== null).join("\n"),
        rows,
    });
}

// ─── Fim do jogo ─────────────────────────────────────────────────────────────

async function finish(session: C4Session, result: 1 | 2 | 3 | 4): Promise<void> {
    session.result = result;
    sessions.end(session.id);
    finished.set(session.id, { players: session.players, vsBot: session.vsBot, difficulty: session.difficulty, bet: session.bet });
    setTimeout(() => finished.delete(session.id), 30 * 60_000).unref?.();
    const { guildId } = session;
    const [p1, p2] = session.players;

    if (session.vsBot) {
        if (result === 1) {
            const prize = Math.floor(session.bet * BOT_PAYOUT[session.difficulty]);
            await payOut(guildId, p1, prize, "4emlinha");
            track(guildId, p1, "4emlinha", "win", { coinsWon: prize - session.bet });
            session.note = session.bet ? t("Ganhaste {coins}!", { coins: formatCoins(prize) }) : null;
        } else if (result === 2) {
            track(guildId, p1, "4emlinha", "loss", { coinsLost: session.bet });
            session.note = session.bet ? t("Perdeste {coins}.", { coins: formatCoins(session.bet) }) : null;
        } else {
            await refundBet(guildId, p1, session.bet, "4emlinha");
            if (result === 3) track(guildId, p1, "4emlinha", "draw");
            session.note = session.bet ? t("A aposta foi devolvida.") : null;
        }
        return;
    }
    if (result === 3) {
        await refundBet(guildId, p1, session.bet, "4emlinha");
        await refundBet(guildId, p2, session.bet, "4emlinha");
        track(guildId, p1, "4emlinha", "draw");
        track(guildId, p2, "4emlinha", "draw");
        session.note = session.bet ? t("As apostas foram devolvidas.") : null;
        return;
    }
    const winnerIdx = result === 4 ? (session.turn === 1 ? 2 : 1) : result;
    if (result === 4) session.result = winnerIdx as 1 | 2;
    const winner = session.players[winnerIdx - 1]!;
    const loser = session.players[winnerIdx === 1 ? 1 : 0]!;
    await payOut(guildId, winner, session.bet * 2, "4emlinha");
    const reward = session.bet ? 0 : await rewardWin(guildId, winner, (await getGamesSettings(guildId)).win_reward, "4emlinha");
    track(guildId, winner, "4emlinha", "win", { coinsWon: session.bet + reward });
    track(guildId, loser, "4emlinha", "loss", { coinsLost: session.bet });
    const prefix = result === 4 ? `⌛ ${t("{loser} não jogou a tempo.", { loser: `<@${loser}>` })} ` : "";
    session.note = `${prefix}${session.bet ? t("{winner} leva {coins}.", { winner: `<@${winner}>`, coins: formatCoins(session.bet * 2) }) : reward ? t("Prémio: {coins}.", { coins: formatCoins(reward) }) : ""}`.trim() || null;
}

function expire(session: C4Session): void {
    void (async () => {
        await finish(session, 4);
        await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    })();
}

function createSession(guildId: string, channelId: string, players: [string, string], vsBot: boolean, difficulty: C4Difficulty, bet: number): C4Session {
    return { id: newGameId(), guildId, channelId, players, vsBot, difficulty, board: emptyBoard(), turn: 1, bet, result: 0, winCells: [], lastMove: null, note: null, message: null };
}

export async function startC4VsBot(interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">, difficulty: C4Difficulty, bet: number): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    const problem = await betProblem(interaction.guildId, interaction.user.id, bet, settings);
    if (problem) return void replyError(interaction, problem);
    if (!(await escrowBet(interaction.guildId, interaction.user.id, bet, "4emlinha"))) return void replyError(interaction, t("Não tens moedas suficientes."));
    const session = createSession(interaction.guildId, interaction.channelId, [interaction.user.id, interaction.client.user.id], true, difficulty, bet);
    sessions.set(session, IDLE_MS, expire);
    const response = await interaction.reply({ components: [render(session)], flags: CV2_FLAG, allowedMentions: { parse: [] }, withResponse: true });
    session.message = response.resource?.message ?? null;
}

export async function challengeC4(interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">, opponent: GuildMember, bet: number): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    await sendChallenge(interaction, settings, {
        game: "4emlinha",
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

function play(session: C4Session, col: number, player: 1 | 2): boolean {
    const r = dropRow(session.board, col);
    if (r < 0) return false;
    session.board[r]![col] = player;
    session.lastMove = [r, col];
    return true;
}

export async function handleC4Button(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    if (action === "again") {
        const info = finished.get(id);
        if (!info) return void replyError(interaction, t("Já não dá para pedir desforra deste jogo — começa outro com `/4emlinha`."));
        if (!info.players.includes(interaction.user.id)) return void notYourGame(interaction);
        if (info.vsBot) return startC4VsBot(interaction, info.difficulty, info.bet);
        const opponent = await interaction.guild.members.fetch(info.players.find((p) => p !== interaction.user.id)!).catch(() => null);
        if (!opponent) return void replyError(interaction, t("O adversário já não está no servidor."));
        return challengeC4(interaction, opponent, info.bet);
    }
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    if (!session.players.includes(interaction.user.id) || (session.vsBot && interaction.user.id !== session.players[0])) return void notYourGame(interaction);
    if (session.players[session.turn - 1] !== interaction.user.id) return void replyError(interaction, t("Não é a tua vez."));
    const col = Number(action);
    if (!Number.isInteger(col) || col < 0 || col >= COLS || !play(session, col, session.turn)) return void interaction.deferUpdate();

    const check = async (): Promise<boolean> => {
        const win = findWin(session.board);
        if (win.winner) {
            session.winCells = win.cells;
            await finish(session, win.winner as 1 | 2);
            return true;
        }
        if (isFull(session.board)) {
            await finish(session, 3);
            return true;
        }
        return false;
    };

    if (!(await check())) {
        session.turn = session.turn === 1 ? 2 : 1;
        if (session.vsBot) {
            const botCol = botColumn(session);
            if (botCol >= 0) play(session, botCol, 2);
            if (!(await check())) session.turn = 1;
        }
        if (session.result === 0) sessions.touch(session.id, IDLE_MS, expire);
    }
    session.message = interaction.message;
    await interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
}
