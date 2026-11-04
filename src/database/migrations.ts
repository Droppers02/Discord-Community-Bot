import { loadRuntimeConfig } from "../config.js";
import { levelFromXp } from "../modules/levels/levelMath.js";

type Executor = { query: (text: string, values?: unknown[]) => Promise<unknown> };
type Rows<T> = { rows: T[] };

// ─── Esquema do EPA BOTCHI v3 ────────────────────────────────────────────────
// Tudo idempotente (CREATE … IF NOT EXISTS): corre em cada arranque. Transformações que só
// podem correr uma vez entram em VERSIONED_MIGRATIONS, registadas em `schema_migrations`.
//
// A base de dados do bot antigo (Python) usava nomes que chocam com os novos (tickets,
// giveaways, suggestions, app_meta…). No primeiro arranque, as tabelas antigas mudam-se
// INTEIRAS para o esquema `epa_legacy` — nada é apagado — e o progresso dos membros (XP,
// EPA Coins, estatísticas de jogos, reputação, tempo de voz) é importado para as novas.

const SETTINGS_TABLES = [
    "log_settings", "suggestion_settings", "antispam_settings", "giveaway_settings", "role_settings",
    "voice_settings", "reactionrole_settings", "social_settings", "statschannels_settings",
    "broadcast_settings", "sla_settings", "modmail_settings", "verify_settings", "levels_settings",
    "economy_settings", "games_settings", "moderation_settings", "appeal_settings", "protection_settings",
    "welcome_settings", "starboard_settings",
];

/** Tabelas do bot Python (v2.x). */
const LEGACY_TABLES = [
    "app_meta", "users", "user_items", "user_levels", "user_reputation", "welcome_config", "reminders",
    "scheduled_announcements", "tickets", "transactions", "moderation_logs", "warnings", "game_stats",
    "tournaments", "tournament_participants", "user_badges", "user_profiles", "marriages",
    "activity_history", "friendships", "message_stats", "user_streaks", "custom_roles", "trades",
    "achievements", "user_achievements", "auctions", "auction_bids", "active_events", "inventory_items",
    "moderation_strikes", "role_backups", "suggestions", "suggestion_votes", "giveaways",
    "giveaway_entries", "personal_notes", "voice_stats", "voice_totals", "starboard", "starboard_stars",
    "starboard_config", "afk_status",
];

async function tableExists(db: Executor, schema: string, table: string): Promise<boolean> {
    const result = (await db.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
        [schema, table],
    )) as Rows<unknown>;
    return result.rows.length > 0;
}

async function columnExists(db: Executor, schema: string, table: string, column: string): Promise<boolean> {
    const result = (await db.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3",
        [schema, table, column],
    )) as Rows<unknown>;
    return result.rows.length > 0;
}

/** Muda as tabelas do bot Python para `epa_legacy` (só se ainda estiverem em `public`). */
async function moveLegacyPythonTables(db: Executor): Promise<void> {
    // Marca inconfundível do bot antigo: `users` com a coluna `balance`.
    if (!(await columnExists(db, "public", "users", "balance"))) return;
    await db.query("CREATE SCHEMA IF NOT EXISTS epa_legacy");
    for (const table of LEGACY_TABLES) {
        if (!(await tableExists(db, "public", table))) continue;
        if (await tableExists(db, "epa_legacy", table)) continue;
        // Nomes vêm da lista fixa acima — nunca de input.
        await db.query(`ALTER TABLE public.${table} SET SCHEMA epa_legacy`);
    }
}

