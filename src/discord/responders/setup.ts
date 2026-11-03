import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { GuildMember, TextChannel, type ModalSubmitInteraction, type RepliableInteraction } from "discord.js";
import { ensureGuildConfig, upsertGuildConfig } from "../../repositories/guildConfigRepository.js";
import { errorContainer, successContainer } from "../../lib/containers.js";
import { hasSuperAdminAccess, replyContainer } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { parseColorString } from "../../lib/branding.js";
import {
    normalizeTicketCategoriesFromLabels,
    serializeTicketCategories,
    setCategoryChannel,
    setCategoryWelcome,
    setCategoryPingRoles,
    setCategoryEmoji,
    getTicketCategories,
} from "../../modules/tickets/categories.js";
import {
    getTicketMacros,
    removeMacro,
    serializeTicketMacros,
    upsertMacro,
} from "../../modules/tickets/macros.js";
import {
    buildPanelContainer,
    createDefaultPanel,
    getTicketPanels,
    removePanel,
    serializeTicketPanels,
    upsertPanel,
} from "../../modules/tickets/panels.js";
import { isValidTimezone, serializeSupportHours, DEFAULT_SUPPORT_TZ } from "../../modules/tickets/officeHours.js";
import { normalizeTicketNameFormat } from "../../modules/tickets/ticketNaming.js";
import {
    addTicketFormField,
    getTicketForms,
    moveTicketFormField,
    removeTicketFormField,
    resetTicketForm,
    serializeTicketForms,
    setTicketFormPreset,
    setTicketFormTitle,
    updateTicketFormField,
    type FormFieldInput,
} from "../../modules/tickets/forms.js";
import { upsertTicketPanel } from "../../modules/tickets/ticketPanel.js";
import { appendAuditLog } from "../../services/auditService.js";
import {
    buildCategoriesModal,
    buildCategoryEmojiModal,
    buildCategoryWelcomeModal,
    buildFormFieldEditorModal,
    buildFormTitleModal,
    buildMacroModal,
    buildPanelFieldModal,
    buildPanelNameModal,
    buildSetupComponents,
    buildSupportHoursModal,
    buildTextFieldModal,
    clearDraft,
    getDraft,
    persistDraftConfig,
    saveDraft,
    SETUP_REPLY_FLAGS,
    type PanelMode,
    type PanelTextField,
    type PreviewKind,
    type SetupChannelField,
    type SetupDraft,
    type SetupPage,
    type SetupRoleField,
    type SetupTextField,
} from "../../modules/setup/setupWizard.js";
import type { GuildConfig, TicketFormFieldType, TicketFormPreset } from "../../types.js";
import { t } from "../../lib/i18n.js";

const PRESET_VALUES = new Set(["evidence_reason", "vip_support", "org_request", "general_support"]);

function parseMode(value: string): PanelMode {
    return value === "config" ? "config" : "setup";
}

async function requireAdmin(interaction: RepliableInteraction, mode: PanelMode): Promise<SetupDraft | null> {
    if (!interaction.inGuild()) return null;
    const config = await ensureGuildConfig(interaction.guildId);
    if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role)) {
        await replyContainer(interaction, errorContainer(t("Apenas super-admin ou `Administrator` pode usar este painel.")));
        return null;
    }
    return getDraft(mode, interaction.guildId, interaction.user.id);
}

async function render(interaction: RepliableInteraction, draft: SetupDraft, notice?: string): Promise<void> {
    const components = buildSetupComponents(draft, notice);
    if (interaction.isButton() || interaction.isAnySelectMenu()) {
        await interaction.update({ components });
        return;
    }
    if (interaction.isModalSubmit() && interaction.isFromMessage()) {
        await interaction.update({ components });
        return;
    }
    await interaction.reply({ components, flags: SETUP_REPLY_FLAGS });
}

