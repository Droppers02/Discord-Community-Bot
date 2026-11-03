import { createHash } from "node:crypto";
import { ButtonBuilder, ButtonStyle, LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ChatInputCommandInteraction, type Message, type ModalSubmitInteraction } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { dailyBoard, finishDaily, getDaily, startDaily } from "../../repositories/gameStatsRepository.js";
import { formatCoins, lisbonDay } from "../economy/economyService.js";
import { TERMO_WORDS } from "./data/words.js";
import { gameFrame, gameGate, newGameId, notYourGame, replyError, rewardWin, Sessions, track, type BaseSession } from "./gameCore.js";
import { getGamesSettings } from "./gamesSettings.js";
import { ALPHABET, baseWord } from "./textUtil.js";

// Termo: descobre a palavra de 5 letras em 6 tentativas. 🟩 letra no sítio certo, 🟨 existe
// noutra posição, ⬛ não existe. O "termo do dia" é igual para toda a gente e só se joga uma
// vez; o modo livre sorteia uma palavra nova sempre que quiseres.

const MAX_ATTEMPTS = 6;
const IDLE_MS = 10 * 60_000;
type Mark = "g" | "y" | "b";
const SQUARE: Record<Mark, string> = { g: "🟩", y: "🟨", b: "⬛" };

interface TermoSession extends BaseSession {
    userId: string;
    daily: string | null;
    answer: string;
    guesses: Array<{ word: string; marks: Mark[] }>;
    result: 0 | 1 | 2 | 4;
    note: string | null;
    message: Message | null;
}

const sessions = new Sessions<TermoSession>();

/** Avaliação com letras repetidas tratadas como no original (cada letra só "conta" uma vez). */
export function evaluateGuess(guess: string, answer: string): Mark[] {
    const g = baseWord(guess).split("");
    const a = baseWord(answer).split("");
    const marks: Mark[] = Array(5).fill("b");
    const left = new Map<string, number>();
    for (let i = 0; i < 5; i++) {
        if (g[i] === a[i]) marks[i] = "g";
        else left.set(a[i]!, (left.get(a[i]!) ?? 0) + 1);
    }
    for (let i = 0; i < 5; i++) {
        if (marks[i] === "g") continue;
        const n = left.get(g[i]!) ?? 0;
        if (n > 0) {
            marks[i] = "y";
            left.set(g[i]!, n - 1);
        }
    }
    return marks;
}

/** Palavra do dia: a mesma para todos, a partir da data de Lisboa. */
export function dailyWord(day: string): string {
    const hash = createHash("sha256").update(`epa-termo:${day}`).digest();
    return TERMO_WORDS[hash.readUInt32BE(0) % TERMO_WORDS.length]!;
}

function keyboard(session: TermoSession): string {
    const state = new Map<string, Mark>();
    for (const { word, marks } of session.guesses) {
        baseWord(word).split("").forEach((letter, i) => {
            const mark = marks[i]!;
            const current = state.get(letter);
            if (mark === "g" || (mark === "y" && current !== "g") || (!current)) state.set(letter, mark);
        });
    }
    const line = (letters: string) => letters.split("").map((letter) => {
        const mark = state.get(letter);
        return mark === "g" ? `**${letter}**` : mark === "y" ? `__${letter}__` : mark === "b" ? `~~${letter}~~` : letter;
    }).join(" ");
    return [line("QWERTYUIOP"), line("ASDFGHJKL"), line("ZXCVBNM")].join("\n");
}

function render(session: TermoSession) {
    const lines = session.guesses.map(({ word, marks }) => `${marks.map((mark) => SQUARE[mark]).join("")}  \`${baseWord(word).split("").join(" ")}\``);
    for (let i = session.guesses.length; i < MAX_ATTEMPTS; i++) lines.push("⬜⬜⬜⬜⬜");
    let status: string;
    if (session.result === 1) status = `🏆 ${t("Acertaste em {n}/{max}!", { n: session.guesses.length, max: MAX_ATTEMPTS })}`;
    else if (session.result === 2) status = `💀 ${t("Não foi desta. A palavra era **{word}**.", { word: session.answer })}`;
    else if (session.result === 4) status = `⌛ ${t("Jogo abandonado. A palavra era **{word}**.", { word: session.answer })}`;
    else status = t("Tentativa {n} de {max}.", { n: session.guesses.length + 1, max: MAX_ATTEMPTS });
    return gameFrame({
        color: session.result === 1 ? COLORS.success : session.result === 0 ? COLORS.primary : COLORS.danger,
        title: `🟩 ${session.daily ? t("Termo do dia — {day}", { day: session.daily }) : t("Termo")}`,
        body: [
            `${t("Jogador: {user}", { user: `<@${session.userId}>` })}`,
            "",
            lines.join("\n"),
            "",
            session.result === 0 ? keyboard(session) : null,
            session.result === 0 ? `-# ${t("**negrito** = sítio certo · __sublinhado__ = noutra posição · ~~riscado~~ = não existe")}` : null,
            "",
            status,
            session.note,
        ].filter((line) => line !== null).join("\n"),
        rows: session.result === 0 ? [row(
            new ButtonBuilder().setCustomId(buildCustomId("g", "termo", session.id, "guess")).setLabel(t("Tentar palavra")).setEmoji("✍️").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(buildCustomId("g", "termo", session.id, "quit")).setLabel(t("Desistir")).setStyle(ButtonStyle.Secondary),
        )] : [],
    });
}

/** Partilha sem spoilers (só os quadrados). */
function shareText(session: TermoSession): string {
    return session.guesses.map(({ marks }) => marks.map((mark) => SQUARE[mark]).join("")).join("\n");
}

