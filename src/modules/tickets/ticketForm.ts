import { t } from "../../lib/i18n.js";
import {
    type Attachment,
    CacheType,
    FileUploadBuilder,
    LabelBuilder,
    ModalBuilder,
    ModalSubmitInteraction,
    RadioGroupBuilder,
    RadioGroupOptionBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { buildCustomId } from "../../lib/ids.js";
import type { GuildConfig, TicketCategory, TicketCategoryFormConfig, TicketFormFieldConfig, TicketFormResponseEntry } from "../../types.js";
import { getTicketForm } from "./forms.js";
import { NotFoundError, ValidationError } from "../../errors/index.js";

function validateClipUrl(rawValue: string, hasClip: boolean): string | null {
    if (!hasClip) return null;

    const value = rawValue.trim();
    if (!value) {
        throw new ValidationError(t("Selecionaste que tens clip, por isso tens de colar o link do clip."));
    }

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new ValidationError(t("O link do clip não é válido. Usa um URL completo, por exemplo `https://...`."));
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new ValidationError(t("O link do clip tem de usar `http` ou `https`."));
    }

    return parsed.toString();
}

function buildFieldComponent(field: TicketFormFieldConfig) {
    if (field.type === "short" || field.type === "paragraph") {
        const input = new TextInputBuilder()
            .setCustomId(field.id)
            .setRequired(field.required)
            .setStyle(field.type === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setMaxLength(field.max_length ?? (field.type === "paragraph" ? 1000 : 120));

        if (field.placeholder) input.setPlaceholder(field.placeholder);

        return new LabelBuilder().setLabel(field.label).setTextInputComponent(input);
    }

    if (field.type === "select") {
        const input = new StringSelectMenuBuilder()
            .setCustomId(field.id)
            .setPlaceholder(field.description ?? field.label)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions((field.options ?? []).map((option) => ({ label: option.label, value: option.value, default: option.default ?? false })));

        const label = new LabelBuilder().setLabel(field.label).setStringSelectMenuComponent(input);
        if (field.description) label.setDescription(field.description);
        return label;
    }

    if (field.type === "file") {
        const input = new FileUploadBuilder()
            .setCustomId(field.id)
            .setRequired(field.required)
            .setMinValues(field.required ? 1 : 0)
            .setMaxValues(field.max_files ?? 5);

        const label = new LabelBuilder().setLabel(field.label).setFileUploadComponent(input);
        if (field.description) label.setDescription(field.description);
        return label;
    }

    const input = new RadioGroupBuilder()
        .setCustomId(field.id)
        .setRequired(field.required)
        .setOptions(
            ...(field.options ?? []).map((option) => new RadioGroupOptionBuilder().setLabel(option.label).setValue(option.value).setDefault(option.default ?? false)),
        );

    const label = new LabelBuilder().setLabel(field.label).setRadioGroupComponent(input);
    if (field.description) label.setDescription(field.description);
    return label;
}

export function buildOpenTicketModal(config: GuildConfig, categoryId: TicketCategory): ModalBuilder {
    const form = getTicketForm(config, categoryId);
    if (!form) {
        throw new NotFoundError(t("Não foi possível encontrar o formulário da categoria selecionada."));
    }

    return new ModalBuilder()
        .setCustomId(buildCustomId("ticket", "reason-modal", categoryId))
        .setTitle(form.modal_title)
        .addLabelComponents(...form.fields.map((field) => buildFieldComponent(field)));
}

function resolveOptionLabel(field: TicketFormFieldConfig, value: string) {
    return field.options?.find((option) => option.value === value)?.label ?? value;
}

export function parseTicketSubmission(form: TicketCategoryFormConfig, interaction: ModalSubmitInteraction<CacheType>) {
    const responses: TicketFormResponseEntry[] = [];
    const attachments: Attachment[] = [];
    let reason = "";
    let firstText = "";
    let clipRequested = false;
    let clipUrlRaw = "";

    for (const field of form.fields) {
        let value = "";
        let displayValue = "";

        if (field.type === "short" || field.type === "paragraph") {
            value = interaction.fields.getTextInputValue(field.id).trim();
            displayValue = value;
            if (!firstText && value) firstText = value;
        } else if (field.type === "select") {
            value = interaction.fields.getStringSelectValues(field.id)[0] ?? "";
            displayValue = resolveOptionLabel(field, value);
        } else if (field.type === "file") {
            const files = [...(interaction.fields.getUploadedFiles(field.id, field.required)?.values() ?? [])];
            attachments.push(...files);
            value = files.map((file) => file.name).join(", ");
            displayValue = files.length ? `${t("{count, plural, one {# ficheiro} other {# ficheiros}}", { count: files.length })}: ${value}` : "";
        } else if (field.required) {
            value = interaction.fields.getRadioGroup(field.id, true);
            displayValue = resolveOptionLabel(field, value);
        } else {
            value = interaction.fields.getRadioGroup(field.id) ?? "";
            displayValue = resolveOptionLabel(field, value);
        }

        responses.push({ field_id: field.id, label: field.label, value, display_value: displayValue, semantic: field.semantic });

        if (field.semantic === "reason") reason = value;
        if (field.semantic === "clip_toggle") clipRequested = value === "yes";
        if (field.semantic === "clip_url") clipUrlRaw = value;
    }

    // A custom form may have no explicit "reason" field — fall back to the first text answer
    // (or any non-empty answer) so a ticket can always be opened.
    const resolvedReason = reason.trim()
        || firstText.trim()
        || responses.find((entry) => entry.display_value.trim())?.display_value.trim()
        || t("Ticket aberto");

    const clipUrl = clipUrlRaw.trim() ? validateClipUrl(clipUrlRaw, true) : validateClipUrl(clipUrlRaw, clipRequested);
    return { reason: resolvedReason, clipUrl, responses, attachments };
}