/** Apply a patch to the draft, persist immediately in config mode, then re-render. */
async function commit(interaction: RepliableInteraction, draft: SetupDraft, patch: Partial<SetupDraft>): Promise<void> {
    const updated = saveDraft(draft, patch, interaction.user.id);
    let notice: string | undefined;
    if (updated.mode === "config") {
        await persistDraftConfig(updated);
        notice = "Guardado.";
    }
    await render(interaction, updated, notice);
}

function applyTextField(field: SetupTextField, value: string): Partial<SetupDraft> {
    switch (field) {
        case "sla_first_response_minutes": return { sla_first_response_minutes: Math.max(1, Number.parseInt(value, 10) || 15) };
        case "sla_resolution_hours": return { sla_resolution_hours: Math.max(1, Number.parseInt(value, 10) || 24) };
        case "ticket_auto_close_hours": return { ticket_auto_close_hours: Math.max(0, Number.parseInt(value, 10) || 0) };
        case "ticket_max_open": return { ticket_max_open: Math.min(25, Math.max(1, Number.parseInt(value, 10) || 3)) };
        case "ticket_cooldown_seconds": return { ticket_cooldown_seconds: Math.min(3600, Math.max(0, Number.parseInt(value, 10) || 0)) };
        case "branding_color": {
            const color = parseColorString(value);
            return { branding_color: color !== null ? value : null };
        }
        default: return { [field]: value || null } as Partial<SetupDraft>;
    }
}

function safeField(interaction: ModalSubmitInteraction, customId: string): string | null {
    try {
        const value = interaction.fields.getTextInputValue(customId).trim();
        return value || null;
    } catch {
        return null;
    }
}

function safeSelect(interaction: ModalSubmitInteraction, customId: string): string | null {
    try {
        return interaction.fields.getStringSelectValues(customId)[0] ?? null;
    } catch {
        return null;
    }
}

const FIELD_TYPE_VALUES = new Set<TicketFormFieldType>(["short", "paragraph", "radio", "select"]);

/** Reads the add/edit field modal into a normalized FormFieldInput. */
function readFieldInput(interaction: ModalSubmitInteraction): FormFieldInput {
    const label = interaction.fields.getTextInputValue("field_label").trim();
    const rawType = safeSelect(interaction, "field_type");
    const type = rawType && FIELD_TYPE_VALUES.has(rawType as TicketFormFieldType) ? (rawType as TicketFormFieldType) : "short";
    const help = safeField(interaction, "field_help");
    const optionsRaw = safeField(interaction, "field_options");
    const options = optionsRaw ? optionsRaw.split(/[|\n]/).map((entry) => entry.trim()).filter(Boolean) : [];
    const required = safeSelect(interaction, "field_required") !== "no";
    return { label, type, help, options, required };
}

// ─── Navigation (setup: prev/next buttons; config: section jump select) ──────
createResponder({
    customId: "setup/:mode/nav/:page",
    types: [ResponderType.Button],
    async run(interaction, { mode, page }) {
        if (page === "current") return;
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await render(interaction, saveDraft(draft, { page: page as SetupPage }, interaction.user.id));
    },
});

createResponder({
    customId: "setup/:mode/navjump",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await render(interaction, saveDraft(draft, { page: interaction.values[0] as SetupPage }, interaction.user.id));
    },
});

// Reloads the live config from the database (config mode), keeping the current section.
createResponder({
    customId: "setup/:mode/refresh",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const m = parseMode(mode);
        const draft = await requireAdmin(interaction, m);
        if (!draft || !interaction.inGuild()) return;
        const { page, selected_category_id, selected_form_field_id } = draft;
        clearDraft(m, interaction.guildId, interaction.user.id);
        const fresh = await getDraft(m, interaction.guildId, interaction.user.id);
        await render(interaction, saveDraft(fresh, { page, selected_category_id, selected_form_field_id }, interaction.user.id), "Atualizado.");
    },
});

// ─── Text-field modals ───────────────────────────────────────────────────────
createResponder({
    customId: "setup/:mode/modal/:field",
    types: [ResponderType.Button],
    async run(interaction, { mode, field }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildTextFieldModal(field as SetupTextField, draft));
    },
});

