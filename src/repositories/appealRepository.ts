import { query, queryOne } from "#database";

export type AppealStatus = "pending" | "accepted" | "denied";

export interface AppealAnswer {
    question: string;
    answer: string;
}

export interface BanAppeal {
    id: string;
    guild_id: string;
    user_id: string;
    user_tag: string;
    ban_reason: string | null;
    answers: AppealAnswer[];
    status: AppealStatus;
    /** userId da equipa → "up" | "down" */
    votes: Record<string, "up" | "down">;
    reviewer_id: string | null;
    reviewer_note: string | null;
    channel_id: string | null;
    message_id: string | null;
    created_at: number;
    decided_at: number | null;
    /** Perguntas da equipa ao membro. */
    staff_questions: StaffQuestion[];
    /** Convite de regresso (pedido aprovado). */
    return_invite: string | null;
}

export interface StaffQuestion {
    question: string;
    by: string;
    at: number;
}

function toAppeal(row: Record<string, unknown>): BanAppeal {
    return {
        id: String(row.id),
        guild_id: String(row.guild_id),
        user_id: String(row.user_id),
        user_tag: String(row.user_tag ?? ""),
        ban_reason: (row.ban_reason as string | null) ?? null,
        answers: Array.isArray(row.answers) ? (row.answers as AppealAnswer[]) : [],
        status: (row.status as AppealStatus) ?? "pending",
        votes: row.votes && typeof row.votes === "object" ? (row.votes as Record<string, "up" | "down">) : {},
        reviewer_id: (row.reviewer_id as string | null) ?? null,
        reviewer_note: (row.reviewer_note as string | null) ?? null,
        channel_id: (row.channel_id as string | null) ?? null,
        message_id: (row.message_id as string | null) ?? null,
        created_at: Number(row.created_at),
        decided_at: row.decided_at === null || row.decided_at === undefined ? null : Number(row.decided_at),
        staff_questions: Array.isArray(row.staff_questions) ? (row.staff_questions as StaffQuestion[]) : [],
        return_invite: typeof row.return_invite === "string" ? row.return_invite : null,
    };
}

export async function createAppeal(entry: Omit<BanAppeal, "status" | "votes" | "reviewer_id" | "reviewer_note" | "decided_at" | "staff_questions" | "return_invite">): Promise<void> {
    await query(
        `INSERT INTO ban_appeals (id, guild_id, user_id, user_tag, ban_reason, answers, status, votes, channel_id, message_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', '{}'::jsonb, $7, $8, $9)`,
        [entry.id, entry.guild_id, entry.user_id, entry.user_tag, entry.ban_reason, JSON.stringify(entry.answers), entry.channel_id, entry.message_id, entry.created_at],
    );
}

export async function getAppeal(id: string): Promise<BanAppeal | null> {
    const row = await queryOne<Record<string, unknown>>("SELECT * FROM ban_appeals WHERE id = $1", [id]);
    return row ? toAppeal(row) : null;
}

export async function appealsOf(guildId: string, userId: string): Promise<BanAppeal[]> {
    const result = await query<Record<string, unknown>>("SELECT * FROM ban_appeals WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 20", [guildId, userId]);
    return result.rows.map(toAppeal);
}

export async function setAppealMessage(id: string, channelId: string, messageId: string): Promise<void> {
    await query("UPDATE ban_appeals SET channel_id = $2, message_id = $3 WHERE id = $1", [id, channelId, messageId]);
}

export async function setAppealVotes(id: string, votes: Record<string, "up" | "down">): Promise<void> {
    await query("UPDATE ban_appeals SET votes = $2 WHERE id = $1", [id, JSON.stringify(votes)]);
}

export async function appendAppealAnswer(id: string, answer: { question: string; answer: string }): Promise<void> {
    await query("UPDATE ban_appeals SET answers = answers || $2::jsonb WHERE id = $1", [id, JSON.stringify([answer])]);
}

/** Decide um pedido ainda pendente. Devolve false se outra pessoa já o decidiu. */
export async function decideAppeal(id: string, status: Exclude<AppealStatus, "pending">, reviewerId: string, note: string | null): Promise<boolean> {
    const result = await query(
        "UPDATE ban_appeals SET status = $2, reviewer_id = $3, reviewer_note = $4, decided_at = $5 WHERE id = $1 AND status = 'pending'",
        [id, status, reviewerId, note, Date.now()],
    );
    return (result.rowCount ?? 0) > 0;
}

/** Pergunta da equipa ao membro (aparece no /apelo dele, além da DM). */
export async function appendStaffQuestion(id: string, question: StaffQuestion): Promise<void> {
    await query("UPDATE ban_appeals SET staff_questions = staff_questions || $2::jsonb WHERE id = $1", [id, JSON.stringify([question])]);
}

/** Convite de regresso de um pedido aprovado (aparece no /apelo do membro). */
export async function setReturnInvite(id: string, url: string): Promise<void> {
    await query("UPDATE ban_appeals SET return_invite = $2 WHERE id = $1", [id, url]);
}
