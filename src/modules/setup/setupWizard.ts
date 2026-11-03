import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { ensureGuildConfig, upsertGuildConfig } from "../../repositories/guildConfigRepository.js";
import { COLORS, getEmbedColor, getFooterText, hexToNumber, normalizeTranscriptPrefix } from "../../lib/branding.js";
import { buildContainer, row, type ContainerField, type Row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { emoji, ei, listAppEmojis } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { TICKET_NAME_FORMATS, type GuildConfig, type TicketCategoryConfig, type TicketNameFormat } from "../../types.js";
import {
    getFirstTicketCategoryId,
    getTicketCategories,
    serializeTicketCategories,
} from "../tickets/categories.js";
import { buildTicketChannelName, normalizeTicketNameFormat, TICKET_NAME_FORMAT_LABELS } from "../tickets/ticketNaming.js";
import { formatSupportWindow, formatSupportWindowNote, parseSupportHours, supportHoursModalFields } from "../tickets/officeHours.js";
import { getTicketMacros } from "../tickets/macros.js";
import { getTicketPanels, resolvePanelCategories } from "../tickets/panels.js";
import {
    getTicketForm,
    getTicketFormField,
    getTicketForms,
    serializeTicketForms,
    MAX_FORM_FIELDS,
    TICKET_FIELD_TYPE_LABELS,
    TICKET_FORM_PRESET_LABELS,
} from "../tickets/forms.js";
import type { TicketFormFieldType } from "../../types.js";
import {
    DEFAULT_TICKET_BUTTON_EMOJI,
    DEFAULT_TICKET_BUTTON_LABEL,
    DEFAULT_TICKET_PANEL_DESCRIPTION,
    DEFAULT_TICKET_PANEL_TITLE,
    buildTicketPanelContainer,
    getTicketButtonEmoji,
    getTicketButtonLabel,
} from "../tickets/ticketPanel.js";
import { t, textOrDefault, tk } from "../../lib/i18n.js";

// `setup` = guided first-time wizard (draft → finalize). `config` = live management
// hub (every change persists immediately, jump to any section).
export type PanelMode = "setup" | "config";

export type SetupPage =
    | "general"
    | "access"
    | "ticket_categories"
    | "ticket_forms"
    | "ticket_channels"
    | "ticket_panel"
    | "panels"
    | "support"
    | "transcripts"
    | "review"
    | "summary"
    | "preview";

export type PreviewKind = "branding" | "ticket_panel" | "sla";

export type SetupTextField =
    | "server_name"
    | "transcript_prefix"
    | "ticket_panel_title"
    | "ticket_panel_description"
    | "ticket_button_label"
    | "ticket_button_emoji"
    | "branding_color"
    | "branding_logo"
    | "sla_first_response_minutes"
    | "sla_resolution_hours"
    | "ticket_auto_close_hours"
    | "ticket_max_open"
    | "ticket_cooldown_seconds";

export type SetupRoleField = "staff_role" | "admin_role" | "client_role";
export type SetupChannelField = "log_channel" | "ticket_channel" | "feedback_channel";

export interface SetupDraft extends Partial<GuildConfig> {
    guild_id: string;
    mode: PanelMode;
    page: SetupPage;
    preview: PreviewKind;
    selected_category_id: string | null;
    selected_form_field_id: string | null;
    selected_macro_id?: string | null;
    selected_panel_id?: string | null;
    emoji_page?: number;
}

const EMOJIS_PER_PICKER_PAGE = 24;

const setupState = new Map<string, SetupDraft>();

// Linear order for the guided setup; config jumps freely between the same sections
// (minus summary/preview, which only matter for the finalize step).
// Coherent flow: identity → access → structure (categories/forms/rooms) → public panels
// → service policy → transcripts → final review/publish.
const SETUP_PAGE_ORDER: SetupPage[] = [
    "general", "access", "ticket_categories", "ticket_forms", "ticket_channels",
    "ticket_panel", "panels", "support", "transcripts", "summary", "preview",
];
export const CONFIG_PAGE_ORDER: SetupPage[] = [
    "general", "access", "ticket_categories", "ticket_forms", "ticket_channels",
    "ticket_panel", "panels", "support", "transcripts", "review",
];

export const PAGE_LABELS: Record<SetupPage, string> = {
    general: tk("Identidade"),
    access: tk("Permissões"),
    ticket_categories: tk("Categorias"),
    ticket_forms: tk("Formulários"),
    ticket_channels: tk("Salas dos tickets"),
    ticket_panel: tk("Painel de tickets"),
    panels: tk("Painéis"),
    support: tk("Atendimento"),
    transcripts: tk("Transcripts"),
    review: tk("Rever e publicar"),
    summary: tk("Resumo"),
    preview: tk("Preview"),
};

export const PAGE_DESCRIPTIONS: Record<SetupPage, string> = {
    general: tk("Identidade do bot neste servidor: nome no rodapé, cor e imagem de branding."),
    access: tk("Define os cargos de acesso e o canal onde os logs operacionais são publicados."),
    ticket_categories: tk("Define as categorias reais do sistema. Mínimo 1, máximo 8. Escolhe uma para editar boas-vindas, cargos de ping e emoji."),
    ticket_forms: tk("Constrói o formulário de cada categoria — adiciona, edita, reordena ou remove campos (máx. 5)."),
    ticket_channels: tk("Escolhe o canal do painel e a categoria Discord onde cada tipo de ticket é aberto — individualmente ou de uma vez para todas."),
    ticket_panel: tk("Personaliza o texto e o botão do painel público de abertura de tickets."),
    panels: tk("Cria vários painéis de tickets independentes, cada um com as suas categorias e branding do botão."),
    support: tk("Política de atendimento: horário, avaliação, fecho automático, limites, SLA e respostas rápidas."),
    transcripts: tk("Cada ticket fechado gera um transcript em HTML no canal de logs. Aqui defines a sigla dos IDs."),
    review: tk("Revê o essencial, pré-visualiza o resultado e republica os painéis para aplicar as alterações."),
    summary: tk("Revê a configuração antes de finalizar."),
    preview: tk("Pré-visualiza o resultado final e finaliza."),
};

export const TEXT_LABELS: Record<SetupTextField, string> = {
    server_name: tk("Nome do servidor"),
    transcript_prefix: tk("Sigla dos transcripts"),
    ticket_panel_title: tk("Título do painel"),
    ticket_panel_description: tk("Texto principal do painel"),
    ticket_button_label: tk("Texto do botão"),
    ticket_button_emoji: tk("Emoji do botão"),
    branding_color: tk("Cor de branding"),
    branding_logo: tk("Imagem do servidor"),
    sla_first_response_minutes: tk("SLA primeira resposta (min)"),
    sla_resolution_hours: tk("SLA resolução (horas)"),
    ticket_auto_close_hours: tk("Fecho automático (horas, 0 = desligado)"),
    ticket_max_open: tk("Máx. tickets abertos por utilizador"),
    ticket_cooldown_seconds: tk("Cooldown entre aberturas (segundos)"),
};

export const ROLE_LABELS: Record<SetupRoleField, string> = {
    staff_role: tk("Cargo de staff"),
    admin_role: tk("Cargo de super-admin"),
    client_role: tk("Cargo de cliente"),
};

export const CHANNEL_LABELS: Record<SetupChannelField, string> = {
    log_channel: tk("Canal de logs"),
    ticket_channel: tk("Canal do painel de tickets"),
    feedback_channel: tk("Canal de avaliações"),
};

function pageOrder(mode: PanelMode): SetupPage[] {
    return mode === "config" ? CONFIG_PAGE_ORDER : SETUP_PAGE_ORDER;
}

// All panel customIds carry the mode as the 2nd segment so /setup and /config can be
// open at the same time without their buttons colliding.
function cid(mode: PanelMode, ...parts: Array<string | number>): string {
    return buildCustomId("setup", mode, ...parts);
}

function draftKey(mode: PanelMode, guildId: string, userId: string) {
    return `${mode}:${guildId}:${userId}`;
}

function normalizeDraft(draft: SetupDraft): SetupDraft {
    const categories = getTicketCategories(draft);
    const forms = getTicketForms(draft);
    const selectedCategoryId = categories.some((entry) => entry.id === draft.selected_category_id)
        ? draft.selected_category_id
        : categories[0]?.id ?? null;
    const activeForm = selectedCategoryId ? forms.find((entry) => entry.category_id === selectedCategoryId) ?? null : null;
    const selectedFormFieldId = activeForm?.fields.some((field) => field.id === draft.selected_form_field_id)
        ? draft.selected_form_field_id
        : activeForm?.fields[0]?.id ?? null;

    return {
        ...draft,
        // Guards against stale pages (e.g. a section that no longer exists after an update).
        page: pageOrder(draft.mode).includes(draft.page) ? draft.page : pageOrder(draft.mode)[0],
        ticket_categories_json: serializeTicketCategories(categories),
        ticket_forms_json: serializeTicketForms(forms),
        selected_category_id: selectedCategoryId,
        selected_form_field_id: selectedFormFieldId,
    };
}

export async function getDraft(mode: PanelMode, guildId: string, userId: string): Promise<SetupDraft> {
    const key = draftKey(mode, guildId, userId);
    const existing = setupState.get(key);
    if (existing) return existing;

    const config = await ensureGuildConfig(guildId);
    const firstCategoryId = getFirstTicketCategoryId(config);
    const draft = normalizeDraft({
        ...config,
        guild_id: guildId,
        mode,
        page: "general",
        preview: "branding",
        selected_category_id: firstCategoryId,
        selected_form_field_id: getTicketForm(config, firstCategoryId ?? "")?.fields[0]?.id ?? null,
    });

    setupState.set(key, draft);
    return draft;
}

export function saveDraft(current: SetupDraft, patch: Partial<SetupDraft>, userId: string): SetupDraft {
    const updated = normalizeDraft({ ...current, ...patch });
    setupState.set(draftKey(updated.mode, updated.guild_id, userId), updated);
    return updated;
}

export function clearDraft(mode: PanelMode, guildId: string, userId: string): void {
    setupState.delete(draftKey(mode, guildId, userId));
}

/** Persist the draft's config columns to the database (used in live `config` mode). */
export async function persistDraftConfig(draft: SetupDraft): Promise<GuildConfig> {
    return upsertGuildConfig(draft as Partial<GuildConfig> & { guild_id: string });
}

function getDraftCategories(draft: SetupDraft): TicketCategoryConfig[] {
    return getTicketCategories(draft);
}

function getActiveDraftCategory(draft: SetupDraft) {
    const categories = getDraftCategories(draft);
    return categories.find((entry) => entry.id === draft.selected_category_id) ?? categories[0] ?? null;
}

function getActiveDraftForm(draft: SetupDraft) {
    const activeCategory = getActiveDraftCategory(draft);
    return activeCategory ? getTicketForm(draft, activeCategory.id) : null;
}

function getActiveDraftFormField(draft: SetupDraft) {
    return getTicketFormField(getActiveDraftForm(draft), draft.selected_form_field_id ?? "");
}

function displayChannel(value?: string | null) {
    return value ? `<#${value}>` : t("*Não definido*");
}

function displayRole(value?: string | null) {
    return value ? `<@&${value}>` : t("*Não definido*");
}

function displayText(value: unknown) {
    if (value === null || value === undefined || value === "") return t("*Não definido*");
    return `**${String(value)}**`;
}

/** Exemplo do nome do canal com a primeira categoria do servidor (ex.: "suporte-0042-nome"). */
function ticketNameExample(draft: SetupDraft, format: TicketNameFormat): string {
    const first = getDraftCategories(draft)[0];
    return buildTicketChannelName({ format, category: first?.label ?? t("Suporte"), categoryId: first?.id, number: 42, username: t("nome") });
}

function buttonStyleLabel(style?: GuildConfig["ticket_button_style"] | null) {
    const labels: Record<GuildConfig["ticket_button_style"], string> = { primary: "Azul", secondary: "Cinzento", success: "Verde", danger: "Vermelho" };
    return labels[(style ?? "primary") as GuildConfig["ticket_button_style"]];
}

// ─── Navigation ──────────────────────────────────────────────────────────────
// Both modes get prev/next arrows (`config` additionally gets a section-jump select and
// a refresh button, mirroring the PixelFx management hub).
function buildNavRows(draft: SetupDraft): Row[] {
    const order = pageOrder(draft.mode);
    const pageIndex = order.indexOf(draft.page);
    const previousPage = order[Math.max(0, pageIndex - 1)];
    const nextPage = order[Math.min(order.length - 1, pageIndex + 1)];

    const arrows = row(
        new ButtonBuilder().setCustomId(cid(draft.mode, "nav", previousPage)).setEmoji(emoji.arrowLeft).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex <= 0),
        new ButtonBuilder().setCustomId(cid(draft.mode, "nav", "current")).setLabel(`${pageIndex + 1}/${order.length} • ${t(PAGE_LABELS[draft.page])}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(cid(draft.mode, "nav", nextPage)).setEmoji(emoji.arrowRight).setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === order.length - 1),
        ...(draft.mode === "config"
            ? [new ButtonBuilder().setCustomId(cid(draft.mode, "refresh")).setLabel(t("Atualizar")).setStyle(ButtonStyle.Secondary)]
            : []),
    );

    if (draft.mode !== "config") return [arrows];

    const jump = row(new StringSelectMenuBuilder()
        .setCustomId(cid(draft.mode, "navjump"))
        .setPlaceholder(t("Ir para a secção…"))
        .addOptions(CONFIG_PAGE_ORDER.map((page) => ({ label: t(PAGE_LABELS[page]), value: page, default: page === draft.page }))));
    return [jump, arrows];
}

function editButtons(draft: SetupDraft, ...fields: SetupTextField[]): Row {
    return row(...fields.map((field) => new ButtonBuilder().setCustomId(cid(draft.mode, "modal", field)).setLabel(t(TEXT_LABELS[field])).setStyle(ButtonStyle.Primary)));
}

function roleSelect(draft: SetupDraft, field: SetupRoleField, optional = false): Row {
    return row(new RoleSelectMenuBuilder()
        .setCustomId(cid(draft.mode, "role", field))
        .setPlaceholder(`${t("Seleciona {item}", { item: t(ROLE_LABELS[field]) })}${optional ? t(" (opcional)") : ""}`)
        .setMinValues(optional ? 0 : 1)
        .setMaxValues(1));
}

// Nota: já não é preciso recolher a lista de canais para os seletores — o ChannelSelectMenu
// nativo do Discord trata disso (e, ao contrário do menu de opções, não está limitado a 25).

/**
 * Seletor de canal do assistente — sempre o ChannelSelectMenu NATIVO.
 *
 * Antes alternava entre um menu de opções (até 25 canais) e o nativo (acima disso). Além de
 * serem dois widgets diferentes para a mesma coisa, o caminho nativo perdia a indicação do
 * canal já escolhido. O nativo mostra todos os canais, traz pesquisa e aceita um default.
 */
function channelSelect(field: SetupChannelField, draft: SetupDraft): Row {
    const select = new ChannelSelectMenuBuilder()
        .setCustomId(cid(draft.mode, "channel", field))
        .setPlaceholder(t("Seleciona {item}", { item: t(CHANNEL_LABELS[field]) }))
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1);
    const current = draft[field];
    if (current) select.setDefaultChannels(current);
    return row(select);
}

function categorySelector(draft: SetupDraft): Row | null {
    const categories = getDraftCategories(draft);
    if (categories.length <= 1) return null;
    return row(new StringSelectMenuBuilder()
        .setCustomId(cid(draft.mode, "catselect"))
        .setPlaceholder(t("Seleciona a categoria a configurar"))
        .addOptions(categories.map((category) => ({ label: category.label, value: category.id, default: draft.selected_category_id === category.id }))));
}

function buildEmojiPickerRows(draft: SetupDraft): Row[] {
    const all = listAppEmojis();
    if (all.length === 0) {
        return [editButtons(draft, "ticket_button_emoji")];
    }
    const maxPage = Math.max(1, Math.ceil(all.length / EMOJIS_PER_PICKER_PAGE));
    const page = Math.min(Math.max(1, draft.emoji_page ?? 1), maxPage);
    const slice = all.slice((page - 1) * EMOJIS_PER_PICKER_PAGE, page * EMOJIS_PER_PICKER_PAGE);
    const current = draft.ticket_button_emoji?.trim() ?? "";

    const select = new StringSelectMenuBuilder()
        .setCustomId(cid(draft.mode, "emojipick"))
        .setPlaceholder(t("Emoji do botão — página {page}/{pages}", { page, pages: maxPage }))
        .addOptions(
            { label: t("Sem emoji (usar o do bot)"), value: "__none__", default: current === "" },
            ...slice.map((entry) => ({ label: entry.name.slice(0, 100), value: entry.name, emoji: ei(entry.name), default: current.includes(`:${entry.name}:`) })),
        );

    return [
        row(select),
        row(
            new ButtonBuilder().setCustomId(cid(draft.mode, "emojipage", Math.max(1, page - 1))).setEmoji(emoji.arrowLeft).setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
            new ButtonBuilder().setCustomId(cid(draft.mode, "emojipage", "current")).setLabel(t("Emojis {page}/{total}", { page, total: maxPage })).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(cid(draft.mode, "emojipage", Math.min(maxPage, page + 1))).setEmoji(emoji.arrowRight).setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage),
        ),
    ];
}

function getActiveMacro(draft: SetupDraft) {
    const macros = getTicketMacros(draft);
    return macros.find((macro) => macro.id === draft.selected_macro_id) ?? macros[0] ?? null;
}

function getActivePanel(draft: SetupDraft) {
    const panels = getTicketPanels(draft);
    return panels.find((panel) => panel.id === draft.selected_panel_id) ?? panels[0] ?? null;
}

function buildSupportRows(draft: SetupDraft): Row[] {
    const hours = parseSupportHours({ support_hours_json: draft.support_hours_json ?? null });
    const macros = getTicketMacros(draft);
    const activeMacro = getActiveMacro(draft);
    const ratingOn = draft.ticket_rating_enabled !== false;

    const rows: Row[] = [
        roleSelect(draft, "client_role", true),
        channelSelect("feedback_channel", draft),
        row(
            new ButtonBuilder().setCustomId(cid(draft.mode, "ratingtoggle")).setLabel(ratingOn ? t("Desativar avaliação") : t("Ativar avaliação")).setEmoji(ratingOn ? emoji.error : emoji.success).setStyle(ratingOn ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId(cid(draft.mode, "supporthours")).setLabel(t("Definir horário")).setEmoji(emoji.clock).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(cid(draft.mode, "supportoff")).setLabel(t("Remover horário")).setStyle(ButtonStyle.Secondary).setDisabled(!hours),
        ),
        editButtons(draft, "ticket_auto_close_hours", "ticket_max_open"),
        editButtons(draft, "ticket_cooldown_seconds"),
        editButtons(draft, "sla_first_response_minutes", "sla_resolution_hours"),
    ];

    if (macros.length > 0) {
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId(cid(draft.mode, "macroselect"))
            .setPlaceholder(t("Seleciona a resposta rápida a editar"))
            .addOptions(macros.slice(0, 25).map((macro) => ({ label: macro.name.slice(0, 100), value: macro.id, default: activeMacro?.id === macro.id })))));
    }
    rows.push(row(
        new ButtonBuilder().setCustomId(cid(draft.mode, "macronew")).setLabel(t("Nova resposta rápida")).setEmoji(emoji.add).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(cid(draft.mode, "macroedit")).setLabel(t("Editar")).setStyle(ButtonStyle.Primary).setDisabled(!activeMacro),
        new ButtonBuilder().setCustomId(cid(draft.mode, "macroremove")).setLabel(t("Remover")).setStyle(ButtonStyle.Danger).setDisabled(!activeMacro),
    ));
    return rows;
}

function buildPanelsRows(draft: SetupDraft): Row[] {
    const panels = getTicketPanels(draft);
    const active = getActivePanel(draft);
    const rows: Row[] = [];

    if (panels.length > 0) {
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId(cid(draft.mode, "panelselect"))
            .setPlaceholder(t("Seleciona o painel a configurar"))
            .addOptions(panels.slice(0, 25).map((panel) => ({ label: panel.name.slice(0, 100), value: panel.id, default: active?.id === panel.id })))));
    }
    rows.push(row(
        new ButtonBuilder().setCustomId(cid(draft.mode, "panelnew")).setLabel(t("Novo painel")).setEmoji(emoji.add).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(cid(draft.mode, "panelrename")).setLabel(t("Renomear")).setStyle(ButtonStyle.Primary).setDisabled(!active),
        new ButtonBuilder().setCustomId(cid(draft.mode, "paneldelete")).setLabel(t("Apagar")).setStyle(ButtonStyle.Danger).setDisabled(!active),
    ));

    if (active) {
        const categories = getDraftCategories(draft);
        const set = new Set(active.category_ids);
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId(cid(draft.mode, "panelcats"))
            .setPlaceholder(t("Categorias deste painel (vazio = todas)"))
            .setMinValues(0).setMaxValues(Math.max(1, Math.min(25, categories.length)))
            .addOptions(categories.slice(0, 25).map((category) => ({ label: category.label.slice(0, 100), value: category.id, default: set.has(category.id) })))));
        rows.push(row(
            new ButtonBuilder().setCustomId(cid(draft.mode, "panelmodal", "title")).setLabel(t("Título")).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(cid(draft.mode, "panelmodal", "description")).setLabel(t("Descrição")).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(cid(draft.mode, "panelmodal", "button_label")).setLabel(t("Texto do botão")).setStyle(ButtonStyle.Secondary),
        ));
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId(cid(draft.mode, "panelstyle"))
            .setPlaceholder(t("Cor do botão do painel"))
            .addOptions(
                { label: t("Azul"), value: "primary", default: active.button_style === "primary" },
                { label: t("Cinzento"), value: "secondary", default: active.button_style === "secondary" },
                { label: t("Verde"), value: "success", default: active.button_style === "success" },
                { label: t("Vermelho"), value: "danger", default: active.button_style === "danger" },
            )));
    }
    return rows;
}

function buildPageRows(draft: SetupDraft): Row[] {
    const rows: Row[] = [...buildNavRows(draft)];

    switch (draft.page) {
        case "general":
            rows.push(editButtons(draft, "server_name"));
            rows.push(editButtons(draft, "branding_color", "branding_logo"));
            break;
        case "access":
            rows.push(roleSelect(draft, "staff_role"), roleSelect(draft, "admin_role"), channelSelect("log_channel", draft));
            break;
        case "ticket_categories": {
            rows.push(row(new ButtonBuilder().setCustomId(cid(draft.mode, "cats", "edit")).setLabel(t("Editar categorias dos tickets")).setStyle(ButtonStyle.Primary)));
            const catSelector = categorySelector(draft);
            if (catSelector) rows.push(catSelector);
            if (getActiveDraftCategory(draft)) {
                rows.push(row(
                    new ButtonBuilder().setCustomId(cid(draft.mode, "welcomeedit")).setLabel(t("Mensagem de boas-vindas")).setEmoji(emoji.note).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(cid(draft.mode, "catemoji")).setLabel(t("Emoji da categoria")).setStyle(ButtonStyle.Secondary),
                ));
                rows.push(row(new RoleSelectMenuBuilder()
                    .setCustomId(cid(draft.mode, "catping"))
                    .setPlaceholder(t("Cargos a mencionar ao abrir esta categoria (opcional)"))
                    .setMinValues(0).setMaxValues(10)));
            }
            break;
        }
        case "ticket_forms": {
            const selector = categorySelector(draft);
            if (selector) rows.push(selector);
            const activeForm = getActiveDraftForm(draft);
            if (activeForm) {
                rows.push(row(new StringSelectMenuBuilder()
                    .setCustomId(cid(draft.mode, "form", "preset"))
                    .setPlaceholder(t("Carregar um modelo de formulário"))
                    .addOptions(Object.entries(TICKET_FORM_PRESET_LABELS).map(([value, label]) => ({ label: t(label), value, default: activeForm.preset === value })))));
                rows.push(row(new StringSelectMenuBuilder()
                    .setCustomId(cid(draft.mode, "form", "field"))
                    .setPlaceholder(t("Seleciona o campo a editar"))
                    .addOptions(activeForm.fields.map((field, index) => ({
                        label: `${index + 1}. ${field.label}`.slice(0, 100),
                        value: field.id,
                        description: `${t(TICKET_FIELD_TYPE_LABELS[field.type])}${field.required ? "" : t(" · opcional")}`.slice(0, 100),
                        default: draft.selected_form_field_id === field.id,
                    })))));

                const hasField = Boolean(getActiveDraftFormField(draft));
                const fieldIndex = activeForm.fields.findIndex((field) => field.id === draft.selected_form_field_id);
                rows.push(row(
                    new ButtonBuilder().setCustomId(cid(draft.mode, "form", "fieldnew")).setLabel(t("Adicionar campo")).setEmoji(emoji.add).setStyle(ButtonStyle.Success).setDisabled(activeForm.fields.length >= MAX_FORM_FIELDS),
                    new ButtonBuilder().setCustomId(cid(draft.mode, "form", "fieldedit")).setLabel(t("Editar campo")).setStyle(ButtonStyle.Primary).setDisabled(!hasField),
                    new ButtonBuilder().setCustomId(cid(draft.mode, "form", "fieldremove")).setLabel(t("Remover campo")).setStyle(ButtonStyle.Danger).setDisabled(!hasField || activeForm.fields.length <= 1),
                ));
                rows.push(row(
                    new ButtonBuilder().setCustomId(cid(draft.mode, "form", "fieldmove", "up")).setLabel(t("Subir")).setStyle(ButtonStyle.Secondary).setDisabled(!hasField || fieldIndex <= 0),
                    new ButtonBuilder().setCustomId(cid(draft.mode, "form", "fieldmove", "down")).setLabel(t("Descer")).setStyle(ButtonStyle.Secondary).setDisabled(!hasField || fieldIndex < 0 || fieldIndex >= activeForm.fields.length - 1),
                    new ButtonBuilder().setCustomId(cid(draft.mode, "form", "title")).setLabel(t("Título do modal")).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(cid(draft.mode, "form", "reset")).setLabel(t("Repor modelo")).setStyle(ButtonStyle.Secondary),
                ));
            }
            break;
        }
        case "ticket_channels": {
            rows.push(channelSelect("ticket_channel", draft));
            rows.push(row(new StringSelectMenuBuilder()
                .setCustomId(cid(draft.mode, "nameformat"))
                .setPlaceholder(t("Nome dos canais dos tickets"))
                .addOptions(TICKET_NAME_FORMATS.map((format) => ({
                    label: t(TICKET_NAME_FORMAT_LABELS[format]),
                    description: `#${ticketNameExample(draft, format)}`,
                    value: format,
                    default: normalizeTicketNameFormat(draft.ticket_name_format) === format,
                })))));
            // One-shot: apply a single Discord category to EVERY ticket category (common
            // setup where all tickets open under the same category).
            rows.push(row(new ChannelSelectMenuBuilder()
                .setCustomId(cid(draft.mode, "catchannel", "all"))
                .setPlaceholder(t("Aplicar UMA categoria Discord a TODAS"))
                .addChannelTypes(ChannelType.GuildCategory).setMinValues(1).setMaxValues(1)));
            const selector = categorySelector(draft);
            if (selector) rows.push(selector);
            const activeCategory = getActiveDraftCategory(draft);
            if (activeCategory) {
                rows.push(row(new ChannelSelectMenuBuilder()
                    .setCustomId(cid(draft.mode, "catchannel"))
                    .setPlaceholder(t("Categoria Discord só para {category}", { category: activeCategory.label }))
                    .addChannelTypes(ChannelType.GuildCategory).setMinValues(1).setMaxValues(1)));
                rows.push(row(new ButtonBuilder().setCustomId(cid(draft.mode, "catchannel", "clear")).setLabel(t("Limpar categoria de {category}", { category: activeCategory.label })).setStyle(ButtonStyle.Secondary)));
            }
            break;
        }
        case "transcripts": {
            rows.push(editButtons(draft, "transcript_prefix"));
            break;
        }
        case "ticket_panel":
            rows.push(editButtons(draft, "ticket_panel_title", "ticket_panel_description"));
            rows.push(row(new StringSelectMenuBuilder()
                .setCustomId(cid(draft.mode, "buttonstyle"))
                .setPlaceholder(t("Seleciona a cor do botão"))
                .addOptions(
                    { label: t("Azul"), value: "primary", default: draft.ticket_button_style === "primary" },
                    { label: t("Cinzento"), value: "secondary", default: draft.ticket_button_style === "secondary" },
                    { label: t("Verde"), value: "success", default: draft.ticket_button_style === "success" },
                    { label: t("Vermelho"), value: "danger", default: draft.ticket_button_style === "danger" },
                )));
            rows.push(editButtons(draft, "ticket_button_label"));
            rows.push(...buildEmojiPickerRows(draft));
            break;
        case "support":
            rows.push(...buildSupportRows(draft));
            break;
        case "panels":
            rows.push(...buildPanelsRows(draft));
            break;
        case "review": {
            rows.push(row(new StringSelectMenuBuilder()
                .setCustomId(cid(draft.mode, "preview"))
                .setPlaceholder(t("Escolhe o que pré-visualizar…"))
                .addOptions(
                    { label: t("Preview de branding"), value: "branding", default: draft.preview === "branding" },
                    { label: t("Preview do painel de tickets"), value: "ticket_panel", default: draft.preview === "ticket_panel" },
                    { label: t("Preview de SLA"), value: "sla", default: draft.preview === "sla" },
                )));
            const hasPublishTarget = Boolean(draft.ticket_channel) || getTicketPanels(draft).some((panel) => panel.channel_id);
            rows.push(row(new ButtonBuilder()
                .setCustomId(cid(draft.mode, "republish"))
                .setLabel(t("Republicar painéis"))
                .setEmoji(emoji.open)
                .setStyle(ButtonStyle.Success)
                .setDisabled(!hasPublishTarget)));
            break;
        }
        case "preview":
            rows.push(row(new StringSelectMenuBuilder()
                .setCustomId(cid(draft.mode, "preview"))
                .setPlaceholder(t("Seleciona o preview a ver"))
                .addOptions(
                    { label: t("Preview de branding"), value: "branding", default: draft.preview === "branding" },
                    { label: t("Preview do painel de tickets"), value: "ticket_panel", default: draft.preview === "ticket_panel" },
                    { label: t("Preview de SLA"), value: "sla", default: draft.preview === "sla" },
                )));
            rows.push(row(new ButtonBuilder().setCustomId(cid(draft.mode, "finalize")).setLabel(t("Finalizar")).setEmoji(emoji.success).setStyle(ButtonStyle.Success)));
            break;
        case "summary":
            break;
    }

    return rows;
}

