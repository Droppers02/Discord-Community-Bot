import { describe, expect, it } from "vitest";
import { ActionRowBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import "../../src/lib/modalLabels.js";

// Os modais montados à moda antiga (ActionRow + TextInput) seguem para o Discord no
// formato atual (Label + TextInput); os já montados com LabelBuilder não mudam.
describe("modais no formato Label", () => {
    it("converte ActionRow + TextInput em Label + TextInput", () => {
        const modal = new ModalBuilder().setCustomId("m").setTitle("Teste").addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder().setCustomId("motivo").setLabel("Motivo").setStyle(TextInputStyle.Paragraph).setRequired(true),
            ),
        );
        const json = modal.toJSON() as unknown as { components: Array<Record<string, unknown>> };
        expect(json.components).toHaveLength(1);
        const label = json.components[0];
        expect(label.type).toBe(18);
        expect(label.label).toBe("Motivo");
        const input = label.component as Record<string, unknown>;
        expect(input.type).toBe(4);
        expect(input.custom_id).toBe("motivo");
        expect(input.label).toBeUndefined();
        expect(input.required).toBe(true);
    });

    it("deixa os modais que já usam LabelBuilder como estão", () => {
        const modal = new ModalBuilder().setCustomId("m").setTitle("Teste").addLabelComponents(
            new LabelBuilder().setLabel("Nome").setTextInputComponent(new TextInputBuilder().setCustomId("nome").setStyle(TextInputStyle.Short)),
        );
        const json = modal.toJSON() as unknown as { components: Array<Record<string, unknown>> };
        expect(json.components[0].type).toBe(18);
        expect(json.components[0].label).toBe("Nome");
    });
});
