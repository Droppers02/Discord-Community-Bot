import { ModalBuilder } from "discord.js";

// ─── Modais no formato atual do Discord (Label) ──────────────────────────────
// Desde ago 2025 o Discord dá como obsoleto o formato antigo dos modais — cada campo de
// texto dentro de uma ActionRow — e passou a usar o componente Label (que é também o que
// permite checkboxes, grupos de escolha, seletores e upload de ficheiros nos modais).
//
// Em vez de reescrever cada modal à mão, convertem-se aqui, no JSON que segue para o
// Discord: `ActionRow { TextInput(label) }` passa a `Label(label) { TextInput }`. O código
// que monta os modais continua igual e os modais novos podem usar já o LabelBuilder —
// esses passam por aqui sem alterações. A leitura das respostas
// (`fields.getTextInputValue`) é a mesma nos dois formatos.
// Mesma conversão nos quatro bots (cópia em cada um).

const ACTION_ROW = 1;
const TEXT_INPUT = 4;
const LABEL = 18;

interface RawComponent { type: number; components?: RawComponent[]; label?: string; [key: string]: unknown }

/** Converte as linhas antigas de um modal (já em JSON) para Labels. Não mexe no resto. */
export function toLabelComponents<T extends { components?: unknown[] }>(modal: T): T {
    if (!Array.isArray(modal.components)) return modal;
    const components = (modal.components as RawComponent[]).map((component) => {
        const inner = component.type === ACTION_ROW && component.components?.length === 1 ? component.components[0] : null;
        if (!inner || inner.type !== TEXT_INPUT || typeof inner.label !== "string") return component;
        const { label, ...textInput } = inner;
        return { type: LABEL, label, component: textInput };
    });
    return { ...modal, components };
}

let installed = false;

/** Liga a conversão para todos os ModalBuilder do processo. Chamar uma vez no arranque. */
export function installModalLabels(): void {
    if (installed) return;
    installed = true;
    const original = ModalBuilder.prototype.toJSON;
    ModalBuilder.prototype.toJSON = function toJSONWithLabels(this: ModalBuilder) {
        return toLabelComponents(original.call(this));
    } as typeof original;
}

installModalLabels();
