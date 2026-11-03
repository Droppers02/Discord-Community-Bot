import type {
    Message,
    MessageComponentInteraction,
    ModalSubmitInteraction,
    RepliableInteraction,
} from "discord.js";

/**
 * Lifecycle helpers for ephemeral messages, in two tiers:
 *  - Interactive panels (/config, /dashboard-staff, /transcripts, …) auto-close after 5 min of
 *    INACTIVITY — every interaction with the panel resets the countdown, and a modal opened from
 *    the panel holds it open until it's submitted (until 2026-11-02 it was 60s with no hold, so
 *    taking a minute to fill e.g. the SLA targets closed /config and lost the save).
 *  - Short notices/confirmations auto-close after 15s.
 */

const PANEL_INACTIVITY_MS = 5 * 60_000;
const NOTICE_LIFETIME_MS = 15_000;
// Interaction tokens last 15 min, so that's the longest a modal can be on screen.
const MODAL_HOLD_MS = 14 * 60_000;

type Deleter = () => Promise<unknown>;

interface PanelEntry {
    timer: NodeJS.Timeout;
    /** Deletes with the token that registered the panel (valid for 15 min). */
    del: Deleter;
    /** Deletes with the newest interaction's token — tried first, `del` is the fallback. */
    latest?: Deleter;
    holdUntil?: number; // epoch ms until which the panel must not be shortened (modal open)
}

const panels = new Map<string, PanelEntry>();
// Only the first touch of an interaction counts (it can reach here more than once).
const touched = new WeakSet<object>();

function schedulePanel(messageId: string, del: Deleter, ms: number = PANEL_INACTIVITY_MS, holdUntil?: number, latest?: Deleter): void {
    const existing = panels.get(messageId);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
        panels.delete(messageId);
        const attempt = latest ? latest().catch(() => del()) : del();
        Promise.resolve(attempt).catch(() => null);
    }, ms);
    timer.unref?.();
    panels.set(messageId, { timer, del, latest, holdUntil });
}

/** Register a freshly-sent ephemeral panel (command/modal reply) for inactivity auto-close. */
export async function registerEphemeralPanel(interaction: RepliableInteraction): Promise<void> {
    try {
        const msg = await interaction.fetchReply();
        schedulePanel(msg.id, () => interaction.deleteReply());
    } catch {
        // reply not available — ignore
    }
}

/** Register an ephemeral panel sent as a follow-up. */
export function registerEphemeralFollowup(interaction: RepliableInteraction, message: Message): void {
    schedulePanel(message.id, () => interaction.webhook.deleteMessage(message.id));
}

/**
 * Called by the responder middleware, before the responder runs. On a registered panel it resets
 * the inactivity countdown, makes any modal the responder opens hold the panel open, and keeps the
 * newest token for the clean-up (the command's own token expires after 15 min).
 */
export function touchEphemeralPanel(interaction: MessageComponentInteraction | ModalSubmitInteraction): void {
    if (touched.has(interaction)) return;
    touched.add(interaction);
    const messageId = interaction.message?.id;
    if (!messageId) return;
    const entry = panels.get(messageId);
    if (!entry) return;

    if (interaction.isMessageComponent()) {
        const showModal = interaction.showModal.bind(interaction) as (...args: unknown[]) => Promise<unknown>;
        (interaction as unknown as { showModal: (...args: unknown[]) => Promise<unknown> }).showModal = async (...args: unknown[]) => {
            const result = await showModal(...args);
            const current = panels.get(messageId);
            if (current) schedulePanel(messageId, current.del, MODAL_HOLD_MS, Date.now() + MODAL_HOLD_MS, current.latest);
            return result;
        };
    }

    const latest: Deleter = () => interaction.webhook.deleteMessage(messageId);
    // A modal submit ends the hold; any other click while a modal is open doesn't shorten it.
    if (!interaction.isModalSubmit() && entry.holdUntil && Date.now() < entry.holdUntil) {
        schedulePanel(messageId, entry.del, entry.holdUntil - Date.now(), entry.holdUntil, latest);
        return;
    }
    schedulePanel(messageId, entry.del, PANEL_INACTIVITY_MS, undefined, latest);
}

/** Schedule a short-lived notice/confirmation ephemeral to be removed after ~15s. */
export function scheduleNoticeAutoClose(interaction: RepliableInteraction, messageId: string, ms: number = NOTICE_LIFETIME_MS): void {
    const timer = setTimeout(() => {
        interaction.webhook.deleteMessage(messageId).catch(() => null);
    }, ms);
    timer.unref?.();
}