createResponder({
    customId: "setup/:mode/modalsubmit/:field",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode, field }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const value = interaction.fields.getTextInputValue("value").trim();
        await commit(interaction, draft, applyTextField(field as SetupTextField, value));
    },
});

// ─── Role / channel selects ──────────────────────────────────────────────────
createResponder({
    customId: "setup/:mode/role/:field",
    types: [ResponderType.RoleSelect],
    async run(interaction, { mode, field }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await commit(interaction, draft, { [field as SetupRoleField]: interaction.values[0] ?? null } as Partial<SetupDraft>);
    },
});

createResponder({
    customId: "setup/:mode/channel/:field",
    types: [ResponderType.ChannelSelect, ResponderType.StringSelect],
    async run(interaction, { mode, field }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await commit(interaction, draft, { [field as SetupChannelField]: interaction.values[0] ?? null } as Partial<SetupDraft>);
    },
});

// ─── Categories ──────────────────────────────────────────────────────────────
createResponder({
    customId: "setup/:mode/cats/edit",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildCategoriesModal(draft));
    },
});

createResponder({
    customId: "setup/:mode/cats/submit",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        try {
            const labels = interaction.fields.getTextInputValue("categories").split("\n");
            const categories = normalizeTicketCategoriesFromLabels(labels, getTicketCategories(draft));
            await commit(interaction, draft, { ticket_categories_json: serializeTicketCategories(categories), page: "ticket_categories" });
        } catch (error) {
            await replyContainer(interaction, errorContainer(error instanceof Error ? error.message : t("Não foi possível guardar as categorias.")));
        }
    },
});

createResponder({
    customId: "setup/:mode/catselect",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await render(interaction, saveDraft(draft, { selected_category_id: interaction.values[0] ?? null }, interaction.user.id));
    },
});

// ─── Forms ───────────────────────────────────────────────────────────────────
createResponder({
    customId: "setup/:mode/form/preset",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const preset = interaction.values[0];
        if (!PRESET_VALUES.has(preset)) return;
        const forms = setTicketFormPreset(getTicketForms(draft), getTicketCategories(draft), draft.selected_category_id ?? "", preset as TicketFormPreset);
        await commit(interaction, draft, { ticket_forms_json: serializeTicketForms(forms) });
    },
});

createResponder({
    customId: "setup/:mode/form/field",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await render(interaction, saveDraft(draft, { selected_form_field_id: interaction.values[0] ?? null }, interaction.user.id));
    },
});

createResponder({
    customId: "setup/:mode/form/title",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildFormTitleModal(draft));
    },
});

createResponder({
    customId: "setup/:mode/form/titlesubmit/:cat",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode, cat }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const title = interaction.fields.getTextInputValue("modal_title").trim();
        const forms = setTicketFormTitle(getTicketForms(draft), cat, title);
        await commit(interaction, draft, { ticket_forms_json: serializeTicketForms(forms) });
    },
});

createResponder({
    customId: "setup/:mode/form/fieldnew",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildFormFieldEditorModal(draft, null));
    },
});

createResponder({
    customId: "setup/:mode/form/fieldcreate",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        try {
            const categoryId = draft.selected_category_id ?? "";
            const forms = addTicketFormField(getTicketForms(draft), categoryId, readFieldInput(interaction));
            const activeFields = forms.find((form) => form.category_id === categoryId)?.fields ?? [];
            const newFieldId = activeFields[activeFields.length - 1]?.id ?? null;
            await commit(interaction, draft, { ticket_forms_json: serializeTicketForms(forms), selected_form_field_id: newFieldId });
        } catch (error) {
            await replyContainer(interaction, errorContainer(error instanceof Error ? error.message : t("Não foi possível adicionar o campo.")));
        }
    },
});

createResponder({
    customId: "setup/:mode/form/fieldedit",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        if (!draft.selected_form_field_id) {
            await replyContainer(interaction, errorContainer(t("Seleciona primeiro um campo para editar.")));
            return;
        }
        await interaction.showModal(buildFormFieldEditorModal(draft, draft.selected_form_field_id));
    },
});

