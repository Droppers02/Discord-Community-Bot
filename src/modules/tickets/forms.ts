import type {
    GuildConfig,
    TicketCategory,
    TicketCategoryConfig,
    TicketCategoryFormConfig,
    TicketFormFieldConfig,
    TicketFormFieldSemantic,
    TicketFormFieldType,
    TicketFormOptionConfig,
    TicketFormPreset,
    TicketFormResponseEntry,
    TicketRecord,
} from "../../types.js";
import type { ContainerField } from "../../lib/containers.js";
import { getTicketCategories } from "./categories.js";
import { ValidationError } from "../../errors/index.js";
import { t, tk } from "../../lib/i18n.js";

type FormsConfigInput = Partial<Pick<GuildConfig, "ticket_categories_json" | "ticket_forms_json">> | null | undefined;

export const TICKET_FORM_PRESET_LABELS: Record<TicketFormPreset, string> = {
    evidence_reason: tk("Motivo + prova"),
    vip_support: tk("Compras e pagamentos"),
    org_request: tk("Pedidos"),
    general_support: tk("Suporte geral"),
};

export const TICKET_FIELD_TYPE_LABELS: Record<TicketFormFieldType, string> = {
    short: tk("Texto curto"),
    paragraph: tk("Texto longo"),
    select: tk("Lista de seleção"),
    radio: tk("Escolha única"),
    file: tk("Anexos (ficheiros)"),
};

const FIELD_TYPE_VALUES = new Set<TicketFormFieldType>(["short", "paragraph", "radio", "select", "file"]);

// Discord modals allow at most 5 rows, so a ticket form can hold up to 5 fields.
export const MIN_FORM_FIELDS = 1;
export const MAX_FORM_FIELDS = 5;

/**
 * Limites REAIS da API do Discord para os componentes de um modal.
 *
 * Passar qualquer um destes faz a API rejeitar o modal INTEIRO — e o membro só via
 * "Ocorreu um erro inesperado" ao tentar abrir o ticket, sem forma de perceber porquê.
 * Antes o código cortava o label a 80 e a ajuda a 200 (acima do que o Discord aceita) e
 * o max_length guardado entrava sem validação nenhuma, por isso bastava um label um pouco
 * mais longo para deixar a categoria impossível de usar.
 */
export const FIELD_LIMITS = {
    /** Label component (o título de cada campo do modal). */
    label: 45,
    /** Descrição/ajuda por baixo do label. */
    description: 100,
    /** Placeholder de um campo de texto. */
    placeholder: 100,
    /** Título do modal. */
    modalTitle: 45,
    /** Comprimento máximo de um campo de texto: o Discord exige 1–4000. */
    maxLengthMin: 1,
    maxLengthMax: 4000,
    /** Ficheiros por campo de anexos: o Discord aceita 1–10. */
    maxFilesMax: 10,
    maxFilesDefault: 5,
} as const;

/** Garante um max_files dentro do intervalo aceite pelo Discord (1–10). */
function clampMaxFiles(value: unknown): number {
    const raw = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
    if (raw <= 0) return FIELD_LIMITS.maxFilesDefault;
    return Math.min(raw, FIELD_LIMITS.maxFilesMax);
}

/** Garante um max_length dentro do intervalo aceite pelo Discord (1–4000). */
function clampMaxLength(value: unknown, type: "short" | "paragraph"): number {
    const fallback = type === "paragraph" ? 1000 : 200;
    const raw = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
    // 0 é o "sem limite próprio" do painel do site (o máximo do Discord). Antes caía no
    // mínimo e as perguntas criadas no site só aceitavam 1 carácter.
    if (raw <= 0) return FIELD_LIMITS.maxLengthMax;
    return Math.min(Math.max(raw, FIELD_LIMITS.maxLengthMin), FIELD_LIMITS.maxLengthMax);
}

/** Keep a field's semantic only if it still makes sense for the (possibly new) field type. */
function compatibleSemantic(semantic: TicketFormFieldSemantic | undefined, type: TicketFormFieldType): TicketFormFieldSemantic {
    switch (semantic) {
        case "reason":
        case "clip_url":
            return type === "short" || type === "paragraph" ? semantic : "none";
        case "clip_toggle":
            return type === "radio" || type === "select" ? "clip_toggle" : "none";
        default:
            return "none";
    }
}

