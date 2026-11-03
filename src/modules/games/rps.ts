import { randomInt } from "node:crypto";
import { ButtonBuilder, ButtonStyle, MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember, type Message } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { t, tk } from "../../lib/i18n.js";
import { formatCoins } from "../economy/economyService.js";
import { sendChallenge, type Challenge } from "./challenge.js";
import { betLabel, betProblem, escrowBet, gameFrame, gameGate, newGameId, notYourGame, payOut, refundBet, replyError, rewardWin, Sessions, track, type BaseSession } from "./gameCore.js";
import { getGamesSettings } from "./gamesSettings.js";

// Pedra, Papel, Tesoura — à melhor de 1, 3 ou 5. Contra outro membro, as escolhas ficam
// escondidas até os dois escolherem.

const CHOICES = ["pedra", "papel", "tesoura"] as const;
type Choice = (typeof CHOICES)[number];
const ICON: Record<Choice, string> = { pedra: "🪨", papel: "📄", tesoura: "✂️" };
const LABEL: Record<Choice, string> = { pedra: tk("Pedra"), papel: tk("Papel"), tesoura: tk("Tesoura") };
const BEATS: Record<Choice, Choice> = { pedra: "tesoura", papel: "pedra", tesoura: "papel" };
const IDLE_MS = 2 * 60_000;

interface RpsSession extends BaseSession {
    players: [string, string];
    vsBot: boolean;
    bestOf: number;
    bet: number;
    score: [number, number];
    picks: [Choice | null, Choice | null];
    history: string[];
    result: 0 | 1 | 2 | 4;
    note: string | null;
    message: Message | null;
}

const sessions = new Sessions<RpsSession>();

function name(session: RpsSession, idx: 0 | 1): string {
    return session.vsBot && idx === 1 ? t("o bot") : `<@${session.players[idx]}>`;
}

function render(session: RpsSession) {
    const needed = Math.ceil(session.bestOf / 2);
    const waiting = session.players.map((_, i) => (session.picks[i] ? "✅" : "⏳"));
    let status: string;
    if (session.result === 0) status = session.vsBot ? t("Escolhe a tua jogada.") : t("Escolham as vossas jogadas — ficam escondidas até os dois escolherem. {a} {first} · {b} {second}", { a: waiting[0], first: name(session, 0), b: waiting[1], second: name(session, 1) });
    else if (session.result === 4) status = `⌛ ${t("Jogo abandonado.")}`;
    else status = `🏆 ${t("{player} ganhou!", { player: name(session, (session.result - 1) as 0 | 1) })}`;

    const rows = session.result === 0
        ? [row(...CHOICES.map((choice) => new ButtonBuilder().setCustomId(buildCustomId("g", "rps", session.id, choice)).setLabel(t(LABEL[choice])).setEmoji(ICON[choice]).setStyle(ButtonStyle.Secondary)))]
        : [];
    return gameFrame({
        color: session.result === 0 ? COLORS.primary : session.result === 4 ? COLORS.neutral : COLORS.success,
        title: `✂️ ${t("Pedra, Papel, Tesoura")}`,
        body: [
            `${name(session, 0)} **${session.score[0]}** — **${session.score[1]}** ${name(session, 1)}`,
            `${t("À melhor de {n} (ganha quem chegar a {needed})", { n: session.bestOf, needed })} · ${betLabel(session.bet)}`,
            session.history.length ? `\n${session.history.slice(-5).join("\n")}` : null,
            "",
            status,
            session.note,
        ].filter((line) => line !== null).join("\n"),
        rows,
    });
}

async function finish(session: RpsSession, result: 1 | 2 | 4): Promise<void> {
    session.result = result;
    sessions.end(session.id);
    const { guildId } = session;
    const [p1, p2] = session.players;
    if (session.vsBot) {
        if (result === 1) {
            await payOut(guildId, p1, session.bet * 2, "ppt");
            track(guildId, p1, "ppt", "win", { coinsWon: session.bet });
            session.note = session.bet ? t("Ganhaste {coins}!", { coins: formatCoins(session.bet * 2) }) : null;
        } else if (result === 2) {
            track(guildId, p1, "ppt", "loss", { coinsLost: session.bet });
            session.note = session.bet ? t("Perdeste {coins}.", { coins: formatCoins(session.bet) }) : null;
        } else {
            await refundBet(guildId, p1, session.bet, "ppt");
        }
        return;
    }
    if (result === 4) {
        // Abandono: quem não escolheu perde; se nenhum escolheu, devolve-se tudo.
        const [a, b] = session.picks;
        if (!a && !b) {
            await refundBet(guildId, p1, session.bet, "ppt");
            await refundBet(guildId, p2, session.bet, "ppt");
            session.note = session.bet ? t("Ninguém jogou — as apostas foram devolvidas.") : null;
            return;
        }
        session.result = a ? 1 : 2;
    }
    const winnerIdx = session.result === 1 ? 0 : 1;
    const winner = session.players[winnerIdx];
    const loser = session.players[1 - winnerIdx]!;
    await payOut(guildId, winner, session.bet * 2, "ppt");
    const reward = session.bet ? 0 : await rewardWin(guildId, winner, (await getGamesSettings(guildId)).win_reward, "ppt");
    track(guildId, winner, "ppt", "win", { coinsWon: session.bet + reward });
    track(guildId, loser, "ppt", "loss", { coinsLost: session.bet });
    session.note = session.bet ? t("{winner} leva {coins}.", { winner: `<@${winner}>`, coins: formatCoins(session.bet * 2) }) : reward ? t("Prémio: {coins}.", { coins: formatCoins(reward) }) : null;
}