createResponder({
    // The field id travels in the customId (set when the modal was opened) so the submit
    // always targets exactly the field that was being edited.
    customId: "setup/:mode/form/fieldupdate/:fieldId",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode, fieldId }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        try {
            const forms = updateTicketFormField(getTicketForms(draft), draft.selected_category_id ?? "", fieldId, readFieldInput(interaction));
            await commit(interaction, draft, { ticket_forms_json: serializeTicketForms(forms), selected_form_field_id: fieldId });
        } catch (error) {
            await replyContainer(interaction, errorContainer(error instanceof Error ? error.message : t("Não foi possível guardar o campo.")));
        }
    },
});

createResponder({
    customId: "setup/:mode/form/fieldremove",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        try {
            const forms = removeTicketFormField(getTicketForms(draft), draft.selected_category_id ?? "", draft.selected_form_field_id ?? "");
            await commit(interaction, draft, { ticket_forms_json: serializeTicketForms(forms), selected_form_field_id: null });
        } catch (error) {
            await replyContainer(interaction, errorContainer(error instanceof Error ? error.message : t("Não foi possível remover o campo.")));
        }
    },
});

createResponder({
    customId: "setup/:mode/form/fieldmove/:direction",
    types: [ResponderType.Button],
    async run(interaction, { mode, direction }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const forms = moveTicketFormField(getTicketForms(draft), draft.selected_category_id ?? "", draft.selected_form_field_id ?? "", direction === "up" ? "up" : "down");
        await commit(interaction, draft, { ticket_forms_json: serializeTicketForms(forms) });
    },
});

createResponder({
    customId: "setup/:mode/form/reset",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const forms = resetTicketForm(getTicketForms(draft), getTicketCategories(draft), draft.selected_category_id ?? "");
        await commit(interaction, draft, { ticket_forms_json: serializeTicketForms(forms) });
    },
});

// ─── Ticket channels (Discord category mapping) ──────────────────────────────
createResponder({
    customId: "setup/:mode/catchannel",
    types: [ResponderType.ChannelSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const categories = setCategoryChannel(getTicketCategories(draft), draft.selected_category_id ?? "", interaction.values[0] ?? null);
        await commit(interaction, draft, { ticket_categories_json: serializeTicketCategories(categories) });
    },
});

createResponder({
    customId: "setup/:mode/catchannel/clear",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const categories = setCategoryChannel(getTicketCategories(draft), draft.selected_category_id ?? "", null);
        await commit(interaction, draft, { ticket_categories_json: serializeTicketCategories(categories) });
    },
});

// One-shot: point EVERY ticket category at the same Discord category.
createResponder({
    customId: "setup/:mode/catchannel/all",
    types: [ResponderType.ChannelSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const channelId = interaction.values[0] ?? null;
        const categories = getTicketCategories(draft).map((category) => ({ ...category, channel_id: channelId }));
        await commit(interaction, draft, { ticket_categories_json: serializeTicketCategories(categories) });
    },
});

// Nome dos canais dos tickets (vale para os tickets que abrirem a partir de agora).
createResponder({
    customId: "setup/:mode/nameformat",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await commit(interaction, draft, { ticket_name_format: normalizeTicketNameFormat(interaction.values[0]) });
    },
});

// ─── Button style / emoji / preview ──────────────────────────────────────────
createResponder({
    customId: "setup/:mode/buttonstyle",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await commit(interaction, draft, { ticket_button_style: interaction.values[0] as GuildConfig["ticket_button_style"] });
    },
});

createResponder({
    customId: "setup/:mode/emojipick",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const value = interaction.values[0];
        await commit(interaction, draft, { ticket_button_emoji: value === "__none__" ? null : e(value) });
    },
});

createResponder({
    customId: "setup/:mode/emojipage/:page",
    types: [ResponderType.Button],
    async run(interaction, { mode, page }) {
        if (page === "current") return void interaction.deferUpdate();
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await render(interaction, saveDraft(draft, { emoji_page: Number.parseInt(page, 10) || 1 }, interaction.user.id));
    },
});

