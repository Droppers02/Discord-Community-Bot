import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import {
    ActionRowBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
    type AnySelectMenuInteraction,
    type ButtonInteraction,
    type GuildMember,
    type ModalMessageModalSubmitInteraction,
    type ModalSubmitInteraction,
    type RepliableInteraction,
    type TextChannel,
} from "discord.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { hasSuperAdminAccess, replyContainer } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { getGiveawaySettings } from "../../modules/giveaways/giveawaySettings.js";
import { createGiveaway } from "../../modules/giveaways/giveawayManager.js";
import {
    buildGiveawayDraftPanel,
    clearGiveawayDraft,
    getGiveawayDraft,
    GIVEAWAY_MAX_DURATION_MS,
    GIVEAWAY_MIN_DURATION_MS,
    isDraftReady,
    parseDuration,
    updateGiveawayDraft,
} from "../../modules/giveaways/giveawayCreator.js";
import { t } from "../../lib/i18n.js";

async function canManage(interaction: { inCachedGuild(): boolean; guildId: string; member: GuildMember }): Promise<boolean> {
    const config = await ensureGuildConfig(interaction.guildId);
    if (hasSuperAdminAccess(interaction.member, config.admin_role)) return true;
    if (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    const settings = await getGiveawaySettings(interaction.guildId);
    return settings.host_role ? interaction.member.roles.cache.has(settings.host_role) : false;
}

async function gate(interaction: RepliableInteraction): Promise<boolean> {
    if (!interaction.inCachedGuild()) return false;
    if (await canManage(interaction)) return true;
    await replyContainer(interaction, errorContainer(t("Não tens permissão para gerir sorteios.")));
    return false;
}

type PanelInteraction =
    | AnySelectMenuInteraction<"cached">
    | ButtonInteraction<"cached">
    | ModalMessageModalSubmitInteraction<"cached">;

async function rerender(interaction: PanelInteraction): Promise<void> {
    const draft = getGiveawayDraft(interaction.guildId, interaction.user.id);
    await interaction.update({ components: [buildGiveawayDraftPanel(draft, interaction.guild)] as never });
}

function input(id: string, label: string, style: TextInputStyle, required: boolean, max: number, value?: string | null, placeholder?: string): ActionRowBuilder<TextInputBuilder> {
    const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
    if (value) field.setValue(value);
    if (placeholder) field.setPlaceholder(placeholder);
    return new ActionRowBuilder<TextInputBuilder>().addComponents(field);
}

// ─── Modals: prize / timing / extra ────────────────────────────────────────────
createResponder({
    customId: "gwcreate/prize",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!(await gate(interaction))) return;
        const draft = getGiveawayDraft(interaction.guildId!, interaction.user.id);
        await interaction.showModal(new ModalBuilder().setCustomId(buildCustomId("gwcreate", "prizesubmit")).setTitle(t("Prémio e descrição")).addComponents(
            input("prize", t("Prémio"), TextInputStyle.Short, true, 200, draft.prize, t("Ex.: Nitro de 1 mês")),
            input("description", t("Descrição (opcional)"), TextInputStyle.Paragraph, false, 500, draft.description),
        ));
    },
});

createResponder({
    customId: "gwcreate/timing",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!(await gate(interaction))) return;
        const draft = getGiveawayDraft(interaction.guildId!, interaction.user.id);
        await interaction.showModal(new ModalBuilder().setCustomId(buildCustomId("gwcreate", "timingsubmit")).setTitle(t("Duração e vencedores")).addComponents(
            input("duration", t("Duração (ex.: 1d, 2h30m, 45m)"), TextInputStyle.Short, true, 20, draft.durationInput, "1d"),
            input("winners", t("Número de vencedores"), TextInputStyle.Short, true, 3, String(draft.winners), "1"),
        ));
    },
});

createResponder({
    customId: "gwcreate/extra",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!(await gate(interaction))) return;
        const draft = getGiveawayDraft(interaction.guildId!, interaction.user.id);
        await interaction.showModal(new ModalBuilder().setCustomId(buildCustomId("gwcreate", "extrasubmit")).setTitle(t("Requisitos extra")).addComponents(
            input("age", t("Idade mínima da conta (dias, 0 = sem mínimo)"), TextInputStyle.Short, false, 4, String(draft.minAccountAgeDays)),
            input("serverage", t("Tempo mínimo no servidor (dias, 0 = sem mín.)"), TextInputStyle.Short, false, 4, String(draft.minServerAgeDays)),
            input("bonus", t("Entradas extra do cargo bónus"), TextInputStyle.Short, false, 3, String(draft.bonusEntries)),
        ));
    },
});

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;
    if (interaction.isFromMessage()) await rerender(interaction);
}

createResponder({
    customId: "gwcreate/prizesubmit",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!(await gate(interaction))) return;
        updateGiveawayDraft(interaction.guildId!, interaction.user.id, {
            prize: interaction.fields.getTextInputValue("prize").trim().slice(0, 200) || null,
            description: interaction.fields.getTextInputValue("description").trim().slice(0, 500) || null,
        });
        await handleModal(interaction);
    },
});

