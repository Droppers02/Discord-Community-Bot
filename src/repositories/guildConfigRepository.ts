import { query, queryOne } from "#database";
import { TICKET_NAME_FORMATS, type GuildConfig, type TicketButtonStyle, type TicketNameFormat } from "../types.js";

const cache = new Map<string, GuildConfig>();

const COLUMNS = [
    "server_name",
    "transcript_prefix",
    "transcript_category_id",
    "staff_role",
    "admin_role",
    "log_channel",
    "ticket_channel",
    "ticket_categories_json",
    "ticket_forms_json",
    "ticket_panel_message",
    "ticket_panel_title",
    "ticket_panel_description",
    "ticket_button_style",
    "ticket_button_label",
    "ticket_button_emoji",
    "branding_color",
    "branding_logo",
    "sla_first_response_minutes",
    "sla_resolution_hours",
    "support_hours_json",
    "ticket_auto_close_hours",
    "ticket_rating_enabled",
    "feedback_channel",
    "client_role",
    "ticket_max_open",
    "ticket_cooldown_seconds",
    "ticket_name_format",
    "ticket_macros_json",
    "ticket_panels_json",
    "join_log_channel",
    "leave_log_channel",
] as const;

function rowToConfig(row: Record<string, unknown>): GuildConfig {
    return {
        guild_id: row.guild_id as string,
        server_name: (row.server_name as string) ?? null,
        transcript_prefix: (row.transcript_prefix as string) ?? null,
        transcript_category_id: (row.transcript_category_id as string) ?? null,
        staff_role: (row.staff_role as string) ?? null,
        admin_role: (row.admin_role as string) ?? null,
        log_channel: (row.log_channel as string) ?? null,
        ticket_channel: (row.ticket_channel as string) ?? null,
        ticket_categories_json: (row.ticket_categories_json as string) ?? null,
        ticket_forms_json: (row.ticket_forms_json as string) ?? null,
        ticket_panel_message: (row.ticket_panel_message as string) ?? null,
        ticket_panel_title: (row.ticket_panel_title as string) ?? null,
        ticket_panel_description: (row.ticket_panel_description as string) ?? null,
        ticket_button_style: ((row.ticket_button_style as TicketButtonStyle) ?? "primary"),
        ticket_button_label: (row.ticket_button_label as string) ?? null,
        ticket_button_emoji: (row.ticket_button_emoji as string) ?? null,
        branding_color: (row.branding_color as string) ?? null,
        branding_logo: (row.branding_logo as string) ?? null,
        sla_first_response_minutes: Number(row.sla_first_response_minutes ?? 15),
        sla_resolution_hours: Number(row.sla_resolution_hours ?? 24),
        support_hours_json: (row.support_hours_json as string) ?? null,
        ticket_auto_close_hours: Number(row.ticket_auto_close_hours ?? 0),
        ticket_rating_enabled: (row.ticket_rating_enabled as boolean) ?? true,
        feedback_channel: (row.feedback_channel as string) ?? null,
        client_role: (row.client_role as string) ?? null,
        ticket_max_open: Number(row.ticket_max_open ?? 3),
        ticket_cooldown_seconds: Number(row.ticket_cooldown_seconds ?? 60),
        // O site grava texto livre na mesma coluna: um valor desconhecido volta ao formato por omissão.
        ticket_name_format: TICKET_NAME_FORMATS.includes(row.ticket_name_format as TicketNameFormat) ? (row.ticket_name_format as TicketNameFormat) : "category-user",
        ticket_macros_json: (row.ticket_macros_json as string) ?? null,
        ticket_panels_json: (row.ticket_panels_json as string) ?? null,
        join_log_channel: (row.join_log_channel as string) ?? null,
        leave_log_channel: (row.leave_log_channel as string) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
    };
}

export async function hydrateGuildConfigCache(): Promise<void> {
    const result = await query<Record<string, unknown>>("SELECT * FROM guild_config");
    cache.clear();
    for (const row of result.rows) {
        const config = rowToConfig(row);
        cache.set(config.guild_id, config);
    }
}

/** Synchronous read from the warm cache (null if never loaded/created). */
export function getCachedGuildConfig(guildId: string): GuildConfig | null {
    return cache.get(guildId) ?? null;
}

/** Drop a guild's config from the in-memory cache (e.g. after a data wipe). */
export function evictGuildConfig(guildId: string): void {
    cache.delete(guildId);
}

export async function ensureGuildConfig(guildId: string): Promise<GuildConfig> {
    const cached = cache.get(guildId);
    if (cached) return cached;

    const existing = await queryOne<Record<string, unknown>>("SELECT * FROM guild_config WHERE guild_id = $1", [guildId]);
    if (existing) {
        const config = rowToConfig(existing);
        cache.set(guildId, config);
        return config;
    }

    const now = new Date().toISOString();
    const inserted = await queryOne<Record<string, unknown>>(
        `INSERT INTO guild_config (guild_id, created_at, updated_at)
         VALUES ($1, $2, $2)
         ON CONFLICT (guild_id) DO UPDATE SET updated_at = guild_config.updated_at
         RETURNING *`,
        [guildId, now],
    );
    const config = rowToConfig(inserted!);
    cache.set(guildId, config);
    return config;
}

export async function upsertGuildConfig(patch: Partial<GuildConfig> & { guild_id: string }): Promise<GuildConfig> {
    await ensureGuildConfig(patch.guild_id);

    const updates = COLUMNS.filter((column) => column in patch);
    const now = new Date().toISOString();

    if (updates.length === 0) {
        // Nothing to change besides the timestamp.
        const row = await queryOne<Record<string, unknown>>(
            "UPDATE guild_config SET updated_at = $2 WHERE guild_id = $1 RETURNING *",
            [patch.guild_id, now],
        );
        const config = rowToConfig(row!);
        cache.set(config.guild_id, config);
        return config;
    }

    const setClauses = updates.map((column, index) => `${column} = $${index + 2}`);
    const values = updates.map((column) => (patch as Record<string, unknown>)[column] ?? null);
    setClauses.push(`updated_at = $${updates.length + 2}`);

    const row = await queryOne<Record<string, unknown>>(
        `UPDATE guild_config SET ${setClauses.join(", ")} WHERE guild_id = $1 RETURNING *`,
        [patch.guild_id, ...values, now],
    );
    const config = rowToConfig(row!);
    cache.set(config.guild_id, config);
    return config;
}