createResponder({
    customId: "setup/:mode/preview",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await render(interaction, saveDraft(draft, { preview: interaction.values[0] as PreviewKind }, interaction.user.id));
    },
});

// ─── Republish (config only): main panel + every published multi-panel ───────
createResponder({
    customId: "setup/:mode/republish",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;

        let published = 0;

        // Main panel (legacy single panel on ticket_channel).
        let updated = draft;
        if (draft.ticket_channel) {
            const channel = await interaction.client.channels.fetch(draft.ticket_channel).catch(() => null);
            if (channel?.isTextBased()) {
                const messageId = await upsertTicketPanel(channel as TextChannel, draft as GuildConfig);
                updated = saveDraft(draft, { ticket_panel_message: messageId }, interaction.user.id);
                published++;
            }
        }
        const saved = await persistDraftConfig(updated);

        // Multi-panels: refresh every already-published panel message in place.
        for (const panel of getTicketPanels(saved)) {
            if (!panel.channel_id || !panel.message_id) continue;
            const channel = await interaction.client.channels.fetch(panel.channel_id).catch(() => null);
            if (!channel?.isTextBased()) continue;
            const edited = await (channel as TextChannel).messages
                .edit(panel.message_id, { components: [buildPanelContainer(panel, saved)] })
                .catch(() => null);
            if (edited) published++;
        }

        await render(interaction, updated, published
            ? `${published} ${t("painel(is) republicado(s) com a configuração atual.")}`
            : t("Nada para republicar — publica primeiro um painel (/painel)."));
    },
});

// ─── Finalize (setup only) ───────────────────────────────────────────────────
createResponder({
    customId: "setup/:mode/finalize",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;

        let saved = await persistDraftConfig(draft);
        if (saved.ticket_channel) {
            const channel = await interaction.client.channels.fetch(saved.ticket_channel).catch(() => null);
            if (channel?.isTextBased()) {
                const messageId = await upsertTicketPanel(channel as TextChannel, saved);
                saved = await upsertGuildConfig({ guild_id: interaction.guildId!, ticket_panel_message: messageId });
            }
        }

        appendAuditLog({ guildId: interaction.guildId, actorId: interaction.user.id, action: "setup.update", details: { ticketChannel: saved.ticket_channel } });
        clearDraft("setup", interaction.guildId!, interaction.user.id);
        await interaction.update({ components: [successContainer(t("Configuração finalizada com sucesso. O painel de tickets foi publicado, se configurado. Usa `/config` para ajustes futuros."))] });
    },
});

// ─── Support: rating toggle / office hours ───────────────────────────────────
createResponder({
    customId: "setup/:mode/ratingtoggle",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await commit(interaction, draft, { ticket_rating_enabled: draft.ticket_rating_enabled === false });
    },
});

createResponder({
    customId: "setup/:mode/supporthours",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildSupportHoursModal(draft));
    },
});

createResponder({
    customId: "setup/:mode/supporthours/submit",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        // Os três campos são menus de seleção — os valores já vêm da lista, mas
        // confirmamos na mesma antes de gravar.
        const start = interaction.fields.getStringSelectValues("start")[0] ?? "";
        const end = interaction.fields.getStringSelectValues("end")[0] ?? "";
        const tzRaw = interaction.fields.getStringSelectValues("tz")[0] ?? "";
        const time = /^([01]?\d|2[0-3]):([0-5]\d)$/;
        if (!time.test(start) || !time.test(end)) {
            await replyContainer(interaction, errorContainer(t("Horas inválidas. Escolhe o início e o fim nas listas.")));
            return;
        }
        const tz = tzRaw && isValidTimezone(tzRaw) ? tzRaw : DEFAULT_SUPPORT_TZ;
        await commit(interaction, draft, { support_hours_json: serializeSupportHours({ enabled: true, tz, start, end }) });
    },
});

createResponder({
    customId: "setup/:mode/supportoff",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await commit(interaction, draft, { support_hours_json: null });
    },
});

