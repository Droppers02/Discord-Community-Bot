import { ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row, type Row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { backToHubRow, channelSelect, onOff, showChannel, textField, toggleButton } from "../config/panelKit.js";
import { getEconomySettings, MAX_SHOP_ITEMS, type EconomySettings } from "./economySettings.js";

export const ECONOMY_NS = "ecocfg";
const cid = (...parts: string[]) => buildCustomId(ECONOMY_NS, ...parts);

export async function buildEconomyContainer(guildId: string, notice: string | null = null): Promise<ContainerPlusBuilder> {
    const s = await getEconomySettings(guildId);
    const rows: Row[] = [
        row(
            toggleButton(cid("toggle"), s.enabled),
            new ButtonBuilder().setCustomId(cid("amounts")).setLabel(t("Valores")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(cid("additem")).setLabel(t("Pôr cargo à venda")).setEmoji(emoji.add).setStyle(ButtonStyle.Success).setDisabled(s.shop.length >= MAX_SHOP_ITEMS),
        ),
    ];
    if (s.shop.length) {
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId(cid("delitem"))
            .setPlaceholder(t("Tirar um artigo da loja…"))
            .addOptions(s.shop.map((item) => ({ label: item.name.slice(0, 100), value: item.id, description: t("{price} moedas", { price: formatNumber(item.price) }).slice(0, 100), emoji: emoji.trash })))));
    }
    rows.push(channelSelect(cid("log"), t("Canal de registo da economia (opcional)"), s.log_channel), backToHubRow());

    return buildContainer({
        color: s.enabled ? COLORS.gold : COLORS.neutral,
        title: `${emoji.coin} ${t("Economia — {currency}", { currency: s.currency_name })}`,
        description: [
            t("Os membros ganham moedas com `/diario`, `/trabalhar` e nos mini-jogos, e gastam-nas nas apostas e na `/loja` de cargos."),
            notice ? `\n${notice}` : null,
        ].filter(Boolean).join("\n"),
        fields: [
            { name: t("Estado"), value: onOff(s.enabled) },
            {
                name: t("Valores"),
                value: [
                    t("Saldo inicial: **{value}**", { value: formatNumber(s.start_balance) }),
                    t("Diário: **{min}–{max}** + {pct}% por dia seguido (até {cap} dias)", { min: formatNumber(s.daily_min), max: formatNumber(s.daily_max), pct: s.daily_streak_bonus_pct, cap: s.daily_streak_cap }),
                    t("Trabalho: **{min}–{max}** a cada {minutes} min", { min: formatNumber(s.work_min), max: formatNumber(s.work_max), minutes: s.work_cooldown_minutes }),
                    t("Taxa nas transferências: **{pct}%**", { pct: s.transfer_fee_pct }),
                ].join("\n"),
            },
            {
                name: t("Loja ({count}/{max})", { count: s.shop.length, max: MAX_SHOP_ITEMS }),
                value: s.shop.length
                    ? s.shop.map((item) => `**${item.name}** — ${formatNumber(item.price)} · <@&${item.role_id}>${item.duration_days ? ` · ${t("{days} dias", { days: item.duration_days })}` : ""}`).join("\n").slice(0, 1024)
                    : t("*Vazia — usa \"Pôr cargo à venda\".*"),
            },
            { name: t("Registo"), value: showChannel(s.log_channel) },
        ],
        rows,
    });
}

export function buildEconomyAmountsModal(s: EconomySettings): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("amounts")).setTitle(t("Valores da economia")).addLabelComponents(
        textField("name", t("Nome da moeda"), s.currency_name, { required: true, max: 30 }),
        textField("start", t("Saldo inicial"), String(s.start_balance), { required: true, max: 9 }),
        textField("daily", t("Diário: mínimo-máximo"), `${s.daily_min}-${s.daily_max}`, { required: true, max: 20, description: t("Ex.: 800-1200") }),
        textField("streak", t("Bónus por dia seguido: %/limite de dias"), `${s.daily_streak_bonus_pct}/${s.daily_streak_cap}`, { required: true, max: 10, description: t("Ex.: 10/20 = +10% por dia, até 20 dias") }),
        textField("work", t("Trabalho: mínimo-máximo/minutos"), `${s.work_min}-${s.work_max}/${s.work_cooldown_minutes}`, { required: true, max: 30, description: t("Ex.: 150-450/60") }),
    );
}

export function buildShopItemModal(): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("additem")).setTitle(t("Pôr um cargo à venda")).addLabelComponents(
        new LabelBuilder().setLabel(t("Cargo")).setRoleSelectMenuComponent(new RoleSelectMenuBuilder().setCustomId("role").setMinValues(1).setMaxValues(1)),
        textField("name", t("Nome do artigo"), "", { required: true, max: 60, placeholder: t("Ex.: VIP Dourado") }),
        textField("price", t("Preço"), "", { required: true, max: 9, placeholder: "50000" }),
        textField("days", t("Duração em dias (0 = para sempre)"), "0", { required: true, max: 3 }),
        textField("description", t("Descrição (opcional)"), "", { paragraph: true, max: 200 }),
    );
}

/** "800-1200" → [800, 1200]. */
export function parseRange(raw: string): [number, number] | null {
    const match = raw.replace(/\s/g, "").replace(/\./g, "").match(/^(\d+)-(\d+)$/);
    if (!match) return null;
    const a = Number(match[1]);
    const b = Number(match[2]);
    return [Math.min(a, b), Math.max(a, b)];
}