function expire(session: RpsSession): void {
    void (async () => {
        await finish(session, 4);
        await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    })();
}

function createSession(guildId: string, channelId: string, players: [string, string], vsBot: boolean, bestOf: number, bet: number): RpsSession {
    return { id: newGameId(), guildId, channelId, players, vsBot, bestOf, bet, score: [0, 0], picks: [null, null], history: [], result: 0, note: null, message: null };
}

export async function startRpsVsBot(interaction: ChatInputCommandInteraction<"cached">, bestOf: number, bet: number): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    const problem = await betProblem(interaction.guildId, interaction.user.id, bet, settings);
    if (problem) return void replyError(interaction, problem);
    if (!(await escrowBet(interaction.guildId, interaction.user.id, bet, "ppt"))) return void replyError(interaction, t("Não tens moedas suficientes."));
    const session = createSession(interaction.guildId, interaction.channelId, [interaction.user.id, interaction.client.user.id], true, bestOf, bet);
    sessions.set(session, IDLE_MS, expire);
    const response = await interaction.reply({ components: [render(session)], flags: CV2_FLAG, allowedMentions: { parse: [] }, withResponse: true });
    session.message = response.resource?.message ?? null;
}

export async function challengeRps(interaction: ChatInputCommandInteraction<"cached">, opponent: GuildMember, bestOf: number, bet: number): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    await sendChallenge(interaction, settings, {
        game: "ppt",
        opponent,
        bet,
        detail: t("à melhor de {n}", { n: bestOf }),
        start: async (accept: ButtonInteraction<"cached">, challenge: Challenge) => {
            const session = createSession(challenge.guildId, challenge.channelId, [challenge.challengerId, challenge.opponentId], false, bestOf, challenge.bet);
            sessions.set(session, IDLE_MS, expire);
            session.message = accept.message;
            await accept.update({ components: [render(session)], allowedMentions: { users: [challenge.challengerId] } });
        },
    });
}

function resolveRound(session: RpsSession): void {
    const [a, b] = session.picks as [Choice, Choice];
    let line = `${ICON[a]} ${t(LABEL[a])} vs ${ICON[b]} ${t(LABEL[b])} — `;
    if (a === b) line += t("empate");
    else if (BEATS[a] === b) { session.score[0]++; line += t("ponto para {player}", { player: name(session, 0) }); }
    else { session.score[1]++; line += t("ponto para {player}", { player: name(session, 1) }); }
    session.history.push(`${t("Ronda {n}", { n: session.history.length + 1 })}: ${line}`);
    session.picks = [null, null];
}

export async function handleRpsButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    const idx = session.players.indexOf(interaction.user.id);
    if (idx < 0 || (session.vsBot && idx !== 0)) return void notYourGame(interaction);
    if (!(CHOICES as readonly string[]).includes(action)) return void interaction.deferUpdate();
    const choice = action as Choice;
    if (session.picks[idx]) return void replyError(interaction, t("Já escolheste nesta ronda — espera pelo adversário."));
    session.picks[idx] = choice;
    if (session.vsBot) session.picks[1] = CHOICES[randomInt(0, 3)]!;

    const bothPicked = session.picks[0] && session.picks[1];
    if (bothPicked) {
        resolveRound(session);
        const needed = Math.ceil(session.bestOf / 2);
        if (session.score[0] >= needed) await finish(session, 1);
        else if (session.score[1] >= needed) await finish(session, 2);
    }
    if (session.result === 0) sessions.touch(session.id, IDLE_MS, expire);
    session.message = interaction.message;
    await interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
    if (!bothPicked && !session.vsBot) {
        await interaction.followUp({
            components: [buildContainer({ color: COLORS.neutral, description: t("Escolheste {icon} **{choice}** — fica em segredo até o adversário escolher.", { icon: ICON[choice], choice: t(LABEL[choice]) }) })],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        }).catch(() => null);
    }
}