function uniqueFieldId(base: string, used: Set<string>): string {
    let id = sanitizeValue(base, "campo");
    let suffix = 2;
    while (used.has(id)) {
        id = `${sanitizeValue(base, "campo")}-${suffix}`;
        suffix += 1;
    }
    used.add(id);
    return id;
}

export interface FormFieldInput {
    label: string;
    type: TicketFormFieldType;
    /** Placeholder (text fields) or help text (choice fields). */
    help?: string | null;
    /** Option labels for `select`/`radio`. */
    options?: string[];
    required: boolean;
}

/**
 * Builds (or rebuilds) a single field from editor input. When `existing` is passed the
 * field id and a still-compatible semantic are preserved; otherwise a fresh unique id is
 * generated. Choice fields require options; `clip_toggle` keeps its fixed yes/no values.
 */
export function buildFormField(input: FormFieldInput, used: Set<string>, existing?: TicketFormFieldConfig): TicketFormFieldConfig {
    const type = FIELD_TYPE_VALUES.has(input.type) ? input.type : "short";
    // Cortado aos limites do Discord (não aos nossos): um label demasiado longo era aceite
    // na gravação e só rebentava depois, ao abrir o modal do ticket.
    const label = input.label.trim().slice(0, FIELD_LIMITS.label) || "Campo";
    const id = existing ? existing.id : uniqueFieldId(label, used);
    if (existing) used.add(id);
    const semantic = compatibleSemantic(existing?.semantic, type);

    const field: TicketFormFieldConfig = { id, type, label, required: input.required, semantic };
    const help = input.help?.trim() ? input.help.trim().slice(0, FIELD_LIMITS.description) : null;

    if (type === "short" || type === "paragraph") {
        field.placeholder = help?.slice(0, FIELD_LIMITS.placeholder) ?? null;
        field.max_length = clampMaxLength(undefined, type);
        return field;
    }

    field.description = help;
    if (type === "file") {
        field.max_files = clampMaxFiles(existing?.max_files);
        return field;
    }
    const labels = (input.options ?? []).map((option) => option.trim()).filter(Boolean);
    if (semantic === "clip_toggle") {
        field.options = [
            { label: labels[0] || t("Sim"), value: "yes" },
            { label: labels[1] || t("Não"), value: "no", default: true },
        ];
        return field;
    }
    if (labels.length < (type === "radio" ? 2 : 1)) {
        throw new ValidationError(type === "radio"
            ? t("Um campo de escolha única precisa de pelo menos 2 opções (separadas por `|`).")
            : t("Um campo de lista de seleção precisa de pelo menos 1 opção (separadas por `|`)."));
    }
    field.options = buildOptions(labels);
    return field;
}

function sanitizeValue(value: string, fallback: string) {
    const normalized = value
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 32);

    return normalized || fallback;
}

function buildOptions(labels: string[], defaultsToFirst = true): TicketFormOptionConfig[] {
    const used = new Set<string>();
    return labels
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label, index) => {
            let value = sanitizeValue(label, `opcao-${index + 1}`);
            let suffix = 2;
            while (used.has(value)) {
                value = `${value}-${suffix}`;
                suffix += 1;
            }
            used.add(value);

            return { label, value, default: defaultsToFirst ? index === 0 : false } satisfies TicketFormOptionConfig;
        });
}

function buildTextField(
    id: string,
    type: Extract<TicketFormFieldConfig["type"], "short" | "paragraph">,
    label: string,
    placeholder: string,
    semantic: TicketFormFieldSemantic = "none",
    required = true,
    maxLength?: number,
): TicketFormFieldConfig {
    return { id, type, label, placeholder, required, semantic, max_length: maxLength };
}

function buildChoiceField(
    id: string,
    type: Extract<TicketFormFieldConfig["type"], "radio" | "select">,
    label: string,
    description: string,
    options: TicketFormOptionConfig[],
    semantic: TicketFormFieldSemantic = "none",
): TicketFormFieldConfig {
    return { id, type, label, description, required: true, semantic, options };
}

