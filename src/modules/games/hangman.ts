import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ChatInputCommandInteraction, type Message, type ModalSubmitInteraction, type StringSelectMenuInteraction } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { formatCoins } from "../economy/economyService.js";
import { HANGMAN_WORDS, type HangmanWord } from "./data/words.js";
import { gameFrame, gameGate, newGameId, notYourGame, replyError, rewardWin, Sessions, track, type BaseSession } from "./gameCore.js";
import { getGamesSettings } from "./gamesSettings.js";
import { ALPHABET, baseLetter, baseWord, isLetter } from "./textUtil.js";

// Forca: adivinha a palavra letra a letra (6 erros e enforcas). Sozinho, ou "aberta" — toda a
// gente no canal joga, e o prémio vai para quem a descobrir.

const MAX_WRONG = 6;
const IDLE_MS = 5 * 60_000;

const GALLOWS = [
    "  ┌───┐\n  │   ┆\n      ┆\n      ┆\n      ┆\n ═════╧═",
    "  ┌───┐\n  │   ┆\n  O   ┆\n      ┆\n      ┆\n ═════╧═",
    "  ┌───┐\n  │   ┆\n  O   ┆\n  |   ┆\n      ┆\n ═════╧═",
    "  ┌───┐\n  │   ┆\n  O   ┆\n /|   ┆\n      ┆\n ═════╧═",
    "  ┌───┐\n  │   ┆\n  O   ┆\n /|\\  ┆\n      ┆\n ═════╧═",
    "  ┌───┐\n  │   ┆\n  O   ┆\n /|\\  ┆\n /    ┆\n ═════╧═",
    "  ┌───┐\n  │   ┆\n  X   ┆\n /|\\  ┆\n / \\  ┆\n ═════╧═",
];

interface HangmanSession extends BaseSession {
    ownerId: string;
    open: boolean;
    entry: HangmanWord;
    guessed: Set<string>;
    wrong: number;
    /** Quem acertou letras (modo aberto). */
    helpers: Set<string>;
    result: 0 | 1 | 2 | 4;
    solverId: string | null;
    note: string | null;
    message: Message | null;
}

const sessions = new Sessions<HangmanSession>();

function isSolved(session: HangmanSession): boolean {
    return [...session.entry.word].every((char) => !isLetter(char) || session.guessed.has(baseLetter(char)));
}

function masked(session: HangmanSession, reveal: boolean): string {
    return [...session.entry.word].map((char) => {
        if (char === " ") return "   ";
        if (!isLetter(char)) return char;
        return reveal || session.guessed.has(baseLetter(char)) ? char : "_";
    }).join(" ");
}

function render(session: HangmanSession) {
    const ended = session.result !== 0;
    const wrongLetters = [...session.guessed].filter((letter) => !baseWord(session.entry.word).includes(letter));
    const remaining = ALPHABET.filter((letter) => !session.guessed.has(letter));
    let status: string;
    if (session.result === 1) status = `🏆 ${session.solverId ? t("{user} descobriu a palavra!", { user: `<@${session.solverId}>` }) : t("Descobriste a palavra!")}`;
    else if (session.result === 2) status = `💀 ${t("Enforcado! A palavra era **{word}**.", { word: session.entry.word })}`;
    else if (session.result === 4) status = `⌛ ${t("Jogo abandonado. A palavra era **{word}**.", { word: session.entry.word })}`;
    else status = session.open ? t("Toda a gente pode jogar — escolhe uma letra.") : t("Escolhe uma letra ou arrisca a palavra.");

    const rows = [];
    if (!ended) {
        const firstHalf = remaining.filter((letter) => letter <= "M");
        const secondHalf = remaining.filter((letter) => letter > "M");
        if (firstHalf.length) rows.push(row(new StringSelectMenuBuilder().setCustomId(buildCustomId("g", "hm", session.id, "l1")).setPlaceholder(t("Letras A–M")).addOptions(firstHalf.map((letter) => ({ label: letter, value: letter })))));
        if (secondHalf.length) rows.push(row(new StringSelectMenuBuilder().setCustomId(buildCustomId("g", "hm", session.id, "l2")).setPlaceholder(t("Letras N–Z")).addOptions(secondHalf.map((letter) => ({ label: letter, value: letter })))));
        rows.push(row(
            new ButtonBuilder().setCustomId(buildCustomId("g", "hm", session.id, "word")).setLabel(t("Arriscar a palavra")).setEmoji("💡").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(buildCustomId("g", "hm", session.id, "quit")).setLabel(t("Desistir")).setStyle(ButtonStyle.Secondary),
        ));
    }
    return gameFrame({
        color: session.result === 1 ? COLORS.success : session.result === 0 ? COLORS.primary : COLORS.danger,
        title: `🪢 ${t("Forca")}${session.open ? ` · ${t("aberta")}` : ""}`,
        body: [
            `${t("Categoria: **{category}**", { category: t(session.entry.category) })} · ${t("Dica: {hint}", { hint: t(session.entry.hint) })}`,
            "```",
            GALLOWS[Math.min(session.wrong, MAX_WRONG)],
            "```",
            `## \`${masked(session, ended)}\``,
            `${t("Erros: {wrong}/{max}", { wrong: session.wrong, max: MAX_WRONG })}${wrongLetters.length ? ` · ${wrongLetters.join(" ")}` : ""}`,
            "",
            status,
            session.note,
        ].filter((line) => line !== null).join("\n"),
        rows,
    });
}

