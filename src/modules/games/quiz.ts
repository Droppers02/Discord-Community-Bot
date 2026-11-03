import { ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, type Message } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { formatCoins } from "../economy/economyService.js";
import { QUIZ_CATEGORY_LABELS, QUIZ_QUESTIONS, type QuizCategory, type QuizQuestion } from "./data/quiz.js";
import { gameFrame, gameGate, newGameId, replyError, rewardWin, track } from "./gameCore.js";
import { getGamesSettings } from "./gamesSettings.js";
import { shuffle } from "./textUtil.js";

// Quiz para o canal inteiro: cada pergunta fica aberta uns segundos; quem acerta ganha pontos
// (mais se for rápido). No fim, pódio, estatísticas e moedas por resposta certa.

const LETTERS = ["A", "B", "C", "D"] as const;
const ANSWER_MS = 20_000;
const PAUSE_MS = 4_000;
const MEDALS = ["🥇", "🥈", "🥉"];

interface QuizRound {
    question: QuizQuestion;
    options: string[];
    correct: number;
    answers: Map<string, { choice: number; at: number }>;
    startedAt: number;
}

interface QuizSession {
    id: string;
    guildId: string;
    channelId: string;
    hostId: string;
    category: QuizCategory | null;
    questions: QuizQuestion[];
    index: number;
    round: QuizRound | null;
    scores: Map<string, { points: number; correct: number }>;
    message: Message | null;
    timer: NodeJS.Timeout | null;
    stopped: boolean;
}

const sessions = new Map<string, QuizSession>();
/** Um quiz de cada vez por canal. */
const byChannel = new Map<string, string>();

function scoreboard(session: QuizSession, limit = 10): string {
    const sorted = [...session.scores.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, limit);
    if (!sorted.length) return t("*Ninguém pontuou.*");
    return sorted.map(([userId, score], i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${userId}> — ${t("{points} pts", { points: score.points })} (${score.correct}✓)`).join("\n");
}

function questionView(session: QuizSession, reveal: boolean) {
    const round = session.round!;
    const total = session.questions.length;
    const optionsText = round.options.map((option, i) => {
        const mark = reveal ? (i === round.correct ? "✅" : "▫️") : "▫️";
        return `${mark} **${LETTERS[i]}.** ${option}`;
    }).join("\n");
    let footer: string;
    if (reveal) {
        const right = [...round.answers.entries()].filter(([, answer]) => answer.choice === round.correct).map(([userId]) => `<@${userId}>`);
        footer = right.length ? t("Acertaram: {users}", { users: right.join(", ") }) : t("Ninguém acertou!");
    } else {
        footer = t("Responde até {at} · {count, plural, one {# resposta} other {# respostas}}", { at: `<t:${Math.ceil((round.startedAt + ANSWER_MS) / 1000)}:R>`, count: round.answers.size });
    }
    const buttons = LETTERS.map((letter, i) => new ButtonBuilder()
        .setCustomId(buildCustomId("g", "quiz", session.id, i))
        .setLabel(`${letter}. ${round.options[i]!}`.slice(0, 80))
        .setStyle(reveal ? (i === round.correct ? ButtonStyle.Success : ButtonStyle.Secondary) : ButtonStyle.Primary)
        .setDisabled(reveal));
    return gameFrame({
        color: reveal ? COLORS.success : COLORS.primary,
        title: `🧠 ${t("Quiz — pergunta {n} de {total}", { n: session.index + 1, total })}`,
        body: [
            `-# ${t(QUIZ_CATEGORY_LABELS[round.question.category])}`,
            `### ${round.question.question}`,
            optionsText,
            "",
            footer,
            reveal ? `\n**${t("Classificação")}**\n${scoreboard(session, 5)}` : null,
        ].filter((line) => line !== null).join("\n"),
        rows: [row(...buttons.slice(0, 2)), row(...buttons.slice(2, 4)), ...(reveal ? [] : [row(new ButtonBuilder().setCustomId(buildCustomId("g", "quiz", session.id, "stop")).setLabel(t("Terminar quiz")).setStyle(ButtonStyle.Danger))])],
    });
}

async function edit(session: QuizSession, components: ReturnType<typeof gameFrame>[]): Promise<void> {
    await session.message?.edit({ components, allowedMentions: { parse: [] } }).catch((error) => logger.warn("Quiz: falha a atualizar a mensagem:", error));
}

function schedule(session: QuizSession, ms: number, fn: () => Promise<void>): void {
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => void fn().catch((error) => logger.warn("Quiz: erro no temporizador:", error)), ms);
    session.timer.unref?.();
}

