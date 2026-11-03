import type { GuildMember } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { e } from "../../lib/emojis.js";
import { intlLocale, t } from "../../lib/i18n.js";
import { getMemberLevel, memberRank } from "../../repositories/levelRepository.js";
import { levelProgress, nextReward, progressBar } from "./levelMath.js";
import type { LevelsSettings } from "./levelSettings.js";

function n(value: number): string {
    return new Intl.NumberFormat(intlLocale()).format(value);
}

export async function buildRankCard(member: GuildMember, settings: LevelsSettings): Promise<ContainerPlusBuilder> {
    const data = await getMemberLevel(member.guild.id, member.id);
    const xp = data?.xp ?? 0;
    const progress = levelProgress(xp);
    const rank = xp > 0 ? await memberRank(member.guild.id, xp) : null;
    const reward = nextReward(settings.rewards, progress.level);
    const lines = [
        `**${t("Nível {level}", { level: progress.level })}**${rank ? ` · ${t("#{rank} no servidor", { rank })}` : ""}`,
        `${progressBar(progress.ratio)} ${Math.floor(progress.ratio * 100)}%`,
        t("{into} / {needed} XP para o nível {next} · {total} XP no total", { into: n(progress.into), needed: n(progress.needed), next: progress.level + 1, total: n(xp) }),
        `${e("message")} ${t("{count, plural, one {# mensagem contada} other {# mensagens contadas}}", { count: data?.messages ?? 0 })}`,
        reward ? `${e("gift")} ${t("Próxima recompensa: {role} no nível {level}", { role: `<@&${reward.role_id}>`, level: reward.level })}` : null,
    ].filter(Boolean);
    return buildContainer({
        color: COLORS.primary,
        title: `${e("trophy")} ${member.displayName}`,
        thumbnailUrl: member.displayAvatarURL({ size: 256 }),
        description: lines.join("\n"),
    });
}