async function finish(session: TermoSession, result: 1 | 2 | 4): Promise<void> {
    session.result = result;
    sessions.end(session.id);
    const { guildId, userId } = session;
    if (session.daily) {
        await finishDaily(guildId, userId, "termo", session.daily, result === 1 ? "win" : "loss", session.guesses.length).catch((error) => logger.warn("Termo: falha a fechar o diário:", error));
    }
    if (result === 4) return;
    if (result === 1) {
        const settings = await getGamesSettings(guildId);
        const base = session.daily ? settings.daily_word_reward : settings.word_reward;
        // Menos tentativas, mais prémio: 1.ª = 100%, 6.ª ≈ 40%.
        const factor = 1 - (session.guesses.length - 1) * 0.12;
        const reward = await rewardWin(guildId, userId, Math.round(base * factor), "termo");
        track(guildId, userId, "termo", "win", { coinsWon: reward, score: MAX_ATTEMPTS + 1 - session.guesses.length });
        session.note = reward ? t("Prémio: {coins}.", { coins: formatCoins(reward) }) : null;
    } else {
        track(guildId, userId, "termo", "loss");
    }
}

function expire(session: TermoSession): void {
    void (async () => {
        await finish(session, 4);
        await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    })();
}

export async function startTermo(interaction: ChatInputCommandInteraction<"cached">, daily: boolean): Promise<void> {
    if (!(await gameGate(interaction))) return;
    const day = lisbonDay(Date.now());
    if (daily) {
        const existing = await getDaily(interaction.guildId, interaction.user.id, "termo", day);
        if (existing) {
            const board = await dailyBoard(interaction.guildId, "termo", day);
            const lines = board.map((entry, i) => `**${i + 1}.** <@${entry.user_id}> — ${entry.result === "win" ? t("{n}/6", { n: entry.attempts }) : "❌"}`);
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.neutral,
                    title: `🟩 ${t("Termo do dia — {day}", { day })}`,
                    description: [
                        existing.result === "playing" ? t("Já começaste o termo de hoje noutra mensagem.") : t("Já jogaste o termo de hoje ({result}). Volta amanhã!", { result: existing.result === "win" ? t("acertaste em {n}", { n: existing.attempts }) : t("não acertaste") }),
                        lines.length ? `\n**${t("Quadro de hoje")}**\n${lines.join("\n")}` : null,
                    ].filter(Boolean).join("\n"),
                })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
                allowedMentions: { parse: [] },
            });
        }
        if (!(await startDaily(interaction.guildId, interaction.user.id, "termo", day))) return void replyError(interaction, t("Já jogaste o termo de hoje."));
    }
    const session: TermoSession = {
        id: newGameId(),
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        daily: daily ? day : null,
        answer: daily ? dailyWord(day) : TERMO_WORDS[Math.floor(Math.random() * TERMO_WORDS.length)]!,
        guesses: [],
        result: 0,
        note: null,
        message: null,
    };
    sessions.set(session, IDLE_MS, expire);
    // O termo do dia joga-se em privado (efémero) para não estragar a palavra aos outros; no
    // fim, o resultado (só os quadrados) é partilhado no canal.
    const flags = daily ? CV2_FLAG | MessageFlags.Ephemeral : CV2_FLAG;
    const response = await interaction.reply({ components: [render(session)], flags, allowedMentions: { parse: [] }, withResponse: true });
    session.message = daily ? null : response.resource?.message ?? null;
}

export async function handleTermoButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    if (session.userId !== interaction.user.id) return void notYourGame(interaction);
    if (action === "quit") {
        await finish(session, 2);
        return void interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
    }
    await interaction.showModal(new ModalBuilder()
        .setCustomId(buildCustomId("g", "termo", session.id, "submit"))
        .setTitle(t("Tentativa {n} de {max}", { n: session.guesses.length + 1, max: MAX_ATTEMPTS }))
        .addLabelComponents(new LabelBuilder()
            .setLabel(t("Palavra de 5 letras"))
            .setTextInputComponent(new TextInputBuilder().setCustomId("word").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(5).setMaxLength(5))));
}

export async function handleTermoModal(interaction: ModalSubmitInteraction<"cached">, id: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    if (session.userId !== interaction.user.id) return void notYourGame(interaction);
    const raw = interaction.fields.getTextInputValue("word").trim();
    const guess = baseWord(raw);
    if (guess.length !== 5 || ![...guess].every((letter) => ALPHABET.includes(letter))) {
        return void replyError(interaction, t("Escreve uma palavra com 5 letras (sem números nem espaços)."));
    }
    session.guesses.push({ word: raw.toUpperCase(), marks: evaluateGuess(guess, session.answer) });
    if (guess === baseWord(session.answer)) await finish(session, 1);
    else if (session.guesses.length >= MAX_ATTEMPTS) await finish(session, 2);
    else sessions.touch(session.id, IDLE_MS, expire);

    if (interaction.isFromMessage()) await interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
    else {
        await interaction.deferUpdate().catch(() => null);
        await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    }
    if (session.result !== 0 && session.daily && interaction.channel?.isSendable()) {
        const won = session.result === 1;
        await interaction.channel.send({
            components: [buildContainer({
                color: won ? COLORS.success : COLORS.neutral,
                title: `🟩 ${t("Termo do dia — {day}", { day: session.daily })}`,
                description: [
                    won
                        ? t("{user} acertou em **{n}/{max}**!", { user: `<@${session.userId}>`, n: session.guesses.length, max: MAX_ATTEMPTS })
                        : t("{user} não acertou hoje.", { user: `<@${session.userId}>` }),
                    shareText(session),
                    `-# ${t("Joga também com `/termo`.")}`,
                ].join("\n"),
            })],
            flags: CV2_FLAG,
            allowedMentions: { parse: [] },
        }).catch(() => null);
    }
}