function nextQuestion(session: QuizSession): void {
    const question = session.questions[session.index]!;
    const order = shuffle([0, 1, 2, 3]);
    session.round = {
        question,
        options: order.map((i) => question.answers[i]!),
        correct: order.indexOf(0),
        answers: new Map(),
        startedAt: Date.now(),
    };
    schedule(session, ANSWER_MS, () => reveal(session));
}

async function reveal(session: QuizSession): Promise<void> {
    if (session.stopped || !session.round) return;
    const round = session.round;
    for (const [userId, answer] of round.answers) {
        const score = session.scores.get(userId) ?? { points: 0, correct: 0 };
        if (answer.choice === round.correct) {
            // 100 pontos por acertar + até 50 pela rapidez.
            const speed = Math.max(0, 1 - (answer.at - round.startedAt) / ANSWER_MS);
            score.points += 100 + Math.round(50 * speed);
            score.correct += 1;
        }
        session.scores.set(userId, score);
    }
    await edit(session, [questionView(session, true)]);
    session.index++;
    if (session.index >= session.questions.length) return schedule(session, PAUSE_MS, () => finish(session));
    schedule(session, PAUSE_MS, async () => {
        if (session.stopped) return;
        nextQuestion(session);
        await edit(session, [questionView(session, false)]);
    });
}

async function finish(session: QuizSession): Promise<void> {
    session.stopped = true;
    if (session.timer) clearTimeout(session.timer);
    sessions.delete(session.id);
    byChannel.delete(session.channelId);
    const settings = await getGamesSettings(session.guildId);
    const ranking = [...session.scores.entries()].sort((a, b) => b[1].points - a[1].points);
    const top = ranking[0]?.[1].points ?? 0;
    const rewards: string[] = [];
    for (const [userId, score] of ranking) {
        const won = score.points === top && top > 0;
        const coins = await rewardWin(session.guildId, userId, score.correct * settings.quiz_reward, "quiz");
        if (coins) rewards.push(`<@${userId}> +${formatCoins(coins)}`);
        track(session.guildId, userId, "quiz", won ? "win" : "played", { score: score.points, coinsWon: coins });
    }
    await edit(session, [gameFrame({
        color: COLORS.gold,
        title: `🧠 ${t("Quiz terminado!")}`,
        body: [
            `**${t("Classificação final")}**`,
            scoreboard(session),
            rewards.length ? `\n${t("Prémios")}: ${rewards.slice(0, 10).join(" · ")}` : null,
        ].filter(Boolean).join("\n"),
    })]);
}

export async function startQuiz(interaction: ChatInputCommandInteraction<"cached">, category: QuizCategory | null, rounds: number): Promise<void> {
    if (!(await gameGate(interaction))) return;
    const running = byChannel.get(interaction.channelId);
    if (running && sessions.has(running)) return void replyError(interaction, t("Já há um quiz a decorrer neste canal."));
    const pool = category ? QUIZ_QUESTIONS.filter((question) => question.category === category) : QUIZ_QUESTIONS;
    const session: QuizSession = {
        id: newGameId(),
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        hostId: interaction.user.id,
        category,
        questions: shuffle(pool).slice(0, Math.max(1, Math.min(rounds, pool.length))),
        index: 0,
        round: null,
        scores: new Map(),
        message: null,
        timer: null,
        stopped: false,
    };
    sessions.set(session.id, session);
    byChannel.set(session.channelId, session.id);
    nextQuestion(session);
    const response = await interaction.reply({ components: [questionView(session, false)], flags: CV2_FLAG, allowedMentions: { parse: [] }, withResponse: true });
    session.message = response.resource?.message ?? null;
}

export async function handleQuizButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.stopped || !session.round) return void replyError(interaction, t("Este quiz já acabou."));
    session.message = interaction.message;
    if (action === "stop") {
        const member = interaction.member;
        if (interaction.user.id !== session.hostId && !member.permissions.has("ManageMessages")) return void replyError(interaction, t("Só quem começou o quiz (ou a staff) o pode terminar."));
        await interaction.deferUpdate();
        return finish(session);
    }
    const choice = Number(action);
    const round = session.round;
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return void interaction.deferUpdate();
    if (Date.now() - round.startedAt > ANSWER_MS) return void replyError(interaction, t("O tempo desta pergunta já acabou."));
    if (round.answers.has(interaction.user.id)) return void replyError(interaction, t("Já respondeste a esta pergunta."));
    round.answers.set(interaction.user.id, { choice, at: Date.now() });
    await interaction.update({ components: [questionView(session, false)], allowedMentions: { parse: [] } });
}
