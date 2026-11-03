import { randomUUID } from "node:crypto";
import {
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    type Client,
    type TextChannel,
} from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row, type ContainerField, type Row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { emoji, type EmojiName } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";
import {
    getSuggestionById,
    insertSuggestion,
    updateSuggestionMessage,
} from "../../repositories/suggestionRepository.js";
import type { SuggestionRecord, SuggestionStatus } from "../../types.js";
import { getSuggestionSettings } from "./suggestionSettings.js";
import { t, tk } from "../../lib/i18n.js";

// Store the emoji NAME (resolved at render time). Resolving here at module load would freeze
// the unicode fallback, since application emojis only sync later, on the ready event.
const STATUS_META: Record<SuggestionStatus, { label: string; emojiName: EmojiName; color: number }> = {
    pending: { label: tk("Em votação"), emojiName: "upvote", color: COLORS.neutral },
    approved: { label: tk("Aprovada"), emojiName: "accept", color: COLORS.success },
    denied: { label: tk("Recusada"), emojiName: "error", color: COLORS.danger },
    implemented: { label: tk("Implementada"), emojiName: "rocket", color: COLORS.primary },
    considered: { label: tk("Em análise"), emojiName: "flask", color: COLORS.gold },
};

export const SUGGESTION_STATUS_LABELS = STATUS_META;

// Suggestions are "complete" (locked) once implemented or denied.
const TERMINAL_STATUSES: ReadonlySet<SuggestionStatus> = new Set(["implemented", "denied"]);

export function isTerminalSuggestion(status: SuggestionStatus): boolean {
    return TERMINAL_STATUSES.has(status);
}

// Voting stays open while in votação/em análise; it closes once approved, denied or
// implemented (a decision has been made).
const VOTING_STATUSES: ReadonlySet<SuggestionStatus> = new Set(["pending", "considered"]);

export function isVotingOpen(status: SuggestionStatus): boolean {
    return VOTING_STATUSES.has(status);
}

/**
 * An approved suggestion is a positive decision — it can only move forward to
 * "implemented", never back to "em análise" or "recusada".
 */
export function canChangeSuggestionStatus(from: SuggestionStatus, to: SuggestionStatus): boolean {
    if (from === "approved" && (to === "considered" || to === "denied")) return false;
    return true;
}

// Public message: vote buttons (always show the tally; disabled once voting closes) plus
// a staff-panel button (hidden once the suggestion is closed/terminal).
function voteRows(suggestion: SuggestionRecord): Row[] {
    const votingOpen = isVotingOpen(suggestion.status);
    const buttons = [
        new ButtonBuilder().setCustomId(buildCustomId("suggestion", "up", suggestion.id)).setEmoji(emoji.upvote).setLabel(String(suggestion.upvotes)).setStyle(ButtonStyle.Success).setDisabled(!votingOpen),
        new ButtonBuilder().setCustomId(buildCustomId("suggestion", "down", suggestion.id)).setEmoji(emoji.downvote).setLabel(String(suggestion.downvotes)).setStyle(ButtonStyle.Danger).setDisabled(!votingOpen),
    ];
    if (!isTerminalSuggestion(suggestion.status)) {
        buttons.push(new ButtonBuilder().setCustomId(buildCustomId("suggestion", "staffpanel", suggestion.id)).setEmoji(emoji.settings).setLabel(t("Painel staff")).setStyle(ButtonStyle.Secondary));
    }
    return [row(...buttons)];
}

/** Ephemeral staff-only panel with the moderation actions for a suggestion. */
export function buildSuggestionStaffPanel(suggestion: SuggestionRecord): ContainerPlusBuilder {
    const meta = STATUS_META[suggestion.status];
    const status = suggestion.status;
    const isApproved = status === "approved";
    return buildContainer({
        color: meta.color,
        title: `${emoji.settings} ${t("Painel staff — Sugestão #{number}", { number: suggestion.seq })}`,
        description: t("Estado atual: {status}\nEscolhe a ação (podes adicionar uma resposta da equipa).", { status: `${emoji[meta.emojiName]} **${t(meta.label)}**` }),
        rows: [row(
            // Disable an action when it's the current state or an invalid transition
            // (uma sugestão aprovada só pode avançar para implementada).
            new ButtonBuilder().setCustomId(buildCustomId("suggestion", "approved", suggestion.id)).setLabel(t("Aprovar")).setEmoji(emoji.accept).setStyle(ButtonStyle.Success).setDisabled(isApproved),
            new ButtonBuilder().setCustomId(buildCustomId("suggestion", "considered", suggestion.id)).setLabel(t("Em análise")).setEmoji(emoji.flask).setStyle(ButtonStyle.Secondary).setDisabled(status === "considered" || isApproved),
            new ButtonBuilder().setCustomId(buildCustomId("suggestion", "implemented", suggestion.id)).setLabel(t("Implementar")).setEmoji(emoji.rocket).setStyle(ButtonStyle.Primary).setDisabled(status === "implemented"),
            new ButtonBuilder().setCustomId(buildCustomId("suggestion", "denied", suggestion.id)).setLabel(t("Recusar")).setEmoji(emoji.error).setStyle(ButtonStyle.Danger).setDisabled(status === "denied" || isApproved),
        )],
    });
}

function suggestionAuthorLabel(suggestion: SuggestionRecord): string {
    return suggestion.author_tag || "utilizador";
}