async function ensureSchema(db: Executor): Promise<void> {
    await db.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT,
            actor_id TEXT,
            action TEXT NOT NULL,
            details JSONB,
            created_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_audit_log_guild_created ON audit_log (guild_id, created_at)");

    // ─── Configuração geral + tickets ────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS guild_config (
            guild_id TEXT PRIMARY KEY,
            server_name TEXT,
            transcript_prefix TEXT,
            transcript_category_id TEXT,
            staff_role TEXT,
            admin_role TEXT,
            log_channel TEXT,
            ticket_channel TEXT,
            ticket_categories_json TEXT,
            ticket_forms_json TEXT,
            ticket_panel_message TEXT,
            ticket_panel_title TEXT,
            ticket_panel_description TEXT,
            ticket_button_style TEXT NOT NULL DEFAULT 'primary',
            ticket_button_label TEXT,
            ticket_button_emoji TEXT,
            branding_color TEXT,
            branding_logo TEXT,
            sla_first_response_minutes INTEGER NOT NULL DEFAULT 15,
            sla_resolution_hours INTEGER NOT NULL DEFAULT 24,
            support_hours_json TEXT,
            ticket_auto_close_hours INTEGER NOT NULL DEFAULT 0,
            ticket_rating_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            feedback_channel TEXT,
            client_role TEXT,
            ticket_max_open INTEGER NOT NULL DEFAULT 3,
            ticket_cooldown_seconds INTEGER NOT NULL DEFAULT 60,
            ticket_name_format TEXT NOT NULL DEFAULT 'category-user',
            ticket_macros_json TEXT,
            ticket_panels_json TEXT,
            join_log_channel TEXT,
            leave_log_channel TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            ticket_number INTEGER,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            ticket_message_id TEXT,
            owner_id TEXT NOT NULL,
            owner_tag TEXT NOT NULL,
            staff_id TEXT,
            staff_tag TEXT,
            category TEXT NOT NULL,
            reason TEXT NOT NULL,
            clip_url TEXT,
            form_responses_json TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            priority TEXT NOT NULL DEFAULT 'normal',
            player_identifier TEXT,
            internal_note TEXT,
            transcript_id TEXT,
            first_response_at TEXT,
            last_activity_at TEXT,
            rating INTEGER,
            rating_comment TEXT,
            rated_at TEXT,
            feedback_message_id TEXT,
            close_request_message TEXT,
            close_requested_by_id TEXT,
            close_requested_by_tag TEXT,
            close_requested_at TEXT,
            close_request_deadline_at TEXT,
            close_request_last_reminder_at TEXT,
            sla_alerted_at TEXT,
            sla_escalated_at TEXT,
            sla_resolution_alerted_at TEXT,
            source TEXT,
            created_at TEXT NOT NULL,
            closed_at TEXT
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets (guild_id, status)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_tickets_owner_status ON tickets (guild_id, owner_id, status)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_tickets_staff_status ON tickets (guild_id, staff_id, status)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (guild_id, created_at)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets (channel_id)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_tickets_close_deadline ON tickets (guild_id, status, close_request_deadline_at)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_tickets_source_owner ON tickets (owner_id, source, status)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS ticket_counters (
            guild_id TEXT PRIMARY KEY,
            last_number INTEGER NOT NULL
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS ticket_blacklist (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            reason TEXT,
            added_by TEXT,
            created_at TEXT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);

    // ─── Definições JSONB por servidor ───────────────────────────────────────
    for (const table of SETTINGS_TABLES) {
        await db.query(`
            CREATE TABLE IF NOT EXISTS ${table} (
                guild_id TEXT PRIMARY KEY,
                config JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at BIGINT NOT NULL
            )
        `);
    }

    // ─── Comunidade ──────────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS giveaways (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            host_id TEXT NOT NULL,
            prize TEXT NOT NULL,
            description TEXT,
            winners_count INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'running',
            required_role TEXT,
            bonus_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
            min_account_age_days INTEGER NOT NULL DEFAULT 0,
            min_server_age_days INTEGER NOT NULL DEFAULT 0,
            require_client BOOLEAN NOT NULL DEFAULT FALSE,
            ends_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL,
            ended_at BIGINT,
            winner_ids JSONB NOT NULL DEFAULT '[]'::jsonb
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS giveaway_entries (
            giveaway_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            entries INTEGER NOT NULL DEFAULT 1,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (giveaway_id, user_id)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_giveaways_guild_status ON giveaways (guild_id, status, ends_at)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_giveaways_running ON giveaways (status, ends_at)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS suggestions (
            id TEXT PRIMARY KEY,
            seq INTEGER NOT NULL DEFAULT 0,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            thread_id TEXT,
            author_id TEXT NOT NULL,
            author_tag TEXT NOT NULL DEFAULT '',
            anonymous BOOLEAN NOT NULL DEFAULT FALSE,
            content TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            upvotes INTEGER NOT NULL DEFAULT 0,
            downvotes INTEGER NOT NULL DEFAULT 0,
            staff_id TEXT,
            staff_reason TEXT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS suggestion_votes (
            suggestion_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            value SMALLINT NOT NULL,
            PRIMARY KEY (suggestion_id, user_id)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_suggestions_guild_status ON suggestions (guild_id, status)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS antispam_offenses (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            offenses INTEGER NOT NULL DEFAULT 0,
            last_offense_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS invite_joins (
            guild_id TEXT NOT NULL,
            member_id TEXT NOT NULL,
            inviter_id TEXT,
            code TEXT,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, member_id)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_invite_joins_inviter ON invite_joins (guild_id, inviter_id)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS temp_roles (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            granted_by TEXT NOT NULL,
            reason TEXT,
            expires_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_temp_roles_expiry ON temp_roles (expires_at)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_temp_roles_guild_user ON temp_roles (guild_id, user_id)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS member_role_backups (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            left_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS verify_pending (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            joined_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);

    // ─── Níveis, reputação ───────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS member_levels (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            xp BIGINT NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 0,
            messages INTEGER NOT NULL DEFAULT 0,
            voice_seconds BIGINT NOT NULL DEFAULT 0,
            last_xp_at BIGINT NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_member_levels_rank ON member_levels (guild_id, xp DESC)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS member_reputation (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            points INTEGER NOT NULL DEFAULT 0,
            last_given_at BIGINT NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_member_reputation_rank ON member_reputation (guild_id, points DESC)");

    // ─── Economia (EPA Coins) ────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS economy_accounts (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            balance BIGINT NOT NULL DEFAULT 0,
            total_earned BIGINT NOT NULL DEFAULT 0,
            total_spent BIGINT NOT NULL DEFAULT 0,
            daily_streak INTEGER NOT NULL DEFAULT 0,
            best_daily_streak INTEGER NOT NULL DEFAULT 0,
            last_daily_at BIGINT NOT NULL DEFAULT 0,
            last_work_at BIGINT NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id),
            CHECK (balance >= 0)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_economy_rank ON economy_accounts (guild_id, balance DESC)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS economy_ledger (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            amount BIGINT NOT NULL,
            balance_after BIGINT NOT NULL,
            kind TEXT NOT NULL,
            note TEXT,
            created_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_economy_ledger_user ON economy_ledger (guild_id, user_id, created_at DESC)");

    // ─── Mini-jogos ──────────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS game_stats (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            game TEXT NOT NULL,
            played INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            draws INTEGER NOT NULL DEFAULT 0,
            streak INTEGER NOT NULL DEFAULT 0,
            best_streak INTEGER NOT NULL DEFAULT 0,
            best_score INTEGER NOT NULL DEFAULT 0,
            coins_won BIGINT NOT NULL DEFAULT 0,
            coins_lost BIGINT NOT NULL DEFAULT 0,
            last_played_at BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_id, game)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_game_stats_rank ON game_stats (guild_id, game, wins DESC)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS game_daily (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            game TEXT NOT NULL,
            day TEXT NOT NULL,
            result TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id, game, day)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_game_daily_board ON game_daily (guild_id, game, day)");

    // ─── Moderação ───────────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS mod_cases (
            guild_id TEXT NOT NULL,
            case_number INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            user_tag TEXT NOT NULL DEFAULT '',
            moderator_id TEXT NOT NULL,
            action TEXT NOT NULL,
            reason TEXT,
            duration_seconds INTEGER,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, case_number)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_mod_cases_user ON mod_cases (guild_id, user_id, created_at DESC)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS mod_case_counters (
            guild_id TEXT PRIMARY KEY,
            last_number INTEGER NOT NULL
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS ban_appeals (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_tag TEXT NOT NULL DEFAULT '',
            ban_reason TEXT,
            answers JSONB NOT NULL DEFAULT '[]'::jsonb,
            status TEXT NOT NULL DEFAULT 'pending',
            votes JSONB NOT NULL DEFAULT '{}'::jsonb,
            reviewer_id TEXT,
            reviewer_note TEXT,
            channel_id TEXT,
            message_id TEXT,
            created_at BIGINT NOT NULL,
            decided_at BIGINT
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_ban_appeals_user ON ban_appeals (guild_id, user_id, created_at DESC)");
    // O membro banido vê no /apelo as perguntas da equipa e o convite de regresso (as DMs do bot a
    // quem já não partilha o servidor podem não chegar).
    await db.query("ALTER TABLE ban_appeals ADD COLUMN IF NOT EXISTS staff_questions JSONB NOT NULL DEFAULT '[]'::jsonb");
    await db.query("ALTER TABLE ban_appeals ADD COLUMN IF NOT EXISTS return_invite TEXT");

    // ─── Utilidades ──────────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS scheduled_announcements (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            title TEXT,
            content TEXT NOT NULL,
            mention_role TEXT,
            image_url TEXT,
            send_at BIGINT NOT NULL,
            repeat TEXT NOT NULL DEFAULT 'none',
            created_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_announcements_due ON scheduled_announcements (send_at)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            remind_at BIGINT NOT NULL,
            repeat_ms BIGINT NOT NULL DEFAULT 0,
            dm BOOLEAN NOT NULL DEFAULT FALSE,
            created_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (remind_at)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS personal_notes (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_personal_notes_user ON personal_notes (guild_id, user_id, created_at DESC)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS afk_status (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            since BIGINT NOT NULL,
            mentions INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_id)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS starboard_posts (
            guild_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            starboard_message_id TEXT,
            stars INTEGER NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, message_id)
        )
    `);

    // ─── Social ──────────────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS member_profiles (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            bio TEXT,
            color TEXT,
            birthday TEXT,
            favorite_game TEXT,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS friendships (
            guild_id TEXT NOT NULL,
            user_a TEXT NOT NULL,
            user_b TEXT NOT NULL,
            requester_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_a, user_b)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS marriages (
            guild_id TEXT NOT NULL,
            user_a TEXT NOT NULL,
            user_b TEXT NOT NULL,
            ring_tier INTEGER NOT NULL DEFAULT 1,
            married_at BIGINT NOT NULL,
            last_anniversary_at BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_a, user_b)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_marriages_b ON marriages (guild_id, user_b)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS member_activity (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            day TEXT NOT NULL,
            messages INTEGER NOT NULL DEFAULT 0,
            xp INTEGER NOT NULL DEFAULT 0,
            voice_seconds INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_id, day)
        )
    `);

    // ─── Economia: cargos pessoais e eventos ─────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS custom_roles (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS economy_events (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            type TEXT NOT NULL,
            multiplier REAL NOT NULL DEFAULT 2,
            channel_id TEXT,
            created_by TEXT NOT NULL,
            starts_at BIGINT NOT NULL,
            ends_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_economy_events_active ON economy_events (guild_id, ends_at)");

    // ─── Música ──────────────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS music_playlists (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at BIGINT NOT NULL,
            UNIQUE (guild_id, user_id, name)
        )
    `);
}

// ─── Migrações de uma só vez ─────────────────────────────────────────────────
interface VersionedMigration {
    id: string;
    up: (db: Executor) => Promise<void>;
}

const GAME_NAMES: Record<string, string> = {
    tictactoe: "galo",
    connect4: "4emlinha",
    hangman: "forca",
    blackjack: "blackjack",
    quiz: "quiz",
    coinflip: "moeda",
};

/**
 * Traz o progresso dos membros do bot antigo. Cada parte é independente: se uma tabela antiga
 * não existir (ou tiver outra forma), essa parte salta-se e as outras continuam.
 */
async function importLegacyProgress(db: Executor): Promise<void> {
    const guildId = loadRuntimeConfig().mainGuildId;
    const now = Date.now();
    const safely = async (label: string, fn: () => Promise<void>) => {
        try {
            await fn();
        } catch (error) {
            console.warn(`[migração] importação "${label}" saltada:`, error instanceof Error ? error.message : error);
        }
    };

    await safely("níveis", async () => {
        if (!(await tableExists(db, "epa_legacy", "user_levels"))) return;
        const { rows } = (await db.query("SELECT user_id, guild_id, xp, messages_sent FROM epa_legacy.user_levels WHERE xp > 0 OR messages_sent > 0")) as Rows<{ user_id: string; guild_id: string; xp: number | string | null; messages_sent: number | null }>;
        for (const row of rows) {
            const xp = Math.max(0, Number(row.xp ?? 0));
            await db.query(
                `INSERT INTO member_levels (guild_id, user_id, xp, level, messages, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (guild_id, user_id) DO NOTHING`,
                [row.guild_id || guildId, row.user_id, xp, levelFromXp(xp), Number(row.messages_sent ?? 0), now],
            );
        }
    });

    await safely("tempo de voz", async () => {
        if (!(await tableExists(db, "epa_legacy", "voice_totals"))) return;
        await db.query(`
            INSERT INTO member_levels (guild_id, user_id, voice_seconds, updated_at)
            SELECT COALESCE(NULLIF(guild_id, ''), $1), user_id, GREATEST(total_time, 0), $2 FROM epa_legacy.voice_totals
            ON CONFLICT (guild_id, user_id) DO UPDATE SET voice_seconds = EXCLUDED.voice_seconds
        `, [guildId, now]);
    });

    await safely("EPA Coins", async () => {
        if (!(await tableExists(db, "epa_legacy", "users"))) return;
        await db.query(`
            INSERT INTO economy_accounts (guild_id, user_id, balance, total_earned, daily_streak, best_daily_streak, created_at, updated_at)
            SELECT $1, user_id, GREATEST(COALESCE(balance, 0), 0), GREATEST(COALESCE(total_earned, 0), 0), 0, COALESCE(daily_streak, 0), $2, $2
            FROM epa_legacy.users
            ON CONFLICT (guild_id, user_id) DO NOTHING
        `, [guildId, now]);
    });

    await safely("reputação", async () => {
        if (!(await tableExists(db, "epa_legacy", "user_reputation"))) return;
        await db.query(`
            INSERT INTO member_reputation (guild_id, user_id, points, updated_at)
            SELECT COALESCE(NULLIF(guild_id, ''), $1), user_id, GREATEST(reputation, 0), $2 FROM epa_legacy.user_reputation WHERE reputation > 0
            ON CONFLICT (guild_id, user_id) DO NOTHING
        `, [guildId, now]);
    });

    await safely("jogos", async () => {
        if (!(await tableExists(db, "epa_legacy", "game_stats"))) return;
        const { rows } = (await db.query("SELECT user_id, game_type, wins, losses, draws, total_games, total_earnings, best_streak FROM epa_legacy.game_stats")) as Rows<{
            user_id: string; game_type: string; wins: number; losses: number; draws: number; total_games: number; total_earnings: number | string; best_streak: number;
        }>;
        for (const row of rows) {
            const game = GAME_NAMES[row.game_type];
            if (!game) continue;
            const earnings = Number(row.total_earnings ?? 0);
            await db.query(
                `INSERT INTO game_stats (guild_id, user_id, game, played, wins, losses, draws, best_streak, coins_won, coins_lost, last_played_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (guild_id, user_id, game) DO NOTHING`,
                [guildId, row.user_id, game, row.total_games ?? 0, row.wins ?? 0, row.losses ?? 0, row.draws ?? 0, row.best_streak ?? 0, Math.max(0, earnings), Math.max(0, -earnings), now],
            );
        }
    });
}

const VERSIONED_MIGRATIONS: VersionedMigration[] = [
    {
        id: "2026-11-03-v3-import-legacy-progress",
        up: async (db) => {
            if (!(await tableExists(db, "epa_legacy", "users"))) return;
            await importLegacyProgress(db);
        },
    },
];

async function runVersionedMigrations(db: Executor): Promise<void> {
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at BIGINT NOT NULL
        )
    `);
    const result = (await db.query("SELECT id FROM schema_migrations")) as Rows<{ id: string }>;
    const applied = new Set(result.rows.map((r) => r.id));

    for (const migration of VERSIONED_MIGRATIONS) {
        if (applied.has(migration.id)) continue;
        await migration.up(db);
        await db.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [migration.id, Date.now()]);
    }
}

export async function runMigrations(db: Executor): Promise<void> {
    await moveLegacyPythonTables(db);
    await ensureSchema(db);
    await runVersionedMigrations(db);
}
