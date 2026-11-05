import { ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, optionButton, roleSelect, showChannel, showRole, toggleButton } from "../config/panelKit.js";
import { PLATFORM_LABELS, PLATFORMS } from "./freeGamesSources.js";
import { getFreeGamesSettings } from "./freeGamesSettings.js";

// /config → Jogos grátis.

export const FREEGAMES_CFG_NS = "freecfg";
const cid = (...parts: string[]) => buildCustomId(FREEGAMES_CFG_NS, ...parts);

export async function buildFreeGamesContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const s = await getFreeGamesSettings(guildId);
    return buildContainer({
        color: s.enabled ? COLORS.success : COLORS.neutral,
        title: `🆓 ${t("Jogos grátis")}`,
        description: t("O bot vê a Epic Games e a GamerPower de 30 em 30 minutos e publica os jogos que ficam grátis (com imagem, preço original, prazo e botão para resgatar). À quinta, faz o resumo da Epic desta semana e da próxima. `/jogosgratis` mostra o que há agora."),
        fields: [
            { name: t("Estado"), value: `${onOff(s.enabled)}${s.enabled && !s.channel ? ` — ${t("falta o canal")}` : ""}` },
            {
                name: t("Regras"),
                value: [
                    t("Canal: {channel}", { channel: showChannel(s.channel) }),
                    t("Cargo avisado: {role}", { role: showRole(s.ping_role) }),
                    t("Plataformas: {list}", { list: s.platforms.length ? s.platforms.map((key) => t(PLATFORM_LABELS[key])).join(", ") : t("*nenhuma*") }),
                    t("DLC: {dlc} · acesso antecipado: {beta} · resumo da Epic à quinta: {weekly}", { dlc: onOff(s.include_dlc), beta: onOff(s.include_beta), weekly: onOff(s.weekly_epic) }),
                ].join("\n"),
            },
        ],
        rows: [
            row(
                toggleButton(cid("toggle"), s.enabled),
                new ButtonBuilder().setCustomId(cid("now")).setLabel(t("Ver agora")).setEmoji("🔄").setStyle(ButtonStyle.Primary).setDisabled(!s.enabled || !s.channel),
                optionButton(cid("dlc"), s.include_dlc, { enable: t("Incluir DLC"), disable: t("Sem DLC") }),
                optionButton(cid("beta"), s.include_beta, { enable: t("Incluir acesso antecipado"), disable: t("Sem acesso antecipado") }),
                optionButton(cid("weekly"), s.weekly_epic, { enable: t("Resumo da Epic"), disable: t("Sem resumo da Epic") }),
            ),
            row(new StringSelectMenuBuilder()
                .setCustomId(cid("platforms"))
                .setPlaceholder(t("Plataformas a anunciar"))
                .setMinValues(0)
                .setMaxValues(PLATFORMS.length)
                .addOptions(PLATFORMS.map((key) => ({ label: t(PLATFORM_LABELS[key]), value: key, default: s.platforms.includes(key) })))),
            channelSelect(cid("channel"), t("Canal dos jogos grátis"), s.channel, [ChannelType.GuildText, ChannelType.GuildAnnouncement]),
            roleSelect(cid("role"), t("Cargo a avisar (opcional)"), s.ping_role ? [s.ping_role] : []),
            backToHubRow(),
        ],
    });
}