createResponder({
    customId: "gwcreate/timingsubmit",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!(await gate(interaction))) return;
        const durationInput = interaction.fields.getTextInputValue("duration").trim();
        const durationMs = parseDuration(durationInput);
        const valid = durationMs !== null && durationMs >= GIVEAWAY_MIN_DURATION_MS && durationMs <= GIVEAWAY_MAX_DURATION_MS;
        const winners = Math.max(1, Math.min(50, Number.parseInt(interaction.fields.getTextInputValue("winners"), 10) || 1));
        updateGiveawayDraft(interaction.guildId!, interaction.user.id, {
            durationInput: valid ? durationInput : null,
            durationMs: valid ? durationMs : null,
            winners,
        });
        if (!valid) {
            await replyContainer(interaction, errorContainer(t("Duração inválida. Usa por exemplo `1d`, `2h30m` ou `45m` (entre 10s e 30 dias).")));
            return;
        }
        await handleModal(interaction);
    },
});

createResponder({
    customId: "gwcreate/extrasubmit",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!(await gate(interaction))) return;
        updateGiveawayDraft(interaction.guildId!, interaction.user.id, {
            minAccountAgeDays: Math.max(0, Math.min(365, Number.parseInt(interaction.fields.getTextInputValue("age"), 10) || 0)),
            minServerAgeDays: Math.max(0, Math.min(365, Number.parseInt(interaction.fields.getTextInputValue("serverage"), 10) || 0)),
            bonusEntries: Math.max(1, Math.min(50, Number.parseInt(interaction.fields.getTextInputValue("bonus"), 10) || 1)),
        });
        await handleModal(interaction);
    },
});

createResponder({
    customId: "gwcreate/toggleclient",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gate(interaction))) return;
        const draft = getGiveawayDraft(interaction.guildId, interaction.user.id);
        updateGiveawayDraft(interaction.guildId, interaction.user.id, { requireClient: !draft.requireClient });
        await rerender(interaction);
    },
});

createResponder({
    customId: "gwcreate/toggleping",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gate(interaction))) return;
        const draft = getGiveawayDraft(interaction.guildId, interaction.user.id);
        updateGiveawayDraft(interaction.guildId, interaction.user.id, { pingEveryone: !draft.pingEveryone });
        await rerender(interaction);
    },
});

// ─── Selects: channel / required role / bonus role ─────────────────────────────
createResponder({
    customId: "gwcreate/channel",
    types: [ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gate(interaction))) return;
        updateGiveawayDraft(interaction.guildId, interaction.user.id, { channelId: interaction.values[0] ?? null });
        await rerender(interaction);
    },
});

createResponder({
    customId: "gwcreate/reqrole",
    types: [ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gate(interaction))) return;
        updateGiveawayDraft(interaction.guildId, interaction.user.id, { requiredRole: interaction.values[0] ?? null });
        await rerender(interaction);
    },
});

createResponder({
    customId: "gwcreate/bonusrole",
    types: [ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !(await gate(interaction))) return;
        updateGiveawayDraft(interaction.guildId, interaction.user.id, { bonusRole: interaction.values[0] ?? null });
        await rerender(interaction);
    },
});

// ─── Confirm / cancel ──────────────────────────────────────────────────────────
createResponder({
    customId: "gwcreate/confirm",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (!(await gate(interaction))) return;
        const draft = getGiveawayDraft(interaction.guildId, interaction.user.id);
        if (!isDraftReady(draft) || !draft.channelId || !draft.durationMs || !draft.prize) {
            await replyContainer(interaction, errorContainer(t("Faltam campos obrigatórios (prémio, duração e canal).")));
            return;
        }
        const channel = await interaction.guild.channels.fetch(draft.channelId).catch(() => null);
        if (!channel?.isTextBased()) {
            await replyContainer(interaction, errorContainer(t("O canal escolhido já não é válido.")));
            return;
        }
        const giveaway = await createGiveaway(interaction.client, {
            guildId: interaction.guildId,
            channel: channel as TextChannel,
            hostId: interaction.user.id,
            prize: draft.prize,
            description: draft.description,
            winnersCount: draft.winners,
            durationMs: draft.durationMs,
            requiredRole: draft.requiredRole,
            bonusRoles: draft.bonusRole ? [{ role_id: draft.bonusRole, entries: draft.bonusEntries }] : [],
            minAccountAgeDays: draft.minAccountAgeDays,
            minServerAgeDays: draft.minServerAgeDays,
            requireClient: draft.requireClient,
            pingEveryone: draft.pingEveryone,
        });
        clearGiveawayDraft(interaction.guildId, interaction.user.id);
        await interaction.update({ components: [successContainer(t("Sorteio criado em {channel} — {id}.", { channel: String(channel), id: `\`${giveaway.id.slice(0, 8)}\`` }))] });
    },
});

createResponder({
    customId: "gwcreate/cancel",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        clearGiveawayDraft(interaction.guildId, interaction.user.id);
        await interaction.update({ components: [successContainer(t("Criação de sorteio cancelada."))] });
    },
});