// ─── Support: macros (canned responses) ──────────────────────────────────────
function activeMacroId(draft: SetupDraft): string | null {
    const macros = getTicketMacros(draft);
    return (macros.find((macro) => macro.id === draft.selected_macro_id) ?? macros[0])?.id ?? null;
}

createResponder({
    customId: "setup/:mode/macroselect",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await render(interaction, saveDraft(draft, { selected_macro_id: interaction.values[0] ?? null }, interaction.user.id));
    },
});

createResponder({
    customId: "setup/:mode/macronew",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildMacroModal(draft, "new"));
    },
});

createResponder({
    customId: "setup/:mode/macroedit",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        if (!activeMacroId(draft)) {
            await replyContainer(interaction, errorContainer(t("Não há nenhuma resposta rápida selecionada.")));
            return;
        }
        await interaction.showModal(buildMacroModal(draft, "edit"));
    },
});

async function handleMacroSubmit(interaction: ModalSubmitInteraction, mode: string, macroId: string | null): Promise<void> {
    const draft = await requireAdmin(interaction, parseMode(mode));
    if (!draft) return;
    const name = interaction.fields.getTextInputValue("name").trim();
    const content = interaction.fields.getTextInputValue("content").trim();
    if (!name || !content) {
        await replyContainer(interaction, errorContainer(t("Preenche o nome e o conteúdo da resposta rápida.")));
        return;
    }
    const macros = upsertMacro(getTicketMacros(draft), { id: macroId ?? undefined, name, content });
    const savedId = macroId ?? macros[macros.length - 1]?.id ?? null;
    await commit(interaction, draft, { ticket_macros_json: serializeTicketMacros(macros), selected_macro_id: savedId });
}

createResponder({
    customId: "setup/:mode/macrosubmit/new",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode }) {
        await handleMacroSubmit(interaction, mode, null);
    },
});

createResponder({
    customId: "setup/:mode/macrosubmit/edit/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode, id }) {
        await handleMacroSubmit(interaction, mode, id);
    },
});

createResponder({
    customId: "setup/:mode/macroremove",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const id = activeMacroId(draft);
        if (!id) return;
        const macros = removeMacro(getTicketMacros(draft), id);
        await commit(interaction, draft, { ticket_macros_json: serializeTicketMacros(macros), selected_macro_id: null });
    },
});

// ─── Categories: welcome / emoji / ping roles ────────────────────────────────
createResponder({
    customId: "setup/:mode/welcomeedit",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildCategoryWelcomeModal(draft));
    },
});

createResponder({
    customId: "setup/:mode/welcomesubmit/:cat",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode, cat }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const message = interaction.fields.getTextInputValue("message").trim() || null;
        const categories = setCategoryWelcome(getTicketCategories(draft), cat, message);
        await commit(interaction, draft, { ticket_categories_json: serializeTicketCategories(categories) });
    },
});

createResponder({
    customId: "setup/:mode/catemoji",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildCategoryEmojiModal(draft));
    },
});

createResponder({
    customId: "setup/:mode/catemojisubmit/:cat",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode, cat }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const value = interaction.fields.getTextInputValue("emoji").trim() || null;
        const categories = setCategoryEmoji(getTicketCategories(draft), cat, value);
        await commit(interaction, draft, { ticket_categories_json: serializeTicketCategories(categories) });
    },
});

createResponder({
    customId: "setup/:mode/catping",
    types: [ResponderType.RoleSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const categories = setCategoryPingRoles(getTicketCategories(draft), draft.selected_category_id ?? "", [...interaction.values]);
        await commit(interaction, draft, { ticket_categories_json: serializeTicketCategories(categories) });
    },
});

// ─── Panels ──────────────────────────────────────────────────────────────────
function activePanel(draft: SetupDraft) {
    const panels = getTicketPanels(draft);
    return panels.find((panel) => panel.id === draft.selected_panel_id) ?? panels[0] ?? null;
}

