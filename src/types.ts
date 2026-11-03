import { tk } from "./lib/i18n.js";
import type { TICKET_BUTTON_STYLES } from "./lib/branding.js";

export type TicketCategory = string;
export type TicketButtonStyle = (typeof TICKET_BUTTON_STYLES)[number];
export type TicketStatus = "open" | "closed";
export type TicketFormPreset = "evidence_reason" | "vip_support" | "org_request" | "general_support";
export type TicketFormFieldType = "short" | "paragraph" | "radio" | "select" | "file";
export type TicketFormFieldSemantic = "none" | "reason" | "clip_toggle" | "clip_url";

// Nome do canal de um ticket — a categoria vai sempre à frente (ver ticketNaming.ts).
export const TICKET_NAME_FORMATS = ["category-user", "category-number", "category-number-user"] as const;
export type TicketNameFormat = (typeof TICKET_NAME_FORMATS)[number];

// Priority drives ordering/urgency signalling on tickets (default "normal").
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface TicketCategoryConfig {
    id: string;
    label: string;
    channel_id: string | null;
    order: number;
    /** Optional welcome message posted inside the ticket when opened in this category. */
    welcome_message?: string | null;
    /** Roles pinged when a ticket is opened in this category (on top of the staff role). */
    ping_roles?: string[];
    /** Optional emoji shown in the category selector. */
    emoji?: string | null;
    /** Optional description shown in the category selector. */
    description?: string | null;
}

/** A saved staff reply ("canned response") that can be posted into a ticket with one click. */
export interface TicketMacro {
    id: string;
    name: string;
    content: string;
}

/** A standalone ticket panel — a guild can publish several, each with its own categories/branding. */
export interface TicketPanelConfig {
    id: string;
    name: string;
    channel_id: string | null;
    message_id: string | null;
    title: string | null;
    description: string | null;
    button_label: string | null;
    button_emoji: string | null;
    button_style: TicketButtonStyle;
    /** Category ids exposed by this panel (empty = all configured categories). */
    category_ids: string[];
}

export interface TicketFormOptionConfig {
    label: string;
    value: string;
    default?: boolean;
}

export interface TicketFormFieldConfig {
    id: string;
    type: TicketFormFieldType;
    label: string;
    description?: string | null;
    placeholder?: string | null;
    required: boolean;
    semantic: TicketFormFieldSemantic;
    options?: TicketFormOptionConfig[];
    max_length?: number;
    /** Só no tipo `file`: quantos ficheiros o membro pode anexar (1–10). */
    max_files?: number;
}

export interface TicketCategoryFormConfig {
    category_id: string;
    preset: TicketFormPreset;
    modal_title: string;
    fields: TicketFormFieldConfig[];
}

export interface TicketFormResponseEntry {
    field_id: string;
    label: string;
    value: string;
    display_value: string;
    semantic: TicketFormFieldSemantic;
}

export interface GuildConfig {
    guild_id: string;
    server_name: string | null;
    transcript_prefix: string | null;
    transcript_category_id: string | null;
    staff_role: string | null;
    admin_role: string | null;
    log_channel: string | null;
    ticket_channel: string | null;
    ticket_categories_json: string | null;
    ticket_forms_json: string | null;
    ticket_panel_message: string | null;
    ticket_panel_title: string | null;
    ticket_panel_description: string | null;
    ticket_button_style: TicketButtonStyle;
    ticket_button_label: string | null;
    ticket_button_emoji: string | null;
    branding_color: string | null;
    branding_logo: string | null;
    sla_first_response_minutes: number;
    sla_resolution_hours: number;
    // ─── Atendimento / melhorias ────────────────────────────────────────────
    /** JSON-encoded SupportHours (office hours). Null = 24/7 (no offline notice). */
    support_hours_json: string | null;
    /** Hours of inactivity before a ticket auto-closes. 0 = disabled. */
    ticket_auto_close_hours: number;
    /** When true, the owner receives a satisfaction rating prompt on close. */
    ticket_rating_enabled: boolean;
    /** Channel where satisfaction feedback cards are published. */
    feedback_channel: string | null;
    /** Role granted to a ticket owner (customer/client role). */
    client_role: string | null;
    /** Max simultaneously-open tickets a single user may have. */
    ticket_max_open: number;
    /** Cooldown (seconds) between ticket openings per user. */
    ticket_cooldown_seconds: number;
    /** Formato do nome do canal (categoria + nome / número / número + nome). */
    ticket_name_format: TicketNameFormat;
    /** JSON-encoded TicketMacro[] (staff canned responses). */
    ticket_macros_json: string | null;
    /** JSON-encoded TicketPanelConfig[] (multi-panel support). */
    ticket_panels_json: string | null;
    /** Canais de boas-vindas/despedidas (cartões de entrada/saída de membros). */
    join_log_channel: string | null;
    leave_log_channel: string | null;
    created_at: string;
    updated_at: string;
}