export function buildSuggestionContainer(suggestion: SuggestionRecord): ContainerPlusBuilder {
    const meta = STATUS_META[suggestion.status];
    const total = suggestion.upvotes + suggestion.downvotes;
    const favorPct = total > 0 ? Math.round((suggestion.upvotes / total) * 100) : 0;
    const votesValue = total > 0
        ? `${emoji.upvote} **${suggestion.upvotes}**  •  ${emoji.downvote} **${suggestion.downvotes}**  •  ${t("**{favor}%** a favor | **{against}%** contra", { favor: favorPct, against: 100 - favorPct })}`
        : `${emoji.upvote} **0**  •  ${emoji.downvote} **0**  •  ${t("*Sem votos ainda*")}`;
    const fields: ContainerField[] = [
        { name: t("Sugestão"), value: suggestion.content.slice(0, 1024) },
        { name: t("Estado"), value: `${emoji[meta.emojiName]} **${t(meta.label)}**` },
        { name: t("Votos"), value: votesValue },
    ];
    if (suggestion.staff_reason) {
        fields.push({ name: t("Resposta da equipa"), value: suggestion.staff_reason.slice(0, 1024) });
    }

    return buildContainer({
        color: meta.color,
        title: `${emoji.megaphone} ${t("Sugestão #{number} — {author}", { number: suggestion.seq, author: suggestionAuthorLabel(suggestion) })}`,
        description: t("Por {user}", { user: `<@${suggestion.author_id}>` }),
        fields,
        footerText: isTerminalSuggestion(suggestion.status) ? t("Concluída • ID {id}", { id: suggestion.id.slice(0, 8) }) : `ID ${suggestion.id.slice(0, 8)}`,
        rows: voteRows(suggestion),
    });
}

/** Archive + lock the discussion thread once a suggestion reaches a terminal state. */
export async function finalizeSuggestionThread(client: Client, suggestion: SuggestionRecord): Promise<void> {
    if (!suggestion.thread_id) return;
    try {
        const thread = await client.channels.fetch(suggestion.thread_id);
        if (thread?.isThread()) {
            await thread.setLocked(true).catch(() => null);
            await thread.setArchived(true).catch(() => null);
        }
    } catch {
        // thread gone — ignore
    }
}

export interface SubmitSuggestionInput {
    guildId: string;
    authorId: string;
    authorTag: string;
    content: string;
}

export type SubmitResult =
    | { ok: true; suggestion: SuggestionRecord }
    | { ok: false; reason: "no_channel" | "bad_channel" };

export async function submitSuggestion(client: Client, input: SubmitSuggestionInput): Promise<SubmitResult> {
    const settings = await getSuggestionSettings(input.guildId);
    if (!settings.channel) return { ok: false, reason: "no_channel" };

    const channel = await client.channels.fetch(settings.channel).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) return { ok: false, reason: "bad_channel" };

    const now = Date.now();
    const suggestion: SuggestionRecord = {
        id: randomUUID(),
        seq: 0,
        guild_id: input.guildId,
        channel_id: channel.id,
        message_id: null,
        thread_id: null,
        author_id: input.authorId,
        author_tag: input.authorTag,
        anonymous: false,
        content: input.content,
        status: "pending",
        upvotes: 0,
        downvotes: 0,
        staff_id: null,
        staff_reason: null,
        created_at: now,
        updated_at: now,
    };
    suggestion.seq = await insertSuggestion(suggestion);

    const message = await (channel as TextChannel).send({ components: [buildSuggestionContainer(suggestion)], flags: CV2_FLAG });

    let threadId: string | null = null;
    if (settings.create_threads && channel.type === ChannelType.GuildText) {
        const thread = await message.startThread({ name: t("Sugestão #{number} — {author}", { number: suggestion.seq, author: suggestionAuthorLabel(suggestion) }).slice(0, 100) }).catch(() => null);
        threadId = thread?.id ?? null;

        if (thread) {
            await thread.send({
                components: [buildContainer({
                    color: COLORS.gold,
                    title: `${emoji.megaphone} ${t("Discussão da sugestão #{number}", { number: suggestion.seq })}`,
                    description: `${emoji.heart} ${t("Olá {user}, obrigado pela tua sugestão! Criámos esta thread para discutirmos a tua ideia.", { user: `<@${suggestion.author_id}>` })}`,
                })],
                flags: CV2_FLAG,
                allowedMentions: { users: [suggestion.author_id] },
            }).catch(() => null);
        }
    }

    await updateSuggestionMessage(suggestion.id, message.id, threadId);
    suggestion.message_id = message.id;
    suggestion.thread_id = threadId;
    return { ok: true, suggestion };
}

/** Re-render the suggestion's public message after a vote or status change. */
export async function refreshSuggestionMessage(client: Client, suggestion: SuggestionRecord): Promise<void> {
    if (!suggestion.message_id) return;
    try {
        const channel = await client.channels.fetch(suggestion.channel_id);
        if (!channel?.isTextBased() || channel.isDMBased()) return;
        await (channel as TextChannel).messages.edit(suggestion.message_id, { components: [buildSuggestionContainer(suggestion)], flags: CV2_FLAG });
    } catch (error) {
        logger.error("Falha ao atualizar mensagem de sugestão:", error);
    }
}

export async function getSuggestion(id: string): Promise<SuggestionRecord | null> {
    return getSuggestionById(id);
}