createResponder({
    customId: "setup/:mode/panelselect",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await render(interaction, saveDraft(draft, { selected_panel_id: interaction.values[0] ?? null }, interaction.user.id));
    },
});

createResponder({
    customId: "setup/:mode/panelnew",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        await interaction.showModal(buildPanelNameModal(draft, "new"));
    },
});

createResponder({
    customId: "setup/:mode/panelrename",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        if (!activePanel(draft)) {
            await replyContainer(interaction, errorContainer(t("Não há nenhum painel selecionado.")));
            return;
        }
        await interaction.showModal(buildPanelNameModal(draft, "rename"));
    },
});

createResponder({
    customId: "setup/:mode/panelname/new",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const name = interaction.fields.getTextInputValue("name").trim();
        if (!name) {
            await replyContainer(interaction, errorContainer(t("Indica um nome para o painel.")));
            return;
        }
        const panel = createDefaultPanel(name);
        const updated = upsertPanel(getTicketPanels(draft), panel);
        await commit(interaction, draft, { ticket_panels_json: serializeTicketPanels(updated), selected_panel_id: panel.id });
    },
});

createResponder({
    customId: "setup/:mode/panelname/rename/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode, id }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const name = interaction.fields.getTextInputValue("name").trim();
        if (!name) {
            await replyContainer(interaction, errorContainer(t("Indica um nome para o painel.")));
            return;
        }
        const panels = getTicketPanels(draft);
        const current = panels.find((panel) => panel.id === id);
        if (!current) {
            await replyContainer(interaction, errorContainer(t("Painel não encontrado.")));
            return;
        }
        const updated = upsertPanel(panels, { ...current, name });
        await commit(interaction, draft, { ticket_panels_json: serializeTicketPanels(updated), selected_panel_id: current.id });
    },
});

createResponder({
    customId: "setup/:mode/paneldelete",
    types: [ResponderType.Button],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const current = activePanel(draft);
        if (!current) return;
        const updated = removePanel(getTicketPanels(draft), current.id);
        await commit(interaction, draft, { ticket_panels_json: serializeTicketPanels(updated), selected_panel_id: null });
    },
});

createResponder({
    customId: "setup/:mode/panelcats",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const current = activePanel(draft);
        if (!current) return;
        const updated = upsertPanel(getTicketPanels(draft), { ...current, category_ids: [...interaction.values] });
        await commit(interaction, draft, { ticket_panels_json: serializeTicketPanels(updated), selected_panel_id: current.id });
    },
});

createResponder({
    customId: "setup/:mode/panelstyle",
    types: [ResponderType.StringSelect],
    async run(interaction, { mode }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const current = activePanel(draft);
        if (!current) return;
        const updated = upsertPanel(getTicketPanels(draft), { ...current, button_style: interaction.values[0] as GuildConfig["ticket_button_style"] });
        await commit(interaction, draft, { ticket_panels_json: serializeTicketPanels(updated), selected_panel_id: current.id });
    },
});

createResponder({
    customId: "setup/:mode/panelmodal/:field",
    types: [ResponderType.Button],
    async run(interaction, { mode, field }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        if (!activePanel(draft)) {
            await replyContainer(interaction, errorContainer(t("Cria ou seleciona um painel primeiro.")));
            return;
        }
        await interaction.showModal(buildPanelFieldModal(draft, field as PanelTextField));
    },
});

createResponder({
    customId: "setup/:mode/panelfield/:field/:id",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction, { mode, field, id }) {
        const draft = await requireAdmin(interaction, parseMode(mode));
        if (!draft) return;
        const panels = getTicketPanels(draft);
        const current = panels.find((panel) => panel.id === id);
        if (!current) {
            await replyContainer(interaction, errorContainer(t("Painel não encontrado.")));
            return;
        }
        const value = interaction.fields.getTextInputValue("value").trim() || null;
        const key = field as PanelTextField;
        const updated = upsertPanel(panels, { ...current, [key]: value });
        await commit(interaction, draft, { ticket_panels_json: serializeTicketPanels(updated), selected_panel_id: current.id });
    },
});
