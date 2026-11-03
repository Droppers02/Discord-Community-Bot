import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { buildRanking, isRankingType } from "../../modules/community/rankings.js";

// Rankings: trocar de tipo (menu) e folhear páginas. Qualquer pessoa pode mexer — a linha
// "a tua posição" é sempre de quem carrega.
createResponder({
    customId: "rank/type",
    types: [ResponderType.StringSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const type = interaction.values[0] ?? "xp";
        if (!isRankingType(type)) return void interaction.deferUpdate();
        await interaction.update({ components: [await buildRanking(interaction.guild, type, 0, interaction.user.id)], allowedMentions: { parse: [] } });
    },
});

createResponder({
    customId: "rank/page/:type/:page",
    types: [ResponderType.Button],
    async run(interaction, { type, page }) {
        if (!interaction.inCachedGuild()) return;
        if (!isRankingType(type)) return void interaction.deferUpdate();
        const n = Number.parseInt(page, 10);
        await interaction.update({ components: [await buildRanking(interaction.guild, type, Number.isFinite(n) ? n : 0, interaction.user.id)], allowedMentions: { parse: [] } });
    },
});