// ─── Page content (fields) ───────────────────────────────────────────────────
function buildCategoriesValue(draft: SetupDraft) {
    return getDraftCategories(draft).map((category, index) => `**${index + 1}.** ${category.label}`).join("\n").slice(0, 1024);
}

function buildCategoryMappingsValue(draft: SetupDraft) {
    return getDraftCategories(draft)
        .map((category) => `**${category.label}:** ${category.channel_id ? `<#${category.channel_id}>` : t("*Sem categoria Discord*")}`)
        .join("\n")
        .slice(0, 1024);
}

function buildPageFields(draft: SetupDraft): ContainerField[] {
    switch (draft.page) {
        case "general":
            return [
                { name: t(TEXT_LABELS.server_name), value: `${displayText(draft.server_name)}\n-# ${t("Mostrado no rodapé das mensagens do bot.")}` },
                { name: t(TEXT_LABELS.branding_color), value: displayText(draft.branding_color) },
                { name: t(TEXT_LABELS.branding_logo), value: displayText(draft.branding_logo) },
            ];
        case "access":
            return [
                { name: t(ROLE_LABELS.staff_role), value: `${displayRole(draft.staff_role)}\n-# ${t("Atende e gere os tickets — ver, assumir, gerir membros e fechar.")}` },
                { name: t(ROLE_LABELS.admin_role), value: `${displayRole(draft.admin_role)}\n-# ${t("Acesso total — configuração (`/config`), dashboard e fechar qualquer ticket.")}` },
                { name: t(CHANNEL_LABELS.log_channel), value: `${displayChannel(draft.log_channel)}\n-# ${t("Onde são publicados os logs operacionais (aberturas, fechos, transcripts).")}` },
            ];
        case "ticket_categories": {
            const active = getActiveDraftCategory(draft);
            return [
                { name: t("Categorias atuais"), value: buildCategoriesValue(draft) },
                { name: t("Regras"), value: t("Mínimo **1** categoria e máximo **8**. Uma por linha.") },
                { name: t("Categoria selecionada"), value: active ? `**${active.emoji ? `${active.emoji} ` : ""}${active.label}**` : t("*Sem categoria*") },
                { name: t("Boas-vindas"), value: active?.welcome_message?.trim() ? active.welcome_message.trim().slice(0, 300) : t("*Sem mensagem*") },
                { name: t("Cargos de ping"), value: active?.ping_roles?.length ? active.ping_roles.map((id) => `<@&${id}>`).join(", ") : t("*Nenhum*") },
            ];
        }
        case "ticket_forms": {
            const activeCategory = getActiveDraftCategory(draft);
            const activeForm = getActiveDraftForm(draft);
            const activeField = getActiveDraftFormField(draft);
            return [
                { name: t("Categoria ativa"), value: activeCategory ? `**${activeCategory.label}**` : t("*Sem categoria*") },
                { name: t("Modelo base"), value: activeForm ? `**${t(TICKET_FORM_PRESET_LABELS[activeForm.preset])}**` : t("*Sem modelo*") },
                { name: t("Título do modal"), value: activeForm ? `**${activeForm.modal_title}**` : t("*Sem título*") },
                { name: t("Campo ativo"), value: activeField ? `**${activeField.label}** — ${t(TICKET_FIELD_TYPE_LABELS[activeField.type])}${activeField.required ? "" : t(" · opcional")}` : t("*Sem campo*") },
                {
                    name: t("Campos atuais"),
                    value: (activeForm?.fields.map((field, index) => {
                        const meta = [t(TICKET_FIELD_TYPE_LABELS[field.type]), field.required ? null : "opcional", field.options?.length ? `${field.options.length} ${t("opções")}` : null].filter(Boolean).join(" · ");
                        return `**${index + 1}. ${field.label}**\n-# ${meta}`;
                    }).join("\n") || t("*Sem campos*")).slice(0, 1024),
                },
            ];
        }
        case "ticket_channels": {
            const format = normalizeTicketNameFormat(draft.ticket_name_format);
            return [
                { name: t(CHANNEL_LABELS.ticket_channel), value: displayChannel(draft.ticket_channel) },
                { name: t("Nome dos canais"), value: `**${t(TICKET_NAME_FORMAT_LABELS[format])}** — \`#${ticketNameExample(draft, format)}\`\n-# ${t("Se a mesma pessoa abrir outro ticket com o mesmo nome, o novo leva -2, -3…")}` },
                { name: t("Mapeamentos por categoria"), value: buildCategoryMappingsValue(draft) },
            ];
        }
        case "transcripts": {
            return [
                { name: t("Como funciona"), value: t("Quando um ticket fecha, a conversa inteira vira um ficheiro **HTML** anexado ao log do fecho — abre em qualquer browser, mesmo sem internet.") },
                { name: t(TEXT_LABELS.transcript_prefix), value: `${displayText(draft.transcript_prefix)}\n-# ${t("Sigla usada nos IDs dos transcripts (ex.: EPA-XXXXX-XXXXX).")}` },
            ];
        }
        case "ticket_panel":
            return [
                { name: t(TEXT_LABELS.ticket_panel_title), value: displayText(textOrDefault(draft.ticket_panel_title, DEFAULT_TICKET_PANEL_TITLE)) },
                { name: t(TEXT_LABELS.ticket_panel_description), value: textOrDefault(draft.ticket_panel_description, DEFAULT_TICKET_PANEL_DESCRIPTION).slice(0, 1024) },
                { name: t("Cor do botão"), value: `**${buttonStyleLabel(draft.ticket_button_style)}**` },
                { name: t(TEXT_LABELS.ticket_button_label), value: displayText(getTicketButtonLabel(draft)) },
                { name: t(TEXT_LABELS.ticket_button_emoji), value: displayText(getTicketButtonEmoji(draft)) },
            ];
        case "support": {
            const hours = parseSupportHours({ support_hours_json: draft.support_hours_json ?? null });
            const macros = getTicketMacros(draft);
            const activeMacro = getActiveMacro(draft);
            const autoClose = draft.ticket_auto_close_hours ?? 0;
            return [
                { name: t("Avaliação de atendimento"), value: draft.ticket_rating_enabled !== false ? `${emoji.success} Ativada` : `${emoji.error} Desativada` },
                { name: t(CHANNEL_LABELS.feedback_channel), value: displayChannel(draft.feedback_channel) },
                { name: t(ROLE_LABELS.client_role), value: displayRole(draft.client_role) },
                { name: t("Horário de atendimento"), value: hours ? `${formatSupportWindow(hours)}\n${formatSupportWindowNote(hours)}` : t("*Sempre disponível (24/7)*") },
                { name: t(TEXT_LABELS.ticket_auto_close_hours), value: autoClose > 0 ? t("{count, plural, one {**#** hora} other {**#** horas}}", { count: autoClose }) : `${emoji.error} ${t("Desativado")}` },
                { name: t("Limites"), value: t("Máx. abertos: **{max}** · Cooldown: **{seconds}s**", { max: draft.ticket_max_open ?? 3, seconds: draft.ticket_cooldown_seconds ?? 60 }) },
                { name: t("Metas de SLA"), value: t("Primeira resposta: **{minutes} min** · Resolução: **{hours} h**", { minutes: draft.sla_first_response_minutes ?? 15, hours: draft.sla_resolution_hours ?? 24 }) },
                { name: t("Respostas rápidas"), value: macros.length ? `${t("{count, plural, one {# definida} other {# definidas}}", { count: macros.length })}${activeMacro ? ` · ${t("Selecionada: {name}", { name: `**${activeMacro.name}**` })}` : ""}` : t("*Nenhuma*") },
            ];
        }
        case "panels": {
            const panels = getTicketPanels(draft);
            const active = getActivePanel(draft);
            const activeCats = active ? resolvePanelCategories(draft as GuildConfig, active).map((category) => category.label).join(", ") : "";
            return [
                { name: t("Painéis configurados"), value: panels.length ? panels.map((panel) => `• **${panel.name}**${panel.channel_id ? ` — <#${panel.channel_id}>` : t(" — *por publicar*")}`).join("\n").slice(0, 1024) : t("*Nenhum painel — usa o painel principal ou cria um.*") },
                { name: t("Painel selecionado"), value: active ? `**${active.name}**` : t("*Nenhum*") },
                { name: t("Categorias do painel"), value: active ? (activeCats || t("*Todas*")).slice(0, 1024) : "*—*" },
                { name: t("Publicar"), value: t("Usa `/painel painel:<nome>` no canal onde queres publicar.") },
            ];
        }
        case "review": {
            const panels = getTicketPanels(draft);
            const publishedPanels = panels.filter((panel) => panel.channel_id).length;
            const hours = parseSupportHours({ support_hours_json: draft.support_hours_json ?? null });
            return [
                { name: t("Painel principal"), value: draft.ticket_channel ? `<#${draft.ticket_channel}>` : t("*Sem canal definido*") },
                { name: t("Painéis extra"), value: panels.length ? `${t("{count, plural, one {**#** painel} other {**#** painéis}}", { count: panels.length })} · ${t("{count, plural, one {**#** publicado} other {**#** publicados}}", { count: publishedPanels })}` : t("*Nenhum*") },
                { name: t("Categorias"), value: buildCategoriesValue(draft) },
                { name: t("Equipa"), value: `${t("Staff")}: ${displayRole(draft.staff_role)} · ${t("Admin")}: ${displayRole(draft.admin_role)}` },
                { name: t("Atendimento"), value: `${draft.ticket_rating_enabled !== false ? `${emoji.success} ${t("Avaliação")}` : `${emoji.error} ${t("Avaliação")}`} · ${t("Horário: {hours} · Auto-close: {close} h", { hours: hours ? formatSupportWindow(hours) : "24/7", close: draft.ticket_auto_close_hours || 0 })}` },
                { name: t("Aplicar alterações"), value: t("-# O texto/botão dos painéis publicados só muda ao **Republicar painéis** (o resto guarda em direto).") },
            ];
        }
        case "summary":
            return [
                { name: t("Geral"), value: `${t(ROLE_LABELS.staff_role)}: ${displayRole(draft.staff_role)}\n${t(ROLE_LABELS.admin_role)}: ${displayRole(draft.admin_role)}\n${t(CHANNEL_LABELS.log_channel)}: ${displayChannel(draft.log_channel)}` },
                { name: t("Categorias"), value: buildCategoriesValue(draft) },
                { name: t("Salas dos tickets"), value: `${t("Painel")}: ${displayChannel(draft.ticket_channel)}\n${buildCategoryMappingsValue(draft)}`.slice(0, 1024) },
                { name: t("Transcripts"), value: t("Ficheiro HTML no log do fecho · sigla {prefix}", { prefix: normalizeTranscriptPrefix(draft.transcript_prefix) }) },
                { name: t("Branding e SLA"), value: t("Cor: {color}\nSLA resposta: **{minutes}** min\nSLA resolução: **{hours}** h", { color: displayText(draft.branding_color), minutes: draft.sla_first_response_minutes ?? 15, hours: draft.sla_resolution_hours ?? 24 }) },
            ];
        case "preview":
            return [{ name: t("Preview ativo"), value: draft.preview === "branding" ? t("Preview de branding") : draft.preview === "ticket_panel" ? t("Preview do painel de tickets") : t("Preview de SLA") }];
    }
}

function buildPreviewContainer(draft: SetupDraft): ContainerPlusBuilder | null {
    if (draft.page !== "preview" && draft.page !== "review") return null;
    const color = getEmbedColor({ branding_color: draft.branding_color ?? null });

    if (draft.preview === "ticket_panel") {
        return buildTicketPanelContainer(draft as GuildConfig);
    }
    if (draft.preview === "sla") {
        return buildContainer({
            color,
            title: `${emoji.clock} ${t("Preview de SLA")}`,
            description: t("Referência operacional para o tempo de resposta e resolução configurado."),
            fields: [
                { name: t("Primeira resposta"), value: t("{count, plural, one {# minuto} other {# minutos}}", { count: draft.sla_first_response_minutes ?? 15 }) },
                { name: t("Resolução"), value: t("{count, plural, one {# hora} other {# horas}}", { count: draft.sla_resolution_hours ?? 24 }) },
            ],
            footerText: getFooterText({ server_name: draft.server_name ?? null }),
        });
    }
    return buildContainer({
        color,
        thumbnailUrl: draft.branding_logo,
        title: `${emoji.star} ${t("Preview de branding")}`,
        description: t("Pré-visualização da identidade visual atual do servidor."),
        fields: draft.branding_logo ? [] : [{ name: t("Imagem do servidor"), value: t("*Não definida*") }],
        footerText: getFooterText({ server_name: draft.server_name ?? null }),
    });
}

export const SETUP_REPLY_FLAGS = CV2_FLAG | MessageFlags.Ephemeral;

export function buildSetupComponents(draft: SetupDraft, notice?: string, extraRows: Row[] = []): ContainerPlusBuilder[] {
    // Config keeps a vivid accent even with no branding colour set (brand gold fallback),
    // so the live panel never looks "colourless".
    const color = draft.mode === "config"
        ? hexToNumber(draft.branding_color ?? null, COLORS.gold)
        : getEmbedColor({ branding_color: draft.branding_color ?? null });
    const order = pageOrder(draft.mode);
    const stepLabel = draft.mode === "setup" ? `${order.indexOf(draft.page) + 1}/${order.length} • ` : "";
    const title = draft.mode === "config" ? `${emoji.settings} ${t("Configuração")} • ${t(PAGE_LABELS[draft.page])}` : `${emoji.settings} ${t("Setup")} • ${stepLabel}${t(PAGE_LABELS[draft.page])}`;
    const description = notice ? `${emoji.success} ${notice}\n\n${t(PAGE_DESCRIPTIONS[draft.page])}` : t(PAGE_DESCRIPTIONS[draft.page]);

    const main = buildContainer({
        color,
        title,
        description,
        fields: buildPageFields(draft),
        footerText: getFooterText({ server_name: draft.server_name ?? null }),
        rows: [...buildPageRows(draft), ...extraRows],
    });

    const preview = buildPreviewContainer(draft);
    return preview ? [main, preview] : [main];
}

// ─── Modal builders ──────────────────────────────────────────────────────────
export function buildTextFieldModal(field: SetupTextField, draft: SetupDraft): ModalBuilder {
    const input = new TextInputBuilder().setCustomId("value").setRequired(true);
    if (field === "ticket_panel_description") {
        input.setStyle(TextInputStyle.Paragraph).setMaxLength(1000);
    } else {
        input.setStyle(TextInputStyle.Short).setMaxLength(200);
    }

    const defaults: Record<SetupTextField, string> = {
        server_name: String(draft.server_name ?? ""),
        transcript_prefix: normalizeTranscriptPrefix(draft.transcript_prefix),
        ticket_panel_title: textOrDefault(draft.ticket_panel_title, DEFAULT_TICKET_PANEL_TITLE),
        ticket_panel_description: textOrDefault(draft.ticket_panel_description, DEFAULT_TICKET_PANEL_DESCRIPTION),
        ticket_button_label: textOrDefault(draft.ticket_button_label, DEFAULT_TICKET_BUTTON_LABEL),
        ticket_button_emoji: String(draft.ticket_button_emoji ?? DEFAULT_TICKET_BUTTON_EMOJI),
        branding_color: String(draft.branding_color ?? "#5865F2"),
        branding_logo: String(draft.branding_logo ?? "https://"),
        sla_first_response_minutes: String(draft.sla_first_response_minutes ?? 15),
        sla_resolution_hours: String(draft.sla_resolution_hours ?? 24),
        ticket_auto_close_hours: String(draft.ticket_auto_close_hours ?? 0),
        ticket_max_open: String(draft.ticket_max_open ?? 3),
        ticket_cooldown_seconds: String(draft.ticket_cooldown_seconds ?? 60),
    };

    input.setLabel(t(TEXT_LABELS[field])).setValue(defaults[field]);
    return new ModalBuilder()
        .setCustomId(cid(draft.mode, "modalsubmit", field))
        .setTitle(t("Editar {item}", { item: t(TEXT_LABELS[field]) }).slice(0, 45))
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export function buildCategoriesModal(draft: SetupDraft): ModalBuilder {
    const value = getDraftCategories(draft).map((category) => category.label).join("\n");
    return new ModalBuilder()
        .setCustomId(cid(draft.mode, "cats", "submit"))
        .setTitle(t("Categorias dos tickets"))
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("categories").setLabel(t("Uma categoria por linha")).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setValue(value).setPlaceholder(t("Suporte\nDúvidas\nBugs")),
        ));
}

export function buildFormTitleModal(draft: SetupDraft): ModalBuilder {
    const activeForm = getActiveDraftForm(draft);
    return new ModalBuilder()
        .setCustomId(cid(draft.mode, "form", "titlesubmit", activeForm?.category_id ?? "none"))
        .setTitle(t("Título do modal"))
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("modal_title").setLabel(t("Título do modal")).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(45).setValue(activeForm?.modal_title ?? ""),
        ));
}