export interface TicketRecord {
    id: string;
    /** Número sequencial do ticket NESTE servidor (#0042). Null nos tickets de antes da numeração. */
    ticket_number: number | null;
    guild_id: string;
    channel_id: string;
    ticket_message_id: string | null;
    owner_id: string;
    owner_tag: string;
    staff_id: string | null;
    staff_tag: string | null;
    category: TicketCategory;
    reason: string;
    clip_url: string | null;
    form_responses_json: string | null;
    status: TicketStatus;
    priority: TicketPriority;
    player_identifier: string | null;
    internal_note: string | null;
    transcript_id: string | null;
    first_response_at: string | null;
    last_activity_at: string | null;
    rating: number | null;
    rating_comment: string | null;
    rated_at: string | null;
    feedback_message_id: string | null;
    close_request_message: string | null;
    close_requested_by_id: string | null;
    close_requested_by_tag: string | null;
    close_requested_at: string | null;
    close_request_deadline_at: string | null;
    close_request_last_reminder_at: string | null;
    created_at: string;
    closed_at: string | null;
    /** SLA: quando se avisou que o ticket passou a meta de 1.a resposta, escalou, e passou a de resolucao. */
    sla_alerted_at?: string | null;
    sla_escalated_at?: string | null;
    sla_resolution_alerted_at?: string | null;
    /** De onde veio o ticket: null = painel/comando; "modmail" = mensagem privada ao bot. */
    source?: string | null;
}

export interface TranscriptMessage {
    author: string;
    authorId: string;
    content: string;
    timestamp: string;
    attachments: string[];
    avatar?: string | null;
}

export interface TranscriptRecord {
    id: string;
    ticket_id: string;
    guild_id: string;
    channel_name: string;
    owner_id: string;
    owner_tag: string;
    staff_id: string | null;
    staff_tag: string | null;
    category: TicketCategory;
    messages_json: TranscriptMessage[];
    created_at: string;
}

export interface TicketSearchResult {
    id: string;
    channel_id: string;
    owner_tag: string;
    category: TicketCategory;
    status: TicketStatus;
    created_at: string;
}

export interface LogField {
    name: string;
    value: string;
    inline?: boolean;
}

export type LogType =
    | "TICKET_OPEN"
    | "TICKET_ASSUMED"
    | "TICKET_CLOSED";

export interface LogData {
    title?: string;
    description?: string;
    fields?: LogField[];
    transcriptId?: string | null;
    files?: import("discord.js").AttachmentBuilder[];
}

// ─── Giveaways ─────────────────────────────────────────────────────────────
export const GIVEAWAY_STATUSES = ["running", "ended", "cancelled"] as const;
export type GiveawayStatus = (typeof GIVEAWAY_STATUSES)[number];

export interface GiveawayBonusRole {
    role_id: string;
    entries: number;
}

export interface GiveawayRecord {
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string | null;
    host_id: string;
    prize: string;
    description: string | null;
    winners_count: number;
    status: GiveawayStatus;
    required_role: string | null;
    bonus_roles: GiveawayBonusRole[];
    min_account_age_days: number;
    // Extra eligibility: minimum time joined in the server, and "must be a client".
    min_server_age_days: number;
    require_client: boolean;
    ends_at: number;
    created_at: number;
    ended_at: number | null;
    winner_ids: string[];
}

export interface GiveawaySettings {
    default_channel: string | null;
    host_role: string | null;
}

