import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { buildContainer, errorContainer, row, successContainer } from "../../lib/containers.js";
import { CV2_FLAG, replyContainer } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import { formatNumber, t } from "../../lib/i18n.js";
import { COLORS } from "../../lib/branding.js";
import { clampInt, gateConfig } from "../../modules/config/panelKit.js";
import { buildPredictionLimitsModal, buildPredictionsContainer } from "../../modules/predictions/predictionConfigView.js";
import { balanceOf, buildBetModal, canManage, cancelPrediction, getPrediction, lockPrediction, myBetText, placeBet, resolvePrediction, resolveSelect } from "../../modules/predictions/predictionService.js";
import { getPredictionSettings, savePredictionSettings } from "../../modules/predictions/predictionSettings.js";

const ephemeral = (text: string, ok = false) => ({ components: [ok ? successContainer(text) : errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral } as const);

// ─── Cartão da previsão ──────────────────────────────────────────────────────

createResponder({
    customId: "pred/:action/:id",
    types: [ResponderType.Button, ResponderType.StringSelect],
    async run(interaction, { action, id }) {
        if (!interaction.inCachedGuild()) return;
        const prediction = await getPrediction(id);
        if (!prediction || prediction.guild_id !== interaction.guildId) return void interaction.reply(ephemeral(t("Esta previsão já não existe.")));

        if (action === "bet" && interaction.isStringSelectMenu()) {
            if (prediction.status !== "open") return void interaction.reply(ephemeral(t("As apostas já fecharam.")));
            const settings = await getPredictionSettings(interaction.guildId);
            const balance = await balanceOf(interaction.member);
            return void interaction.showModal(buildBetModal(prediction, Number(interaction.values[0] ?? 0), settings, balance));
        }
        if (action === "mine") return void interaction.reply(ephemeral(await myBetText(prediction, interaction.user.id), true));

        if (!(await canManage(interaction.member, prediction))) return void interaction.reply(ephemeral(t("Só quem criou a previsão (ou a equipa) pode fazer isso.")));
        if (action === "resolve") {
            return void interaction.reply({
                components: [buildContainer({ color: COLORS.primary, title: `🏁 ${prediction.question}`, description: t("Escolhe o resultado — os prémios são pagos logo."), rows: [row(resolveSelect(prediction))] })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
        }
        if (action === "win" && interaction.isStringSelectMenu()) {
            await interaction.deferUpdate();
            const problem = await resolvePrediction(interaction.guild, prediction.id, Number(interaction.values[0] ?? -1), interaction.user.id);
            return void interaction.editReply({ components: [problem ? errorContainer(problem) : successContainer(t("Resolvida! Os prémios já foram pagos."))] });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (action === "lock") {
            const done = await lockPrediction(interaction.guild, prediction.id);
            return void interaction.editReply(ephemeral(done ? t("Apostas fechadas.") : t("Já estavam fechadas."), done));
        }
        if (action === "cancel") {
            const problem = await cancelPrediction(interaction.guild, prediction.id, interaction.user.id);
            return void interaction.editReply(ephemeral(problem ?? t("Cancelada — as apostas foram devolvidas."), !problem));
        }
    },
});

createResponder({
    customId: "pred/amount/:id/:option",
    types: [ResponderType.Modal],
    async run(interaction, { id, option }) {
        if (!interaction.inCachedGuild()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const amount = Number.parseInt(interaction.fields.getTextInputValue("amount").replace(/[\s.]/g, ""), 10);
        if (!Number.isFinite(amount) || amount <= 0) return void interaction.editReply(ephemeral(t("Escreve um número de moedas.")));
        const result = await placeBet(interaction.member, id, Number(option), amount);
        if (!result.ok) return void interaction.editReply(ephemeral(result.reason));
        await interaction.editReply(ephemeral(t("Aposta feita! Tens **{n}** moedas nesta previsão. Boa sorte! 🍀", { n: formatNumber(result.total) }), true));
    },
});

// ─── /config → Previsões ─────────────────────────────────────────────────────

createResponder({
    customId: "predcfg/**",
    types: [ResponderType.Button, ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const guildId = interaction.guildId;
        const { action } = parseCustomId(interaction.customId);
        const s = await getPredictionSettings(guildId);
        if (interaction.isButton()) {
            if (action === "limits") return void interaction.showModal(buildPredictionLimitsModal(s));
            if (action === "toggle") await savePredictionSettings(guildId, { enabled: !s.enabled });
            if (action === "anyone") await savePredictionSettings(guildId, { anyone_can_create: !s.anyone_can_create });
        } else if (interaction.isRoleSelectMenu()) {
            await savePredictionSettings(guildId, { creator_role: interaction.values[0] ?? null });
        }
        await interaction.update({ components: [await buildPredictionsContainer(guildId)] });
    },
});

createResponder({
    customId: "predcfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gateConfig(interaction))) return;
        const s = await getPredictionSettings(interaction.guildId);
        const field = (id: string, fallback: number, min: number, max: number) => clampInt(interaction.fields.getTextInputValue(id), fallback, min, max);
        await savePredictionSettings(interaction.guildId, {
            min_bet: field("min", s.min_bet, 1, 1_000_000),
            max_bet: field("max", s.max_bet, 1, 100_000_000),
            house_cut_pct: field("cut", s.house_cut_pct, 0, 50),
            max_open: field("open", s.max_open, 1, 25),
        });
        if (interaction.isFromMessage()) await interaction.update({ components: [await buildPredictionsContainer(interaction.guildId)] });
        else await replyContainer(interaction, successContainer(t("Guardado.")));
    },
});