/**
 * Add/edit field modal: label, type, help/placeholder, options and required — all via a
 * single modal (uses modal select components). When `fieldId` is null it builds a new field.
 */
export function buildFormFieldEditorModal(draft: SetupDraft, fieldId: string | null): ModalBuilder {
    const existing = fieldId ? getTicketFormField(getActiveDraftForm(draft), fieldId) : null;
    const currentType: TicketFormFieldType = existing?.type ?? "short";

    // The target id is baked into the customId. Besides routing the submit to the exact
    // field, it makes each modal unique — Discord restores previously-typed values for a
    // reused modal custom_id (draft cache on dismiss), so a shared id would leak field A's
    // half-typed values into field B's edit modal.
    const modal = new ModalBuilder()
        .setCustomId(existing && fieldId ? cid(draft.mode, "form", "fieldupdate", fieldId) : cid(draft.mode, "form", "fieldcreate"))
        .setTitle(existing ? t("Editar campo — {name}", { name: existing.label }).slice(0, 45) : t("Adicionar campo"));

    modal.addLabelComponents(
        new LabelBuilder()
            .setLabel(t("Nome do campo"))
            .setTextInputComponent(new TextInputBuilder().setCustomId("field_label").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(existing?.label ?? "")),
        new LabelBuilder()
            .setLabel(t("Tipo de campo"))
            .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId("field_type").setMinValues(1).setMaxValues(1).addOptions(
                (Object.entries(TICKET_FIELD_TYPE_LABELS) as Array<[TicketFormFieldType, string]>).map(([value, label]) => ({ label: t(label), value, default: value === currentType })),
            )),
        new LabelBuilder()
            .setLabel(t("Texto de ajuda / placeholder"))
            .setDescription(t("Para listas/escolha, é a dica mostrada acima das opções."))
            .setTextInputComponent(new TextInputBuilder().setCustomId("field_help").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200).setValue(existing?.placeholder ?? existing?.description ?? "")),
        new LabelBuilder()
            .setLabel(t("Opções (só lista/escolha) — separa por |"))
            .setTextInputComponent(new TextInputBuilder().setCustomId("field_options").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue((existing?.options ?? []).map((option) => option.label).join(" | ")).setPlaceholder(t("Dúvida | Sugestão | Outro"))),
        new LabelBuilder()
            .setLabel(t("Obrigatório?"))
            .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId("field_required").setMinValues(1).setMaxValues(1).addOptions(
                { label: t("Sim"), value: "yes", default: existing ? existing.required : true },
                { label: t("Não"), value: "no", default: existing ? !existing.required : false },
            )),
    );

    return modal;
}

