import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { randomUUID } from "node:crypto";
import { errorContainer } from "../../lib/containers.js";
import { replyContainer } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { parseCustomId } from "../../lib/ids.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildEconomyAmountsModal, buildEconomyContainer, buildShopItemModal, parseRange } from "../../modules/economy/economyConfigView.js";
import { getEconomySettings, MAX_SHOP_ITEMS, saveEconomySettings } from "../../modules/economy/economySettings.js";

// /config → Economia.

createResponder({
    customId: "ecocfg/**",
    types: [ResponderType.Button, ResponderType.StringSelect, ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getEconomySettings(guildId);

        if (interaction.isButton()) {
            if (action === "amounts") return void interaction.showModal(buildEconomyAmountsModal(s));
            if (action === "additem") return void interaction.showModal(buildShopItemModal());
            if (action === "toggle") await saveEconomySettings(guildId, { enabled: !s.enabled });
        } else if (interaction.isStringSelectMenu() && action === "delitem") {
            const id = interaction.values[0];
            await saveEconomySettings(guildId, { shop: s.shop.filter((item) => item.id !== id) });
        } else if (interaction.isChannelSelectMenu() && action === "log") {
            await saveEconomySettings(guildId, { log_channel: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildEconomyContainer(guildId)] });
    },
});

createResponder({
    customId: "ecocfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getEconomySettings(guildId);
        let notice: string | null = null;

        if (action === "amounts") {
            const daily = parseRange(interaction.fields.getTextInputValue("daily"));
            const [streakPct, streakCap] = interaction.fields.getTextInputValue("streak").split("/").map((part) => part.trim());
            const [workRange, workMinutes] = interaction.fields.getTextInputValue("work").split("/").map((part) => part.trim());
            const work = parseRange(workRange ?? "");
            await saveEconomySettings(guildId, {
                currency_name: interaction.fields.getTextInputValue("name").trim() || s.currency_name,
                start_balance: clampInt(interaction.fields.getTextInputValue("start"), s.start_balance, 0, 10_000_000),
                daily_min: daily?.[0] ?? s.daily_min,
                daily_max: daily?.[1] ?? s.daily_max,
                daily_streak_bonus_pct: clampInt(streakPct ?? "", s.daily_streak_bonus_pct, 0, 100),
                daily_streak_cap: clampInt(streakCap ?? "", s.daily_streak_cap, 1, 365),
                work_min: work?.[0] ?? s.work_min,
                work_max: work?.[1] ?? s.work_max,
                work_cooldown_minutes: clampInt(workMinutes ?? "", s.work_cooldown_minutes, 1, 1440),
            });
            notice = `${emoji.success} ${t("Valores guardados.")}`;
        } else if (action === "additem") {
            if (s.shop.length >= MAX_SHOP_ITEMS) return void replyContainer(interaction, errorContainer(t("A loja já tem {max} artigos.", { max: MAX_SHOP_ITEMS })));
            const roleId = interaction.fields.getSelectedRoles("role")?.first()?.id;
            const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;
            if (!role || role.managed || role.id === interaction.guild.id) return void replyContainer(interaction, errorContainer(t("Escolhe um cargo normal (não pode ser @everyone nem cargo de bot).")));
            if (!role.editable) return void replyContainer(interaction, errorContainer(t("O cargo {role} está acima do cargo do bot — sobe o cargo do bot na lista de cargos.", { role: `<@&${role.id}>` })));
            const price = clampInt(interaction.fields.getTextInputValue("price").replace(/[\s.]/g, ""), 0, 1, 100_000_000);
            if (!price) return void replyContainer(interaction, errorContainer(t("Indica um preço válido.")));
            await saveEconomySettings(guildId, {
                shop: [...s.shop, {
                    id: randomUUID().slice(0, 8),
                    name: interaction.fields.getTextInputValue("name").trim(),
                    description: interaction.fields.getTextInputValue("description").trim() || null,
                    price,
                    role_id: role.id,
                    duration_days: clampInt(interaction.fields.getTextInputValue("days"), 0, 0, 365),
                }],
            });
            notice = `${emoji.success} ${t("{role} está à venda.", { role: `<@&${role.id}>` })}`;
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildEconomyContainer(guildId, notice)] });
        else await interaction.deferUpdate().catch(() => null);
    },
});