function inferPreset(category: Pick<TicketCategoryConfig, "id" | "label">): TicketFormPreset {
    const haystack = `${category.id} ${category.label}`.toLowerCase();
    if (haystack.includes("compra") || haystack.includes("pagamento") || haystack.includes("loja") || haystack.includes("billing")) return "vip_support";
    if (haystack.includes("pedido") || haystack.includes("candidat") || haystack.includes("parceria")) return "org_request";
    if (haystack.includes("report") || haystack.includes("denunc") || haystack.includes("bug") || haystack.includes("abuso")) return "evidence_reason";
    return "general_support";
}

function buildDefaultModalTitle(categoryLabel: string, preset: TicketFormPreset): string {
    if (preset === "vip_support") return t("Compras • {category}", { category: categoryLabel });
    if (preset === "org_request") return t("Pedido • {category}", { category: categoryLabel });
    if (preset === "evidence_reason") return t("Abrir ticket • {category}", { category: categoryLabel });
    return t("Suporte geral • {category}", { category: categoryLabel });
}

function buildPresetFields(preset: TicketFormPreset): TicketFormFieldConfig[] {
    if (preset === "vip_support") {
        return [
            buildChoiceField("purchase_type", "select", t("Tipo de assunto"), t("Indica o tipo de questão relacionada com compras ou pagamentos."), buildOptions(["Compra", t("Subscrição"), "Reembolso", t("Pagamento falhado"), "Outro"])),
            buildTextField("order_reference", "short", t("Referência da compra"), t("Nº de encomenda, recibo ou e-mail usado"), "none", false, 120),
            buildTextField("reason", "paragraph", t("Descrição"), t("Explica o que adquiriste e o que precisas de resolver."), "reason", true, 1000),
        ];
    }

    if (preset === "org_request") {
        return [
            buildChoiceField("request_type", "select", t("Tipo de pedido"), t("Escolhe a natureza do pedido para a equipa encaminhar melhor o ticket."), buildOptions(["Candidatura", "Parceria", t("Sugestão"), t("Reclamação"), "Outro"])),
            buildTextField("subject", "short", "Assunto", t("Resume o pedido numa frase"), "none", true, 120),
            buildTextField("reason", "paragraph", t("Descrição"), t("Descreve o pedido com o máximo de contexto possível."), "reason", true, 1000),
        ];
    }

    if (preset === "general_support") {
        return [
            buildChoiceField("request_type", "select", t("Tipo de pedido"), t("Ajuda a equipa a perceber logo o objetivo do ticket."), buildOptions([t("Dúvida"), "Suporte", t("Sugestão"), t("Reclamação"), "Outro"])),
            buildTextField("reason", "paragraph", t("Descrição"), t("Explica o pedido com o máximo de contexto possível."), "reason", true, 1000),
            buildTextField("reference", "short", t("Referência adicional"), t("Nº de encomenda, link ou outra referência útil"), "none", false, 120),
        ];
    }

    return [
        buildTextField("reason", "paragraph", t("Descrição"), t("Descreve a situação com o máximo de detalhe possível."), "reason", true, 1000),
        buildChoiceField(
            "has_evidence",
            "radio",
            t("Tens algum vídeo ou link como prova?"),
            t("Se responderes sim, cola o link no campo abaixo."),
            [
                { label: t("Sim"), value: "yes" },
                { label: t("Não"), value: "no", default: true },
            ],
            "clip_toggle",
        ),
        buildTextField("evidence_url", "short", t("Link da prova"), "https://...", "clip_url", false, 500),
        // Prints e ficheiros vão direto no formulário (o Discord aceita uploads em modais).
        { id: "evidence_files", type: "file", label: t("Prints ou ficheiros"), description: t("Opcional — anexa até 5 ficheiros."), required: false, semantic: "none", max_files: FIELD_LIMITS.maxFilesDefault },
    ];
}

export function buildDefaultTicketForm(category: Pick<TicketCategoryConfig, "id" | "label">, preset: TicketFormPreset = inferPreset(category)): TicketCategoryFormConfig {
    return {
        category_id: category.id,
        preset,
        modal_title: buildDefaultModalTitle(category.label, preset),
        fields: buildPresetFields(preset),
    };
}

