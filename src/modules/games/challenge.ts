import { ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember, type Message } from "discord.js";
import { COLORS } from "../../lib/branding.js";
import { row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { betLabel, betProblem, escrowBet, gameFrame, GAMES, newGameId, refundBet, replyError, type GameKey } from "./gameCore.js";
import type { GamesSettings } from "./gamesSettings.js";

// Desafios entre membros (galo, 4 em linha, PPT): quem desafia escolhe o adversário e a
// aposta; o adversário aceita ou recusa. As apostas só saem das carteiras quando o desafio é
// aceite — e se um dos dois já não tiver saldo, nada sai.

const CHALLENGE_TTL_MS = 90_000;

export interface Challenge {
    id: string;
    game: GameKey;
    guildId: string;
    channelId: string;
    challengerId: string;
    opponentId: string;
    bet: number;
    detail: string | null;
    message: Message | null;
    timer: NodeJS.Timeout | null;
    start: (interaction: ButtonInteraction<"cached">, challenge: Challenge) => Promise<void>;
}

const challenges = new Map<string, Challenge>();

function challengeView(challenge: Challenge, state: "open" | "declined" | "expired" | "cancelled" | "nofunds", note?: string) {
    const game = GAMES[challenge.game];
    const lines = [
        t("{challenger} desafiou {opponent} para **{game}**.", { challenger: `<@${challenge.challengerId}>`, opponent: `<@${challenge.opponentId}>`, game: t(game.label) }),
        `${betLabel(challenge.bet)}${challenge.detail ? ` · ${challenge.detail}` : ""}`,
    ];
    if (state === "open") lines.push("", t("{opponent}, aceitas?", { opponent: `<@${challenge.opponentId}>` }));
    if (state === "declined") lines.push("", t("❌ Desafio recusado."));
    if (state === "expired") lines.push("", t("⌛ O desafio expirou sem resposta."));
    if (state === "cancelled") lines.push("", t("🚫 Desafio cancelado."));
    if (state === "nofunds") lines.push("", `⚠️ ${note ?? ""}`);
    return gameFrame({
        color: state === "open" ? COLORS.primary : COLORS.neutral,
        title: `${game.icon} ${t("Desafio — {game}", { game: t(game.label) })}`,
        body: lines.join("\n"),
        rows: state === "open" ? [row(
            new ButtonBuilder().setCustomId(buildCustomId("g", "chal", challenge.id, "accept")).setLabel(t("Aceitar")).setEmoji(ei("success")).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(buildCustomId("g", "chal", challenge.id, "decline")).setLabel(t("Recusar")).setEmoji(ei("error")).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(buildCustomId("g", "chal", challenge.id, "cancel")).setLabel(t("Cancelar")).setStyle(ButtonStyle.Secondary),
        )] : [],
    });
}

/** Lança um desafio. Valida o adversário e o saldo de quem desafia (sem tirar nada ainda). */
export async function sendChallenge(
    interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">,
    settings: GamesSettings,
    opts: { game: GameKey; opponent: GuildMember; bet: number; detail?: string | null; start: Challenge["start"] },
): Promise<void> {
    if (opts.opponent.user.bot) return void replyError(interaction, t("Para jogar contra o bot, não escolhas adversário."));
    if (opts.opponent.id === interaction.user.id) return void replyError(interaction, t("Não podes desafiar-te a ti mesmo."));
    const problem = await betProblem(interaction.guildId, interaction.user.id, opts.bet, settings);
    if (problem) return void replyError(interaction, problem);

    const challenge: Challenge = {
        id: newGameId(),
        game: opts.game,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        challengerId: interaction.user.id,
        opponentId: opts.opponent.id,
        bet: opts.bet,
        detail: opts.detail ?? null,
        message: null,
        timer: null,
        start: opts.start,
    };
    challenges.set(challenge.id, challenge);
    const response = await interaction.reply({ components: [challengeView(challenge, "open")], flags: CV2_FLAG, allowedMentions: { users: [opts.opponent.id] }, withResponse: true });
    challenge.message = response.resource?.message ?? null;
    challenge.timer = setTimeout(() => {
        if (challenges.get(challenge.id) !== challenge) return;
        challenges.delete(challenge.id);
        void challenge.message?.edit({ components: [challengeView(challenge, "expired")], allowedMentions: { parse: [] } }).catch(() => null);
    }, CHALLENGE_TTL_MS);
    challenge.timer.unref?.();
}

export async function handleChallengeButton(interaction: ButtonInteraction<"cached">, id: string, action: string): Promise<void> {
    const challenge = challenges.get(id);
    if (!challenge) return void replyError(interaction, t("Este desafio já não está ativo."));
    const user = interaction.user.id;

    if (action === "cancel") {
        if (user !== challenge.challengerId) return void replyError(interaction, t("Só quem lançou o desafio o pode cancelar."));
        close(challenge);
        return void interaction.update({ components: [challengeView(challenge, "cancelled")], allowedMentions: { parse: [] } });
    }
    if (user !== challenge.opponentId) return void replyError(interaction, t("Este desafio é para {user}.", { user: `<@${challenge.opponentId}>` }));
    if (action === "decline") {
        close(challenge);
        return void interaction.update({ components: [challengeView(challenge, "declined")], allowedMentions: { parse: [] } });
    }
    if (action !== "accept") return void interaction.deferUpdate();

    close(challenge);
    // As duas apostas saem agora. Se a segunda falhar, a primeira volta.
    if (!(await escrowBet(challenge.guildId, challenge.challengerId, challenge.bet, challenge.game))) {
        return void interaction.update({ components: [challengeView(challenge, "nofunds", t("{user} já não tem moedas para a aposta.", { user: `<@${challenge.challengerId}>` }))], allowedMentions: { parse: [] } });
    }
    if (!(await escrowBet(challenge.guildId, challenge.opponentId, challenge.bet, challenge.game))) {
        await refundBet(challenge.guildId, challenge.challengerId, challenge.bet, challenge.game);
        return void interaction.update({ components: [challengeView(challenge, "nofunds", t("{user} não tem moedas para a aposta.", { user: `<@${challenge.opponentId}>` }))], allowedMentions: { parse: [] } });
    }
    await challenge.start(interaction, challenge);
}

function close(challenge: Challenge): void {
    if (challenge.timer) clearTimeout(challenge.timer);
    challenges.delete(challenge.id);
}
