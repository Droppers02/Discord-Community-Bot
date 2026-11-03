import { describe, expect, it } from "vitest";
import { buildOpenTicketModal } from "../../src/modules/tickets/ticketForm.js";
import { FIELD_LIMITS, getTicketForm } from "../../src/modules/tickets/forms.js";

// Regressão: um formulário guardado com valores fora dos limites do Discord (label longo,
// max_length inválido, descrição longa) fazia a API rejeitar o modal INTEIRO. O membro só
// via "Ocorreu um erro inesperado" ao abrir o ticket e a categoria ficava inutilizável.
// Como a normalização corre em cada leitura, o clamp também repara os formulários já partidos.

const categories = JSON.stringify([{ id: "geral", label: "Geral" }]);

function configWith(fields: unknown[], modalTitle = "Geral") {
    return {
        ticket_categories_json: categories,
        ticket_forms_json: JSON.stringify([{ category_id: "geral", preset: "custom", modal_title: modalTitle, fields }]),
    };
}

describe("limites dos campos do formulário de ticket", () => {
    it("um max_length inválido não impede a abertura do modal", () => {
        for (const maxLength of [0, -1, 5000]) {
            const config = configWith([{ id: "reason", type: "paragraph", label: "Descrição", required: true, max_length: maxLength }]);
            expect(() => buildOpenTicketModal(config, "geral").toJSON()).not.toThrow();

            const field = getTicketForm(config, "geral")!.fields[0];
            expect(field.max_length).toBeGreaterThanOrEqual(FIELD_LIMITS.maxLengthMin);
            expect(field.max_length).toBeLessThanOrEqual(FIELD_LIMITS.maxLengthMax);
        }
    });

    it("corta o label ao limite do Discord em vez de rebentar o modal", () => {
        const config = configWith([{ id: "reason", type: "paragraph", label: "L".repeat(60), required: true, max_length: 1000 }]);
        expect(() => buildOpenTicketModal(config, "geral").toJSON()).not.toThrow();
        expect(getTicketForm(config, "geral")!.fields[0].label.length).toBeLessThanOrEqual(FIELD_LIMITS.label);
    });

    it("corta a descrição de um campo de escolha", () => {
        const config = configWith([{ id: "tipo", type: "select", label: "Tipo", description: "D".repeat(150), options: [{ label: "A", value: "a" }] }]);
        expect(() => buildOpenTicketModal(config, "geral").toJSON()).not.toThrow();
        expect(getTicketForm(config, "geral")!.fields[0].description!.length).toBeLessThanOrEqual(FIELD_LIMITS.description);
    });

    it("corta o título do modal", () => {
        const config = configWith([{ id: "reason", type: "paragraph", label: "Descrição", required: true, max_length: 1000 }], "T".repeat(90));
        expect(() => buildOpenTicketModal(config, "geral").toJSON()).not.toThrow();
        expect(getTicketForm(config, "geral")!.modal_title.length).toBeLessThanOrEqual(FIELD_LIMITS.modalTitle);
    });

    it("uma categoria sem formulário guardado continua a abrir (usa o preset)", () => {
        const config = { ticket_categories_json: categories, ticket_forms_json: null };
        expect(() => buildOpenTicketModal(config, "geral").toJSON()).not.toThrow();
    });
});
