import { createHash } from "node:crypto";
import type { GuildMember } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { t, tk } from "../../lib/i18n.js";
import { progressBar } from "../levels/levelMath.js";

// /ship: compatibilidade entre dois membros. O valor é sempre o mesmo para o mesmo par (sem
// "rolar até dar 100"), a não ser que a administração o force para a brincadeira.

const VERDICTS: Array<[number, string, string]> = [
    [95, "💞", tk("Almas gémeas. Marquem já o casamento.")],
    [80, "❤️", tk("Isto tem tudo para dar certo!")],
    [65, "💖", tk("Há química no ar…")],
    [50, "💛", tk("Pode ser que sim, pode ser que não.")],
    [35, "🤝", tk("Dá mais para amizade.")],
    [20, "😬", tk("Hmm… melhor não.")],
    [0, "💔", tk("Nem com muita sorte.")],
];

export function shipScore(a: string, b: string): number {
    const [first, second] = [a, b].sort();
    const hash = createHash("sha256").update(`epa-ship:${first}:${second}`).digest();
    return hash.readUInt16BE(0) % 101;
}

function shipName(a: string, b: string): string {
    const left = a.slice(0, Math.ceil(a.length / 2));
    const right = b.slice(Math.floor(b.length / 2));
    return `${left}${right}`;
}

export function buildShip(a: GuildMember, b: GuildMember, forced: number | null): ContainerPlusBuilder {
    const score = forced ?? shipScore(a.id, b.id);
    const [, icon, verdict] = VERDICTS.find(([min]) => score >= min) ?? VERDICTS[VERDICTS.length - 1]!;
    return buildContainer({
        color: score >= 65 ? COLORS.danger : score >= 35 ? COLORS.warning : COLORS.neutral,
        title: `${icon} ${t("Ship: {name}", { name: shipName(a.displayName, b.displayName) })}`,
        description: [
            `${a} ❤️ ${b}`,
            "",
            `## ${score}%`,
            progressBar(score / 100, 16),
            "",
            t(verdict),
        ].join("\n"),
    });
}
