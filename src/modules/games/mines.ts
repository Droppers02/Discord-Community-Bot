import { randomInt } from "node:crypto";
import { ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, type Message } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { formatCoins } from "../economy/economyService.js";
import { betLabel, betProblem, escrowBet, gameFrame, gameGate, newGameId, notYourGame, payOut, replyError, Sessions, track, type BaseSession } from "./gameCore.js";

// Minas: 20 casas, algumas com bomba. Cada casa segura multiplica o prémio; levantas quando
// quiseres. Rebentar perde a aposta. O multiplicador é o justo com 3% para a casa.

export const MINE_TILES = 20;
const COLS = 5;
const IDLE_MS = 3 * 60_000;
const HOUSE_EDGE = 0.97;

interface MinesSession extends BaseSession {
    userId: string;
    bet: number;
    mines: number;
    bombs: Set<number>;
    revealed: Set<number>;
    result: 0 | "cashout" | "boom";
    hit: number | null;
    message: Message | null;
}

const sessions = new Sessions<MinesSession>();

/** Multiplicador depois de `safe` casas seguras com `mines` bombas. */
export function minesMultiplier(mines: number, safe: number): number {
    let multiplier = HOUSE_EDGE;
    for (let i = 0; i < safe; i++) multiplier *= (MINE_TILES - i) / (MINE_TILES - mines - i);
    return Math.floor(multiplier * 100) / 100;
}

function render(session: MinesSession) {
    const ended = session.result !== 0;
    const multiplier = minesMultiplier(session.mines, session.revealed.size);
    const next = minesMultiplier(session.mines, session.revealed.size + 1);
    const tiles = Array.from({ length: MINE_TILES }, (_, i) => {
        const revealed = session.revealed.has(i);
        const bomb = session.bombs.has(i);
        const button = new ButtonBuilder().setCustomId(buildCustomId("g", "mines", session.id, i)).setDisabled(ended || revealed);
        if (revealed) return button.setEmoji("💎").setStyle(ButtonStyle.Success);
        if (ended && bomb) return button.setEmoji(i === session.hit ? "💥" : "💣").setStyle(i === session.hit ? ButtonStyle.Danger : ButtonStyle.Secondary);
        return button.setLabel("​").setStyle(ButtonStyle.Secondary);
    });
    const rows = [];
    for (let r = 0; r < MINE_TILES / COLS; r++) rows.push(row(...tiles.slice(r * COLS, r * COLS + COLS)));
    if (!ended) {
        rows.push(row(new ButtonBuilder()
            .setCustomId(buildCustomId("g", "mines", session.id, "cash"))
            .setLabel(session.revealed.size ? t("Levantar {coins}", { coins: Math.floor(session.bet * multiplier).toLocaleString("pt-PT") }) : t("Abre uma casa primeiro"))
            .setEmoji("💰")
            .setStyle(ButtonStyle.Success)
            .setDisabled(session.revealed.size === 0)));
    }
    let status: string;
    if (session.result === "boom") status = `💥 ${t("Rebentou! Perdeste {coins}.", { coins: formatCoins(session.bet) })}`;
    else if (session.result === "cashout") status = `💰 ${t("Levantaste {coins} (×{mult}).", { coins: formatCoins(Math.floor(session.bet * multiplier)), mult: multiplier })}`;
    else status = session.revealed.size ? t("Multiplicador atual: **×{mult}** · próxima casa: ×{next}", { mult: multiplier, next }) : t("Escolhe uma casa. A primeira segura vale ×{next}.", { next });
    return gameFrame({
        color: session.result === "boom" ? COLORS.danger : session.result === "cashout" ? COLORS.success : COLORS.primary,
        title: `💣 ${t("Minas")}`,
        body: [`${t("Jogador: {user}", { user: `<@${session.userId}>` })} · ${betLabel(session.bet)} · ${t("{n} bombas", { n: session.mines })}`, "", status].join("\n"),
        rows,
    });
}

async function end(session: MinesSession, result: "cashout" | "boom"): Promise<void> {
    session.result = result;
    sessions.end(session.id);
    if (result === "cashout") {
        const prize = Math.floor(session.bet * minesMultiplier(session.mines, session.revealed.size));
        await payOut(session.guildId, session.userId, prize, "minas", session.bet);
        track(session.guildId, session.userId, "minas", prize > session.bet ? "win" : "draw", { coinsWon: Math.max(0, prize - session.bet), score: session.revealed.size });
    } else {
        track(session.guildId, session.userId, "minas", "loss", { coinsLost: session.bet });
    }
}

function expire(session: MinesSession): void {
    // Sem resposta: levanta automaticamente o que já tinha (ou devolve, se não abriu nada).
    void (async () => {
        await end(session, "cashout");
        await session.message?.edit({ components: [render(session)], allowedMentions: { parse: [] } }).catch(() => null);
    })();
}

export async function startMines(interaction: ChatInputCommandInteraction<"cached">, bet: number, mines: number): Promise<void> {
    const settings = await gameGate(interaction);
    if (!settings) return;
    if (bet <= 0) return void replyError(interaction, t("As minas jogam-se com aposta."));
    const problem = await betProblem(interaction.guildId, interaction.user.id, bet, settings);
    if (problem) return void replyError(interaction, problem);
    if (!(await escrowBet(interaction.guildId, interaction.user.id, bet, "minas"))) return void replyError(interaction, t("Não tens moedas suficientes."));
    const bombs = new Set<number>();
    while (bombs.size < mines) bombs.add(randomInt(0, MINE_TILES));
    const session: MinesSession = { id: newGameId(), guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, bet, mines, bombs, revealed: new Set(), result: 0, hit: null, message: null };
    sessions.set(session, IDLE_MS, expire);
    const response = await interaction.reply({ components: [render(session)], flags: CV2_FLAG, allowedMentions: { parse: [] }, withResponse: true });
    session.message = response.resource?.message ?? null;
}

export async function handleMinesButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const session = sessions.get(id);
    if (!session || session.result !== 0) return void replyError(interaction, t("Este jogo já acabou."));
    if (session.userId !== interaction.user.id) return void notYourGame(interaction);
    session.message = interaction.message;
    if (action === "cash") {
        if (!session.revealed.size) return void interaction.deferUpdate();
        await end(session, "cashout");
    } else {
        const tile = Number(action);
        if (!Number.isInteger(tile) || tile < 0 || tile >= MINE_TILES || session.revealed.has(tile)) return void interaction.deferUpdate();
        if (session.bombs.has(tile)) {
            session.hit = tile;
            await end(session, "boom");
        } else {
            session.revealed.add(tile);
            if (session.revealed.size === MINE_TILES - session.mines) await end(session, "cashout");
            else sessions.touch(session.id, IDLE_MS, expire);
        }
    }
    await interaction.update({ components: [render(session)], allowedMentions: { parse: [] } });
}