export function buildDefaultTicketForms(categories: TicketCategoryConfig[]): TicketCategoryFormConfig[] {
    return categories.map((category) => buildDefaultTicketForm(category));
}

function normalizeOptionLabels(rawOptions: unknown): string[] {
    if (!Array.isArray(rawOptions)) return [];

    return rawOptions
        .map((option) => {
            if (typeof option === "string") return option.trim();
            if (option && typeof option === "object" && typeof (option as { label?: unknown }).label === "string") {
                return (option as { label: string }).label.trim();
            }
            return "";
        })
        .filter(Boolean);
}

/** Validates/normalizes a single stored field (the stored form is authoritative). */
function normalizeStoredField(raw: unknown, used: Set<string>): TicketFormFieldConfig | null {
    if (!raw || typeof raw !== "object") return null;
    const stored = raw as Partial<TicketFormFieldConfig>;

    const label = typeof stored.label === "string" && stored.label.trim() ? stored.label.trim().slice(0, FIELD_LIMITS.label) : "";
    if (!label) return null;

    const type = typeof stored.type === "string" && FIELD_TYPE_VALUES.has(stored.type as TicketFormFieldType)
        ? (stored.type as TicketFormFieldType)
        : "short";
    const baseId = typeof stored.id === "string" && stored.id.trim() ? stored.id : label;
    const id = uniqueFieldId(baseId, used);
    const required = typeof stored.required === "boolean" ? stored.required : true;
    const semantic = compatibleSemantic(typeof stored.semantic === "string" ? (stored.semantic as TicketFormFieldSemantic) : "none", type);

    const field: TicketFormFieldConfig = { id, type, label, required, semantic };

    if (type === "short" || type === "paragraph") {
        field.placeholder = typeof stored.placeholder === "string" && stored.placeholder.trim() ? stored.placeholder.trim().slice(0, FIELD_LIMITS.placeholder) : null;
        field.max_length = clampMaxLength(stored.max_length, type);
        return field;
    }

    field.description = typeof stored.description === "string" && stored.description.trim() ? stored.description.trim().slice(0, FIELD_LIMITS.description) : null;
    if (type === "file") {
        field.max_files = clampMaxFiles(stored.max_files);
        return field;
    }
    const labels = normalizeOptionLabels(stored.options);
    if (semantic === "clip_toggle") {
        field.options = [
            { label: labels[0] || t("Sim"), value: "yes" },
            { label: labels[1] || t("Não"), value: "no", default: true },
        ];
    } else {
        field.options = buildOptions(labels.length >= 1 ? labels : [t("Opção 1")]);
    }
    return field;
}

function normalizeStoredForm(input: unknown, category: TicketCategoryConfig): TicketCategoryFormConfig {
    const raw = input && typeof input === "object" ? (input as Partial<TicketCategoryFormConfig>) : null;
    const preset = raw?.preset && raw.preset in TICKET_FORM_PRESET_LABELS ? raw.preset : inferPreset(category);
    const fallback = buildDefaultTicketForm(category, preset);

    const used = new Set<string>();
    const storedFields = Array.isArray(raw?.fields)
        ? raw.fields.map((entry) => normalizeStoredField(entry, used)).filter((entry): entry is TicketFormFieldConfig => Boolean(entry))
        : [];

    return {
        category_id: category.id,
        preset,
        modal_title: typeof raw?.modal_title === "string" && raw.modal_title.trim()
            ? raw.modal_title.trim().slice(0, FIELD_LIMITS.modalTitle)
            : fallback.modal_title.slice(0, FIELD_LIMITS.modalTitle),
        // Stored fields win when present; otherwise the preset's default fields are used.
        fields: storedFields.length > 0 ? storedFields.slice(0, MAX_FORM_FIELDS) : fallback.fields,
    };
}

export function getTicketForms(config?: FormsConfigInput): TicketCategoryFormConfig[] {
    const categoriesToUse = getTicketCategories(config);
    let storedForms: unknown = null;
    try {
        storedForms = config?.ticket_forms_json ? JSON.parse(config.ticket_forms_json) : null;
    } catch {
        storedForms = null;
    }
    const formsArray = Array.isArray(storedForms) ? storedForms : [];

    return categoriesToUse.map((category) => {
        const stored = formsArray.find((entry) => entry && typeof entry === "object" && (entry as TicketCategoryFormConfig).category_id === category.id);
        return normalizeStoredForm(stored, category);
    });
}