async function finish(session: HangmanSession, result: 1 | 2 | 4, solverId: string | null): Promise<void> {
    session.result = result;
    session.solverId = solverId;
    sessions.end(session.id);
    if (result === 4) return;
    const { guildId } = session;
    if (!session.open) {
        if (result === 1) {
            const reward = await rewardWin(guildId, session.ownerId, (await getGamesSettings(guildId)).word_reward, "forca");
            track(guildId, session.ownerId, "forca", "win", { coinsWon: reward, score: MAX_WRONG - session.wrong });
            session.note = reward ? t("Prémio: {coins}.", { coins: formatCoins(reward) }) : null;
        } else {
            track(guildId, session.ownerId, "forca", "loss");
        }
        return;
    }
    // Aberta: quem resolveu leva o prémio; quem ajudou conta uma vitória.
    const players = new Set([...session.helpers, ...(solverId ? [solverId] : [])]);
    if (result === 1 && solverId) {
        const reward = await rewardWin(guildId, solverId, (await getGamesSettings(guildId)).word_reward, "forca");
        session.note = reward ? t("{user} leva {coins}.", { user: `<@${solverId}>`, coins: formatCoins(reward) }) : null;
        for (const player of players) track(guildId, player, "forca", "win", player === solverId ? { coinsWon: reward } : {});
    } else {
        for (const player of players) track(guildId, player, "forca", "loss");
    }
}

function expire(session: HangmanSession): void {
    void (async () => {
        await finish(session, 4, null);
        await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    })();
}

export async function startHangman(interaction: ChatInputCommandInteraction<"cached">, open: boolean, category: string | null): Promise<void> {
    if (!(await gameGate(interaction))) return;
    const pool = category ? HANGMAN_WORDS.filter((entry) => entry.category === category) : HANGMAN_WORDS;
    const entry = pool[Math.floor(Math.random() * pool.length)] ?? HANGMAN_WORDS[0]!;
    const session: HangmanSession = {
        id: newGameId(), guildId: interaction.guildId, channelId: interaction.channelId, ownerId: interaction.user.id, open, entry,
        guessed: new Set(), wrong: 0, helpers: new Set(), result: 0, solverId: null, note: null, message: null,
    };
    sessions.set(session, IDLE_MS, expire);
    const response = await interaction.reply({ components: [render(session)], flags: CV2_FLAG, allowedMentions: { parse: [] }, withResponse: true });
    session.message = response.resource?.message ?? null;
}

function canPlay(session: HangmanSession, userId: string): boolean {
    return session.open || session.ownerId === userId;
}

async function applyLetter(session: HangmanSession, letter: string, userId: string): Promise<void> {
    if (session.guessed.has(letter)) return;
    session.guessed.add(letter);
    if (baseWord(session.entry.word).includes(letter)) {
        session.helpers.add(userId);
        if (isSolved(session)) await finish(session, 1, session.open ? userId : null);
    } else {
        session.wrong++;
        if (session.wrong >= MAX_WRONG) await finish(session, 2, null);
    }
}

export async function handleHangmanSelect(interaction: StringSelectMenuInteraction<"cached">, id: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    if (!canPlay(session, interaction.user.id)) return void notYourGame(interaction);
    const letter = interaction.values[0] ?? "";
    if (!ALPHABET.includes(letter)) return void interaction.deferUpdate();
    await applyLetter(session, letter, interaction.user.id);
    if (session.result === 0) sessions.touch(session.id, IDLE_MS, expire);
    session.message = interaction.message;
    await interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
}

export async function handleHangmanButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    if (!canPlay(session, interaction.user.id)) return void notYourGame(interaction);
    if (action === "quit") {
        if (interaction.user.id !== session.ownerId) return void replyError(interaction, t("Só quem começou o jogo pode desistir."));
        await finish(session, 2, null);
        return void interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
    }
    if (action === "word") {
        return void interaction.showModal(new ModalBuilder()
            .setCustomId(buildCustomId("g", "hm", session.id, "guess"))
            .setTitle(t("Arriscar a palavra"))
            .addLabelComponents(new LabelBuilder()
                .setLabel(t("Qual é a palavra?"))
                .setDescription(t("Se errares, conta como dois erros."))
                .setTextInputComponent(new TextInputBuilder().setCustomId("word").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40))));
    }
    await interaction.deferUpdate();
}

export async function handleHangmanModal(interaction: ModalSubmitInteraction<"cached">, id: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    if (!canPlay(session, interaction.user.id)) return void notYourGame(interaction);
    const guess = baseWord(interaction.fields.getTextInputValue("word").trim()).replace(/\s+/g, " ");
    const answer = baseWord(session.entry.word);
    if (guess === answer || guess.replace(/[\s-]/g, "") === answer.replace(/[\s-]/g, "")) {
        for (const char of answer) if (/[A-Z]/.test(char)) session.guessed.add(char);
        session.helpers.add(interaction.user.id);
        await finish(session, 1, session.open ? interaction.user.id : null);
    } else {
        session.wrong = Math.min(MAX_WRONG, session.wrong + 2);
        if (session.wrong >= MAX_WRONG) await finish(session, 2, null);
        else session.note = `❌ ${t("{user} arriscou «{guess}» — errado!", { user: `<@${interaction.user.id}>`, guess: interaction.fields.getTextInputValue("word").trim().slice(0, 40) })}`;
    }
    if (session.result === 0) sessions.touch(session.id, IDLE_MS, expire);
    if (interaction.isFromMessage()) await interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
    else await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    if (session.result === 0) session.note = null;
}