// ─── Support / Panels / Categories modals ────────────────────────────────────
function shortInput(customId: string, label: string, value: string, placeholder: string, required = true, maxLength = 40): ActionRowBuilder<TextInputBuilder> {
    return new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(maxLength).setValue(value).setPlaceholder(placeholder),
    );
}

export function buildSupportHoursModal(draft: SetupDraft): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(cid(draft.mode, "supporthours", "submit"))
        .setTitle(t("Horário de atendimento"))
        .addLabelComponents(...supportHoursModalFields(parseSupportHours({ support_hours_json: draft.support_hours_json ?? null })));
}

export function buildMacroModal(draft: SetupDraft, kind: "new" | "edit"): ModalBuilder {
    const macro = kind === "edit" ? getActiveMacro(draft) : null;
    return new ModalBuilder()
        // Unique per macro on edit (avoids Discord's modal draft-cache leaking across macros).
        .setCustomId(macro ? cid(draft.mode, "macrosubmit", "edit", macro.id) : cid(draft.mode, "macrosubmit", "new"))
        .setTitle(kind === "edit" ? t("Editar resposta rápida") : t("Nova resposta rápida"))
        .addComponents(
            shortInput("name", "Nome", macro?.name ?? "", t("Ex.: Pedir mais informação"), true, 60),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder().setCustomId("content").setLabel(t("Conteúdo")).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800).setValue(macro?.content ?? "").setPlaceholder(t("Texto que será enviado no ticket.")),
            ),
        );
}

