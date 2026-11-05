import { ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleField, showChannel, textField, toggleButton } from "../config/panelKit.js";
import { getLfgSettings, MAX_LFG_GAMES, type LfgGame, type LfgSettings } from "./lfgSettings.js";

// /config → Procurar grupo.

export const LFG_CFG_NS = "lfgcfg";
const cid = (...parts: string[]) => buildCustomId(LFG_CFG_NS, ...parts);

export async function buildLfgContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getLfgSettings(guildId);
    const games = s.games.map((game) => `${game.emoji ?? "🎮"} **${game.name}** · ${game.size} ${t("jogadores")}${game.role_id ? ` · <@&${game.role_id}>` : ""}`);
    const manage = new StringSelectMenuBuilder().setCustomId(cid("game")).setPlaceholder(t("Editar ou remover um jogo…"));
    for (const game of s.games.slice(0, 12)) {
        manage.addOptions(
            { label: t("Editar: {name}", { name: game.name }).slice(0, 100), value: `edit:${game.key}`, emoji: "✏️" },
            { label: t("Remover: {name}", { name: game.name }).slice(0, 100), value: `delete:${game.key}`, emoji: "🗑️" },
        );
    }
    return buildContainer({
        color: s.enabled ? COLORS.primary : COLORS.neutral,
        title: `🎮 ${t("Procurar grupo")}`,
        description: t("`/grupo criar` publica um cartão com vagas: os membros entram com um botão, há lista de espera, a sala de voz nasce quando o grupo enche e o bot avisa à hora marcada. Os jogos daqui aparecem nas sugestões e mencionam o cargo do jogo."),
        fields: [
            {
                name: t("Estado"),
                value: [
                    onOff(s.enabled),
                    t("Canal dos grupos: {channel}", { channel: s.channel ? showChannel(s.channel) : t("*o canal onde se usa o comando*") }),
                    t("Salas de voz: {category}", { category: s.voice_category ? `<#${s.voice_category}>` : t("*desligadas*") }),
                    t("Mencionar o cargo do jogo: {state}", { state: onOff(s.ping_role) }),
                    t("Até **{n}** grupos abertos por pessoa · expiram ao fim de **{h} h** (com hora marcada: 2 h depois)", { n: s.max_open_per_user, h: s.expire_hours }),
                ].join("\n"),
            },
            { name: t("Jogos ({n}/{max})", { n: s.games.length, max: MAX_LFG_GAMES }), value: games.length ? games.join("\n").slice(0, 1800) : t("*Nenhum — usa «Importar dos auto-cargos» para trazer os cargos de jogos.*") },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("import")).setLabel(t("Importar dos auto-cargos")).setEmoji(emoji.role).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("add")).setLabel(t("Novo jogo")).setEmoji(emoji.add).setStyle(ButtonStyle.Primary).setDisabled(s.games.length >= MAX_LFG_GAMES),
                new ButtonBuilder().setCustomId(cid("limits")).setLabel(t("Limites")).setEmoji(emoji.edit).setStyle(ButtonStyle.Secondary),
                optionButton(cid("ping"), s.ping_role, { enable: t("Mencionar cargo"), disable: t("Não mencionar") }),
            ),
            ...(s.games.length ? [row(manage)] : []),
            channelSelect(cid("channel"), t("Canal dos grupos (vazio = onde se usa o comando)"), s.channel, [ChannelType.GuildText]),
            channelSelect(cid("category"), t("Categoria das salas de voz (vazio = sem salas)"), s.voice_category, [ChannelType.GuildCategory]),
            backToHubRow(),
        ],
    });
}

export function buildGameModal(game: LfgGame | null): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("gamesave", game?.key ?? "new")).setTitle(game ? t("Editar jogo") : t("Novo jogo")).addLabelComponents(
        textField("name", t("Nome"), game?.name ?? "", { required: true, max: 40 }),
        textField("emoji", t("Emoji (opcional)"), game?.emoji ?? "", { max: 64 }),
        textField("size", t("Jogadores por grupo"), String(game?.size ?? 5), { required: true, max: 2 }),
        roleField("role", t("Cargo do jogo (mencionado nos grupos)"), game?.role_id ? [game.role_id] : []),
    );
}

export function buildLfgLimitsModal(s: LfgSettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("limitssave")).setTitle(t("Procurar grupo")).addLabelComponents(
        textField("max", t("Grupos abertos por pessoa"), String(s.max_open_per_user), { required: true, max: 2 }),
        textField("hours", t("Horas até um grupo sem hora expirar"), String(s.expire_hours), { required: true, max: 2 }),
    );
}