export function serializeTicketForms(forms: TicketCategoryFormConfig[]): string {
    return JSON.stringify(
        forms.map((form) => ({
            category_id: form.category_id,
            preset: form.preset,
            modal_title: form.modal_title.trim(),
            fields: form.fields.map((field) => ({
                id: field.id,
                type: field.type,
                label: field.label.trim(),
                description: field.description?.trim() || null,
                placeholder: field.placeholder?.trim() || null,
                required: field.required,
                semantic: field.semantic,
                options: field.options?.map((option) => ({ label: option.label.trim(), value: option.value, default: option.default ?? false })) ?? null,
                max_length: field.max_length ?? null,
                max_files: field.max_files ?? null,
            })),
        })),
    );
}

export function getTicketForm(config: FormsConfigInput, categoryId: TicketCategory): TicketCategoryFormConfig | null {
    return getTicketForms(config).find((form) => form.category_id === categoryId) ?? null;
}

export function getTicketFormField(form: TicketCategoryFormConfig | null | undefined, fieldId: string): TicketFormFieldConfig | null {
    if (!form) return null;
    return form.fields.find((field) => field.id === fieldId) ?? null;
}

export function setTicketFormPreset(forms: TicketCategoryFormConfig[], categories: TicketCategoryConfig[], categoryId: TicketCategory, preset: TicketFormPreset): TicketCategoryFormConfig[] {
    return forms.map((form) => {
        if (form.category_id !== categoryId) return form;
        const category = categories.find((entry) => entry.id === categoryId);
        if (!category) return form;
        return buildDefaultTicketForm(category, preset);
    });
}

export function resetTicketForm(forms: TicketCategoryFormConfig[], categories: TicketCategoryConfig[], categoryId: TicketCategory): TicketCategoryFormConfig[] {
    return forms.map((form) => {
        if (form.category_id !== categoryId) return form;
        const category = categories.find((entry) => entry.id === categoryId);
        if (!category) return form;
        return buildDefaultTicketForm(category);
    });
}

export function setTicketFormTitle(forms: TicketCategoryFormConfig[], categoryId: TicketCategory, modalTitle: string): TicketCategoryFormConfig[] {
    return forms.map((form) => (form.category_id === categoryId ? { ...form, modal_title: modalTitle.trim() } : form));
}

/** Appends a new field built from editor input (capped at MAX_FORM_FIELDS). */
export function addTicketFormField(forms: TicketCategoryFormConfig[], categoryId: TicketCategory, input: FormFieldInput): TicketCategoryFormConfig[] {
    return forms.map((form) => {
        if (form.category_id !== categoryId) return form;
        if (form.fields.length >= MAX_FORM_FIELDS) {
            throw new ValidationError(t("Um formulário pode ter no máximo {max} campos.", { max: MAX_FORM_FIELDS }));
        }
        const used = new Set(form.fields.map((field) => field.id));
        return { ...form, fields: [...form.fields, buildFormField(input, used)] };
    });
}

/** Rebuilds an existing field from editor input (id and compatible semantic preserved). */
export function updateTicketFormField(forms: TicketCategoryFormConfig[], categoryId: TicketCategory, fieldId: string, input: FormFieldInput): TicketCategoryFormConfig[] {
    return forms.map((form) => {
        if (form.category_id !== categoryId) return form;
        const used = new Set(form.fields.filter((field) => field.id !== fieldId).map((field) => field.id));
        return {
            ...form,
            fields: form.fields.map((field) => (field.id === fieldId ? buildFormField(input, used, field) : field)),
        };
    });
}

/** Removes a field (a form must keep at least MIN_FORM_FIELDS). */
export function removeTicketFormField(forms: TicketCategoryFormConfig[], categoryId: TicketCategory, fieldId: string): TicketCategoryFormConfig[] {
    return forms.map((form) => {
        if (form.category_id !== categoryId) return form;
        if (form.fields.length <= MIN_FORM_FIELDS) {
            throw new ValidationError(t("O formulário tem de ter pelo menos 1 campo."));
        }
        return { ...form, fields: form.fields.filter((field) => field.id !== fieldId) };
    });
}