export function buildCategoryWelcomeModal(draft: SetupDraft): ModalBuilder {
    const active = getActiveDraftCategory(draft);
    return new ModalBuilder()
        .setCustomId(cid(draft.mode, "welcomesubmit", active?.id ?? "none"))
        .setTitle(t("Boas-vindas — {category}", { category: active?.label ?? t("categoria") }).slice(0, 45))
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("message").setLabel(t("Mensagem (vazio = remover)")).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500).setValue(active?.welcome_message ?? "").setPlaceholder(t("Ex.: Olá! Descreve o teu pedido com o máximo de detalhe.")),
        ));
}

export function buildCategoryEmojiModal(draft: SetupDraft): ModalBuilder {
    const active = getActiveDraftCategory(draft);
    return new ModalBuilder()
        .setCustomId(cid(draft.mode, "catemojisubmit", active?.id ?? "none"))
        .setTitle(`Emoji — ${active?.label ?? t("categoria")}`.slice(0, 45))
        .addComponents(shortInput("emoji", t("Emoji (vazio = remover)"), active?.emoji ?? "", "🎫", false, 60));
}

export function buildPanelNameModal(draft: SetupDraft, kind: "new" | "rename"): ModalBuilder {
    const active = kind === "rename" ? getActivePanel(draft) : null;
    return new ModalBuilder()
        // Unique per panel on rename (avoids Discord's modal draft-cache leaking across panels).
        .setCustomId(active ? cid(draft.mode, "panelname", "rename", active.id) : cid(draft.mode, "panelname", "new"))
        .setTitle(kind === "rename" ? t("Renomear painel") : t("Novo painel"))
        .addComponents(shortInput("name", t("Nome do painel"), active?.name ?? "", t("Ex.: Suporte geral"), true, 60));
}

export type PanelTextField = "title" | "description" | "button_label";

export function buildPanelFieldModal(draft: SetupDraft, field: PanelTextField): ModalBuilder {
    const active = getActivePanel(draft);
    const current = field === "title" ? active?.title : field === "description" ? active?.description : active?.button_label;
    const meta: Record<PanelTextField, { label: string; paragraph: boolean; max: number }> = {
        title: { label: t("Título do painel"), paragraph: false, max: 100 },
        description: { label: t("Descrição do painel"), paragraph: true, max: 1000 },
        button_label: { label: t("Texto do botão"), paragraph: false, max: 60 },
    };
    const config = meta[field];
    return new ModalBuilder()
        .setCustomId(cid(draft.mode, "panelfield", field, active?.id ?? "none"))
        .setTitle(config.label.slice(0, 45))
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("value").setLabel(config.label).setStyle(config.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false).setMaxLength(config.max).setValue(current ?? ""),
        ));
}
