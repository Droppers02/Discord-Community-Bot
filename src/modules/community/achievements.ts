import { query } from "#database";
import { t, tk } from "../../lib/i18n.js";
import { levelFromXp } from "../levels/levelMath.js";

// Conquistas (os "badges" do bot antigo): calculadas na hora a partir das estatísticas, por
// isso aparecem sozinhas e nunca ficam desatualizadas.

export interface MemberStats {
    level: number;
    messages: number;
    voiceHours: number;
    coins: number;
    earned: number;
    dailyBest: number;
    rep: number;
    gamesPlayed: number;
    gamesWon: number;
    bestWinStreak: number;
    married: boolean;
    friends: number;
}

export interface Achievement {
    id: string;
    icon: string;
    name: string;
    description: string;
    test: (stats: MemberStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
    { id: "lvl5", icon: "🌱", name: tk("Recém-chegado"), description: tk("Chega ao nível 5."), test: (s) => s.level >= 5 },
    { id: "lvl20", icon: "🌿", name: tk("Da casa"), description: tk("Chega ao nível 20."), test: (s) => s.level >= 20 },
    { id: "lvl50", icon: "🌳", name: tk("Veterano"), description: tk("Chega ao nível 50."), test: (s) => s.level >= 50 },
    { id: "msg1k", icon: "💬", name: tk("Conversador"), description: tk("1 000 mensagens."), test: (s) => s.messages >= 1_000 },
    { id: "msg10k", icon: "📢", name: tk("Não se cala"), description: tk("10 000 mensagens."), test: (s) => s.messages >= 10_000 },
    { id: "voice10", icon: "🎙️", name: tk("Voz amiga"), description: tk("10 horas em voz com outros."), test: (s) => s.voiceHours >= 10 },
    { id: "voice100", icon: "📻", name: tk("Rádio EPA"), description: tk("100 horas em voz com outros."), test: (s) => s.voiceHours >= 100 },
    { id: "rich100k", icon: "💰", name: tk("Remediado"), description: tk("Ter 100 000 moedas."), test: (s) => s.coins >= 100_000 },
    { id: "rich1m", icon: "🤑", name: tk("Milionário"), description: tk("Ter 1 000 000 de moedas."), test: (s) => s.coins >= 1_000_000 },
    { id: "earned500k", icon: "🏦", name: tk("Trabalhador"), description: tk("Ganhar 500 000 moedas no total."), test: (s) => s.earned >= 500_000 },
    { id: "daily7", icon: "🔥", name: tk("Semana certinha"), description: tk("7 dias seguidos de diário."), test: (s) => s.dailyBest >= 7 },
    { id: "daily30", icon: "📅", name: tk("Mês certinho"), description: tk("30 dias seguidos de diário."), test: (s) => s.dailyBest >= 30 },
    { id: "rep10", icon: "❤️", name: tk("Querido"), description: tk("10 pontos de reputação."), test: (s) => s.rep >= 10 },
    { id: "rep50", icon: "💖", name: tk("Lenda do servidor"), description: tk("50 pontos de reputação."), test: (s) => s.rep >= 50 },
    { id: "games50", icon: "🎮", name: tk("Jogador"), description: tk("50 jogos jogados."), test: (s) => s.gamesPlayed >= 50 },
    { id: "wins100", icon: "🏆", name: tk("Campeão"), description: tk("100 vitórias nos jogos."), test: (s) => s.gamesWon >= 100 },
    { id: "streak5", icon: "⚡", name: tk("Imparável"), description: tk("5 vitórias seguidas num jogo."), test: (s) => s.bestWinStreak >= 5 },
    { id: "married", icon: "💍", name: tk("Casado(a)"), description: tk("Casa com alguém do servidor."), test: (s) => s.married },
    { id: "friends5", icon: "🤝", name: tk("Popular"), description: tk("5 amigos."), test: (s) => s.friends >= 5 },
];

export async function memberStats(guildId: string, userId: string): Promise<MemberStats> {
    const result = await query<Record<string, unknown>>(
        `SELECT
            (SELECT xp FROM member_levels WHERE guild_id = $1 AND user_id = $2) AS xp,
            (SELECT messages FROM member_levels WHERE guild_id = $1 AND user_id = $2) AS messages,
            (SELECT voice_seconds FROM member_levels WHERE guild_id = $1 AND user_id = $2) AS voice,
            (SELECT balance FROM economy_accounts WHERE guild_id = $1 AND user_id = $2) AS coins,
            (SELECT total_earned FROM economy_accounts WHERE guild_id = $1 AND user_id = $2) AS earned,
            (SELECT best_daily_streak FROM economy_accounts WHERE guild_id = $1 AND user_id = $2) AS daily_best,
            (SELECT points FROM member_reputation WHERE guild_id = $1 AND user_id = $2) AS rep,
            (SELECT COALESCE(SUM(played), 0) FROM game_stats WHERE guild_id = $1 AND user_id = $2) AS played,
            (SELECT COALESCE(SUM(wins), 0) FROM game_stats WHERE guild_id = $1 AND user_id = $2) AS wins,
            (SELECT COALESCE(MAX(best_streak), 0) FROM game_stats WHERE guild_id = $1 AND user_id = $2) AS best_streak,
            (SELECT COUNT(*) FROM marriages WHERE guild_id = $1 AND (user_a = $2 OR user_b = $2)) AS married,
            (SELECT COUNT(*) FROM friendships WHERE guild_id = $1 AND (user_a = $2 OR user_b = $2) AND status = 'accepted') AS friends`,
        [guildId, userId],
    );
    const row = result.rows[0] ?? {};
    const n = (value: unknown) => Number(value ?? 0) || 0;
    return {
        level: levelFromXp(n(row.xp)),
        messages: n(row.messages),
        voiceHours: n(row.voice) / 3600,
        coins: n(row.coins),
        earned: n(row.earned),
        dailyBest: n(row.daily_best),
        rep: n(row.rep),
        gamesPlayed: n(row.played),
        gamesWon: n(row.wins),
        bestWinStreak: n(row.best_streak),
        married: n(row.married) > 0,
        friends: n(row.friends),
    };
}

export function unlocked(stats: MemberStats): Achievement[] {
    return ACHIEVEMENTS.filter((achievement) => achievement.test(stats));
}

export function achievementLine(achievement: Achievement, done: boolean): string {
    return `${done ? achievement.icon : "🔒"} **${t(achievement.name)}** — ${t(achievement.description)}`;
}