// ─── Suggestions ───────────────────────────────────────────────────────────
export const SUGGESTION_STATUSES = ["pending", "approved", "denied", "implemented", "considered"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export interface SuggestionRecord {
    id: string;
    seq: number;
    guild_id: string;
    channel_id: string;
    message_id: string | null;
    thread_id: string | null;
    author_id: string;
    author_tag: string;
    anonymous: boolean;
    content: string;
    status: SuggestionStatus;
    upvotes: number;
    downvotes: number;
    staff_id: string | null;
    staff_reason: string | null;
    created_at: number;
    updated_at: number;
}

export interface SuggestionSettings {
    channel: string | null;
    create_threads: boolean;
    required_role: string | null;
    manager_role: string | null;
}

// ─── Server logs (MEE6-style, per-category routing) ──────────────────────────
export const LOG_CATEGORIES = ["messages", "members", "moderation", "channels", "roles", "voice", "server"] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export interface LogCategoryConfig {
    enabled: boolean;
    channel_id: string | null;
}

export interface LogSettings {
    categories: Record<LogCategory, LogCategoryConfig>;
    ignored_channels: string[];
    ignored_roles: string[];
}

// ─── Anti-spam ───────────────────────────────────────────────────────────────
/**
 * Punição aplicada pelo anti-spam.
 *
 * `timeout` usa o timeout nativo do Discord, que impede o membro de interagir com TUDO —
 * incluindo abrir um ticket para recorrer. `quarantine` aplica um cargo que retira acesso
 * a todos os canais EXCETO ao dos tickets, por isso é a única punição (fora `delete`) em
 * que um membro punido por engano se consegue defender.
 */
export const ANTISPAM_ACTIONS = ["delete", "timeout", "quarantine", "kick", "ban"] as const;
export type AntiSpamAction = (typeof ANTISPAM_ACTIONS)[number];

export const ANTISPAM_ACTION_LABELS: Record<AntiSpamAction, string> = {
    delete: tk("Apenas apagar as mensagens"),
    timeout: tk("Timeout progressivo (10min → 1h → 1d → 3d)"),
    quarantine: tk("Cargo de castigo (só vê o canal dos tickets — permite recorrer)"),
    kick: tk("Expulsar do servidor"),
    ban: tk("Banir do servidor"),
};

export interface AntiSpamSettings {
    enabled: boolean;
    log_channel: string | null;
    exempt_roles: string[];
    link_whitelist: string[];
    allow_invites: boolean;
    // Flood: max messages within the window before it counts as flooding.
    flood_messages: number;
    flood_window_seconds: number;
    // Score threshold that triggers punishment (detailed scoring lives in antiSpamConfig.ts).
    score_threshold: number;
    // Accounts younger than this (days) are treated as "suspicious" / likely self-bots.
    min_account_age_days: number;
    /** Punição a aplicar quando o spam é detetado. */
    action: AntiSpamAction;
    /** Apagar também as outras mensagens recentes do infrator (texto, imagens e links). */
    purge_recent: boolean;
    /** Janela (minutos) das mensagens do infrator que são apagadas. */
    purge_minutes: number;
    /** Cargo de castigo: só vê o canal dos tickets, para o membro poder recorrer. */
    quarantine_role: string | null;
}

// ─── Cargos: temporários + persistentes (sticky roles) ──────────────────────
export interface TempRoleRecord {
    id: string;
    guild_id: string;
    user_id: string;
    role_id: string;
    /** Quem aplicou (staff) e razão opcional — útil para warns temporários. */
    granted_by: string;
    reason: string | null;
    expires_at: number;
    created_at: number;
}

export interface RoleSettings {
    /** Sticky roles: devolver estes cargos quando um membro volta ao servidor. */
    sticky_enabled: boolean;
    /** Cargos a persistir (vazio = nenhum). O dono do servidor escolhe explicitamente. */
    sticky_roles: string[];
}

/** Snapshot dos cargos de um membro quando sai — usado para repor os sticky roles. */
export interface MemberRolesBackup {
    guild_id: string;
    user_id: string;
    role_ids: string[];
    left_at: number;
}

// ─── Canais de voz temporários ───────────────────────────────────────────────
export interface VoiceSettings {
    /** Canal "hub": entrar nele cria uma sala temporária pessoal. Null = desligado. */
    hub_channel: string | null;
    /** Categoria Discord onde as salas temporárias são criadas (null = mesma do hub). */
    category_id: string | null;
    /** Template do nome da sala ({user} = nome do membro). */
    name_template: string;
    /** Limite de utilizadores por sala (0 = sem limite). */
    user_limit: number;
    /** O dono da sala pode geri-la (renomear/limite via permissões nativas)? */
    owner_can_manage: boolean;
    /** Botão/comando de sala de voz privada por ticket (dono + staff). */
    ticket_voice_enabled: boolean;
}

// ─── Reaction roles (menus de auto-cargos) ──────────────────────────────────
export interface ReactionRoleEntry {
    role_id: string;
    label: string;
    emoji: string | null;
    description: string | null;
}

export interface ReactionRolePanel {
    id: string;
    name: string;
    channel_id: string | null;
    message_id: string | null;
    title: string;
    description: string | null;
    /** buttons = botões toggle; select = menu (respeita max_roles); */
    mode: "buttons" | "select";
    /** Máx. de cargos em simultâneo no modo select (0 = sem limite). */
    max_roles: number;
    roles: ReactionRoleEntry[];
}

export interface ReactionRoleSettings {
    panels: ReactionRolePanel[];
}

// ─── Alertas sociais ─────────────────────────────────────────────────────────
export interface SocialSubscription {
    id: string;
    platform: "youtube" | "twitch" | "tiktok" | "kick" | "instagram";
    /** YouTube: channel ID (UC...); Twitch/TikTok/Kick: nome do perfil. */
    handle: string;
    display_name: string | null;
    announce_channel: string | null;
    /** {name} {title} {url} disponíveis. */
    message_template: string | null;
    mention_role: string | null;
    /** Último item anunciado (vídeo id / stream id) para não repetir. */
    last_item: string | null;
}

export interface SocialSettings {
    subscriptions: SocialSubscription[];
}

// ─── Canais de estatísticas ──────────────────────────────────────────────────
export const STAT_KEYS = ["members", "humans", "bots", "channels", "roles", "boosts"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface StatsEntry {
    key: StatKey;
    /** Nome do canal ({value} = número). */
    template: string;
    /** Canal criado/gerido pelo bot (null = por criar). */
    channel_id: string | null;
}

export interface StatsChannelsSettings {
    /** Categoria onde o bot cria e mantém os canais de estatísticas. */
    category_id: string | null;
    stats: StatsEntry[];
}

// ─── Broadcast: auto-publish + mensagens agendadas ───────────────────────────
export interface BroadcastSettings {
    /** Canais de announcements onde o bot faz crosspost automático. */
    autopublish_channels: string[];
}
