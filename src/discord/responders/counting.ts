import { createEvent, createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildCountingContainer, buildCountingLivesModal, buildCountingRewardsModal } from "../../modules/counting/countingConfigView.js";
import { buyCountingSave, countingStatusView, handleCountingMessage, handleCountingTamper } from "../../modules/counting/countingService.js";
import { getCountingSettings, saveCountingSettings } from "../../modules/counting/countingSettings.js";

// ─── Eventos do canal ────────────────────────────────────────────────────────

createEvent({
    name: "Contagem: mensagens",
    event: "messageCreate",
    async run(message) {
        if (!message.inGuild()) return;
        await handleCountingMessage(message).catch((error) => logger.warn("Contagem:", error));
    },
});

createEvent({
    name: "Contagem: número apagado",
    event: "messageDelete",
    async run(message) {
        await handleCountingTamper(message, false).catch(() => null);
    },
});

createEvent({
    name: "Contagem: número editado",
    event: "messageUpdate",
    async run(_old, message) {
        await handleCountingTamper(message, true).catch(() => null);
    },
});

// ─── Comprar vida (botão do /contagem estado) ────────────────────────────────

createResponder({
    customId: "count/buy",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const result = await buyCountingSave(interaction.member);
        if (!result.ok) return void interaction.reply({ components: [errorContainer(result.reason)], flags: CV2_FLAG | MessageFlags.Ephemeral });
        await interaction.update({ components: [await countingStatusView(interaction.guild)], allowedMentions: { parse: [] } });
        await interaction.followUp({ components: [successContainer(t("💾 Vida comprada por {user}! A contagem tem **{n}**.", { user: `<@${interaction.user.id}>`, n: result.saves }))], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

// ─── /config → Contagem ──────────────────────────────────────────────────────

createResponder({
    customId: "countcfg/**",
    types: [ResponderType.Button, ResponderType.ChannelSelect, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getCountingSettings(guildId);
        if (interaction.isButton()) {
            if (action === "rewards") return void interaction.showModal(buildCountingRewardsModal(s));
            if (action === "lives") return void interaction.showModal(buildCountingLivesModal(s));
            const toggles: Record<string, keyof typeof s> = { toggle: "enabled", math: "math", double: "no_double", reset: "reset_on_fail", chat: "delete_chat" };
            const key = toggles[action];
            if (key) await saveCountingSettings(guildId, { [key]: !s[key] });
        } else if (interaction.isChannelSelectMenu()) {
            await saveCountingSettings(guildId, { channel: interaction.values[0] ?? null });
        } else if (interaction.isRoleSelectMenu()) {
            await saveCountingSettings(guildId, { shame_role: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildCountingContainer(guildId)] });
    },
});

createResponder({
    customId: "countcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getCountingSettings(guildId);
        const field = (id: string, fallback: number, min: number, max: number) => clampInt(interaction.fields.getTextInputValue(id), fallback, min, max);
        if (action === "rewardssave") {
            await saveCountingSettings(guildId, { reward_every: field("every", s.reward_every, 0, 10_000), reward_coins: field("coins", s.reward_coins, 0, 100_000), milestone_every: field("milestone", s.milestone_every, 0, 100_000) });
        } else if (action === "livessave") {
            await saveCountingSettings(guildId, { save_price: field("price", s.save_price, 0, 10_000_000), max_saves: field("max", s.max_saves, 0, 10), shame_hours: field("hours", s.shame_hours, 1, 168) });
        }
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildCountingContainer(guildId)] });
        else await replyContainer(interaction, successContainer(t("Guardado.")));
    },
});
