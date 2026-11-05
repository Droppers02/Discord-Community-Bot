type Executor = { query: (text: string, values?: unknown[]) => Promise<unknown> };

// ─── Esquema da 4.0 (sistemas da comunidade) ─────────────────────────────────
// Trancas e horário de silêncio, notas da equipa, denúncias, contagem, confissões, procurar
// grupo, jogos grátis, previsões, equipas e o EPA Wrapped. Tudo idempotente, como o resto.

export async function ensureCommunitySchema(db: Executor): Promise<void> {
    // ─── Moderação: trancas (manuais, do servidor e do horário de silêncio) ──
    await db.query(`
        CREATE TABLE IF NOT EXISTS channel_locks (
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            had_overwrite BOOLEAN NOT NULL,
            prev_allow TEXT NOT NULL DEFAULT '0',
            prev_deny TEXT NOT NULL DEFAULT '0',
            source TEXT NOT NULL,
            reason TEXT,
            locked_by TEXT NOT NULL,
            locked_at BIGINT NOT NULL,
            until_at BIGINT,
            PRIMARY KEY (guild_id, channel_id, role_id)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_channel_locks_until ON channel_locks (until_at) WHERE until_at IS NOT NULL");
    await db.query(`
        CREATE TABLE IF NOT EXISTS member_staff_notes (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            note TEXT NOT NULL,
            created_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_staff_notes_user ON member_staff_notes (guild_id, user_id, created_at DESC)");

    // ─── Denúncias de mensagens ─────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS message_reports (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            author_tag TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
            message_created_at BIGINT NOT NULL,
            reporters JSONB NOT NULL DEFAULT '[]'::jsonb,
            status TEXT NOT NULL DEFAULT 'open',
            claimed_by TEXT,
            resolved_by TEXT,
            resolution TEXT,
            card_message_id TEXT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_reports_message ON message_reports (guild_id, message_id)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_reports_author ON message_reports (guild_id, author_id)");

    // ─── Canal de contagem ──────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS counting_state (
            guild_id TEXT PRIMARY KEY,
            current BIGINT NOT NULL DEFAULT 0,
            last_user_id TEXT,
            last_message_id TEXT,
            record BIGINT NOT NULL DEFAULT 0,
            record_at BIGINT NOT NULL DEFAULT 0,
            run_record BIGINT NOT NULL DEFAULT 0,
            saves INTEGER NOT NULL DEFAULT 0,
            total_counts BIGINT NOT NULL DEFAULT 0,
            fails INTEGER NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS counting_members (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            counts INTEGER NOT NULL DEFAULT 0,
            fails INTEGER NOT NULL DEFAULT 0,
            best_number BIGINT NOT NULL DEFAULT 0,
            last_at BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_id)
        )
    `);

    // ─── Confissões anónimas ────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS confessions (
            guild_id TEXT NOT NULL,
            number INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'confession',
            parent_number INTEGER,
            author_id TEXT NOT NULL,
            content TEXT NOT NULL,
            image_url TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            review_message_id TEXT,
            posted_channel_id TEXT,
            posted_message_id TEXT,
            thread_id TEXT,
            reviewed_by TEXT,
            reject_reason TEXT,
            created_at BIGINT NOT NULL,
            reviewed_at BIGINT,
            PRIMARY KEY (guild_id, number)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_confessions_author ON confessions (guild_id, author_id, created_at DESC)");

    // ─── Procurar grupo ─────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS lfg_groups (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            host_id TEXT NOT NULL,
            game_key TEXT NOT NULL,
            game_name TEXT NOT NULL,
            size INTEGER NOT NULL,
            members JSONB NOT NULL DEFAULT '[]'::jsonb,
            waitlist JSONB NOT NULL DEFAULT '[]'::jsonb,
            note TEXT,
            mode TEXT,
            starts_at BIGINT,
            reminded BOOLEAN NOT NULL DEFAULT FALSE,
            voice_channel_id TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            created_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL,
            closed_at BIGINT
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_lfg_active ON lfg_groups (guild_id, status, expires_at)");

    // ─── Jogos grátis ───────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS free_game_posts (
            guild_id TEXT NOT NULL,
            offer_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            title TEXT NOT NULL,
            ends_at BIGINT,
            expired BOOLEAN NOT NULL DEFAULT FALSE,
            posted_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, offer_id)
        )
    `);
    await db.query("ALTER TABLE free_game_posts ADD COLUMN IF NOT EXISTS data JSONB");

    // ─── Previsões com moedas ───────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS predictions (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            creator_id TEXT NOT NULL,
            question TEXT NOT NULL,
            options JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            winner INTEGER,
            house_cut_pct INTEGER NOT NULL DEFAULT 0,
            locks_at BIGINT,
            created_at BIGINT NOT NULL,
            resolved_at BIGINT
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_predictions_open ON predictions (status, locks_at)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS prediction_bets (
            prediction_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            option INTEGER NOT NULL,
            amount BIGINT NOT NULL,
            payout BIGINT NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (prediction_id, user_id)
        )
    `);

    // ─── Equipas ────────────────────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS teams (
            id BIGSERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            tag TEXT NOT NULL,
            emoji TEXT,
            color INTEGER NOT NULL DEFAULT 8150271,
            description TEXT,
            owner_id TEXT NOT NULL,
            role_id TEXT,
            text_channel_id TEXT,
            voice_channel_id TEXT,
            bank BIGINT NOT NULL DEFAULT 0,
            points BIGINT NOT NULL DEFAULT 0,
            open BOOLEAN NOT NULL DEFAULT FALSE,
            created_at BIGINT NOT NULL,
            CHECK (bank >= 0)
        )
    `);
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_teams_name ON teams (guild_id, lower(name))");
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_teams_tag ON teams (guild_id, lower(tag))");
    await db.query(`
        CREATE TABLE IF NOT EXISTS team_members (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            team_id BIGINT NOT NULL,
            rank TEXT NOT NULL DEFAULT 'member',
            points BIGINT NOT NULL DEFAULT 0,
            coins BIGINT NOT NULL DEFAULT 0,
            joined_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members (team_id)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS team_invites (
            guild_id TEXT NOT NULL,
            team_id BIGINT NOT NULL,
            user_id TEXT NOT NULL,
            invited_by TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, team_id, user_id)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS team_weekly (
            guild_id TEXT NOT NULL,
            team_id BIGINT NOT NULL,
            week TEXT NOT NULL,
            points BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, team_id, week)
        )
    `);

    // ─── EPA Wrapped: contagens finas por mês ───────────────────────────────
    // kind: 'hour' (0–23, hora de Lisboa), 'channel' (id), 'emoji' (texto do emoji), 'weekday' (0–6).
    await db.query(`
        CREATE TABLE IF NOT EXISTS wrapped_counts (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            month TEXT NOT NULL,
            kind TEXT NOT NULL,
            key TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_id, month, kind, key)
        )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_wrapped_counts_month ON wrapped_counts (guild_id, month, kind)");
    await db.query(`
        CREATE TABLE IF NOT EXISTS voice_pairs (
            guild_id TEXT NOT NULL,
            user_a TEXT NOT NULL,
            user_b TEXT NOT NULL,
            month TEXT NOT NULL,
            seconds BIGINT NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_a, user_b, month)
        )
    `);
}
