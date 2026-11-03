import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

export interface ModalField {
    customId: string;
    label: string;
    style: TextInputStyle;
    required?: boolean;
    placeholder?: string;
    value?: string;
    maxLength?: number;
}

export function buildTextInputModal(customId: string, title: string, fields: ModalField[]): ModalBuilder {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
    modal.addComponents(
        ...fields.map((field) =>
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(field.customId)
                    .setLabel(field.label)
                    .setStyle(field.style)
                    .setRequired(field.required ?? false)
                    .setPlaceholder(field.placeholder ?? "")
                    .setValue(field.value ?? "")
                    .setMaxLength(field.maxLength ?? 4000),
            ),
        ),
    );
    return modal;
}