/** Moves a field up or down in the form order. */
export function moveTicketFormField(forms: TicketCategoryFormConfig[], categoryId: TicketCategory, fieldId: string, direction: "up" | "down"): TicketCategoryFormConfig[] {
    return forms.map((form) => {
        if (form.category_id !== categoryId) return form;
        const index = form.fields.findIndex((field) => field.id === fieldId);
        const target = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= form.fields.length) return form;
        const fields = [...form.fields];
        [fields[index], fields[target]] = [fields[target], fields[index]];
        return { ...form, fields };
    });
}

export function serializeTicketFormResponses(entries: TicketFormResponseEntry[]): string {
    return JSON.stringify(entries);
}

export function parseTicketFormResponses(ticket: Pick<TicketRecord, "form_responses_json"> | { form_responses_json?: string | null }): TicketFormResponseEntry[] {
    if (!ticket.form_responses_json) return [];

    try {
        const parsed = JSON.parse(ticket.form_responses_json);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const fieldId = typeof (entry as { field_id?: unknown }).field_id === "string" ? (entry as { field_id: string }).field_id : null;
                const label = typeof (entry as { label?: unknown }).label === "string" ? (entry as { label: string }).label : null;
                const value = typeof (entry as { value?: unknown }).value === "string" ? (entry as { value: string }).value : null;
                const displayValue = typeof (entry as { display_value?: unknown }).display_value === "string" ? (entry as { display_value: string }).display_value : value;
                const semantic = typeof (entry as { semantic?: unknown }).semantic === "string" ? (entry as { semantic: TicketFormFieldSemantic }).semantic : "none";
                if (!fieldId || !label || !value) return null;

                return { field_id: fieldId, label, value, display_value: displayValue ?? value, semantic } satisfies TicketFormResponseEntry;
            })
            .filter((entry): entry is TicketFormResponseEntry => Boolean(entry));
    } catch {
        return [];
    }
}

/** Visible (non-semantic) form answers as CV2 container fields. */
export function buildTicketResponseFields(entries: TicketFormResponseEntry[]): ContainerField[] {
    return entries
        .filter((entry) => entry.semantic === "none")
        .map((entry) => ({ name: entry.label, value: entry.display_value.slice(0, 1024) || "-" }))
        .slice(0, 10);
}

/**
 * Campos "semânticos" (motivo/clip) em correlação com o formulário da categoria:
 * - O motivo só aparece se o formulário TIVER um campo de motivo — e com o label
 *   configurado nesse campo (ex.: "Descrição"), não um "Motivo" fixo. Sem campo
 *   de motivo, o `ticket.reason` é só uma cópia da primeira resposta (ver
 *   parseTicketSubmission) e mostrá-lo duplicava informação.
 * - O clip só aparece se o formulário pedir prova (clip_toggle/clip_url) — mas um
 *   clip realmente enviado nunca se esconde (tickets antigos/formulário alterado).
 * - Tickets de antes dos formulários (sem respostas guardadas) mantêm o "Motivo"
 *   clássico para não perder informação.
 */
export function buildTicketSemanticFields(
    form: TicketCategoryFormConfig | null,
    data: { reason: string; clipUrl: string | null; hasResponses: boolean },
): ContainerField[] {
    const fields: ContainerField[] = [];
    const reasonField = form?.fields.find((field) => field.semantic === "reason") ?? null;
    const asksForClip = Boolean(form?.fields.some((field) => field.semantic === "clip_url" || field.semantic === "clip_toggle"));
    const clipUrl = data.clipUrl?.trim() ?? "";

    if (reasonField) {
        fields.push({ name: reasonField.label, value: data.reason.slice(0, 1024) || "-" });
    } else if (!data.hasResponses && data.reason.trim()) {
        fields.push({ name: t("Motivo"), value: data.reason.slice(0, 1024) });
    }

    if (clipUrl) fields.push({ name: t("Clip"), value: clipUrl });
    else if (asksForClip) fields.push({ name: t("Clip"), value: t("Não enviado.") });

    return fields;
}
