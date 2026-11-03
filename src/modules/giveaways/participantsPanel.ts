import { ButtonBuilder, ButtonStyle } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row, type Row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { relative } from "../../lib/time.js";
import type { GiveawayEntryDetail } from "../../repositories/giveawayRepository.js";
import type { GiveawayRecord } from "../../types.js";
import { t, tk } from "../../lib/i18n.js";

export const PARTICIPANTS_SORTS = ["recent", "oldest", "entries"] as const;
export type ParticipantsSort = (typeof PARTICIPANTS_SORTS)[number];
const PAGE_SIZE = 15;

export function isParticipantsSort(value: string): value is ParticipantsSort {
    return (PARTICIPANTS_SORTS as readonly string[]).includes(value);
}

const SORT_LABEL: Record<ParticipantsSort, string> = {
    recent: tk("Mais recentes"),
    oldest: tk("Mais antigos"),
    entries: tk("Mais entradas"),
};

function sortEntries(entries: GiveawayEntryDetail[], sort: ParticipantsSort): GiveawayEntryDetail[] {
    const copy = [...entries];
    if (sort === "recent") copy.sort((a, b) => b.created_at - a.created_at);
    else if (sort === "oldest") copy.sort((a, b) => a.created_at - b.created_at);
    else copy.sort((a, b) => b.entries - a.entries || b.created_at - a.created_at);
    return copy;
}

export function buildParticipantsPanel(
    giveaway: GiveawayRecord,
    entries: GiveawayEntryDetail[],
    sort: ParticipantsSort,
    page: number,
): ContainerPlusBuilder {
    const totalEntries = entries.reduce((sum, entry) => sum + entry.entries, 0);
    const sorted = sortEntries(entries, sort);
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const currentPage = Math.min(Math.max(0, page), pageCount - 1);
    const slice = sorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

    const lines = slice.length
        ? slice.map((entry, index) => {
            const position = currentPage * PAGE_SIZE + index + 1;
            const weight = entry.entries > 1 ? ` • ${t("{count, plural, one {**#** entrada} other {**#** entradas}}", { count: entry.entries })}` : "";
            return `**${position}.** <@${entry.user_id}>${weight} • ${t("entrou {when}", { when: relative(entry.created_at) })}`;
        }).join("\n")
        : t("*Ainda sem participantes.*");

    // Sort selector: one button per mode, the active one disabled.
    const sortRow: Row = row(
        ...PARTICIPANTS_SORTS.map((mode) =>
            new ButtonBuilder()
                .setCustomId(buildCustomId("gwview", giveaway.id, mode, "0"))
                .setLabel(t(SORT_LABEL[mode]))
                .setStyle(mode === sort ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(mode === sort),
        ),
    );

    const navRow: Row = row(
        new ButtonBuilder().setCustomId(buildCustomId("gwview", giveaway.id, sort, String(currentPage - 1))).setLabel(t("Anterior")).setEmoji(emoji.arrowLeft).setStyle(ButtonStyle.Secondary).setDisabled(currentPage <= 0),
        new ButtonBuilder().setCustomId(buildCustomId("gwview", giveaway.id, sort, String(currentPage + 1))).setLabel(t("Seguinte")).setEmoji(emoji.arrowRight).setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= pageCount - 1),
    );

    return buildContainer({
        color: COLORS.gold,
        title: `${emoji.users} ${t("Participantes — {prize}", { prize: giveaway.prize })}`,
        description: t("{people, plural, one {**#** participante} other {**#** participantes}} • {entries, plural, one {**#** entrada} other {**#** entradas}} no total • ordenado por **{sort}**", { people: entries.length, entries: totalEntries, sort: t(SORT_LABEL[sort]) }),
        fields: [{ name: t("Página {page}/{pages}", { page: currentPage + 1, pages: pageCount }), value: lines.slice(0, 4000) }],
        footerText: t("Sorteio {id} • visível apenas para staff", { id: giveaway.id.slice(0, 8) }),
        rows: [sortRow, navRow],
    });
}
