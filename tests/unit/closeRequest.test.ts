import { describe, expect, it } from "vitest";
import { getDelayHours, getNextReminderAt } from "../../src/modules/tickets/closeRequestManager.js";
import type { TicketRecord } from "../../src/types.js";

function makeTicket(overrides: Partial<TicketRecord>): TicketRecord {
    return {
        id: "t1", guild_id: "g1", channel_id: "c1", ticket_message_id: null,
        owner_id: "o1", owner_tag: "o#1", staff_id: null, staff_tag: null,
        category: "reportar", reason: "r", clip_url: null, form_responses_json: null,
        status: "open", player_identifier: null, internal_note: null, transcript_id: null,
        first_response_at: null, close_request_message: null, close_requested_by_id: null,
        close_requested_by_tag: null, close_requested_at: null, close_request_deadline_at: null,
        close_request_last_reminder_at: null, created_at: new Date().toISOString(), closed_at: null,
        ...overrides,
    };
}

describe("getDelayHours", () => {
    it("defaults to 120h when empty", () => {
        expect(getDelayHours("")).toBe(120);
        expect(getDelayHours(null)).toBe(120);
    });

    it("accepts values at or above the 12h minimum", () => {
        expect(getDelayHours("200")).toBe(200);
        expect(getDelayHours("12")).toBe(12);
    });

    it("rejects values below the minimum or non-numeric", () => {
        expect(() => getDelayHours("5")).toThrow();
        expect(() => getDelayHours("abc")).toThrow();
    });
});

describe("getNextReminderAt", () => {
    it("returns null without a pending close request", () => {
        expect(getNextReminderAt(makeTicket({}))).toBeNull();
    });

    it("schedules a reminder 6h before the deadline for short windows", () => {
        const now = Date.now();
        const ticket = makeTicket({
            close_requested_at: new Date(now).toISOString(),
            close_request_deadline_at: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        });
        const reminder = getNextReminderAt(ticket);
        expect(reminder).not.toBeNull();
        // deadline - 6h ≈ now + 6h
        expect(Math.abs((reminder as Date).getTime() - (now + 6 * 60 * 60 * 1000))).toBeLessThan(2000);
    });

    it("stops reminding short windows once a reminder was sent", () => {
        const now = Date.now();
        const ticket = makeTicket({
            close_requested_at: new Date(now).toISOString(),
            close_request_deadline_at: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
            close_request_last_reminder_at: new Date(now).toISOString(),
        });
        expect(getNextReminderAt(ticket)).toBeNull();
    });

    it("schedules daily reminders for long windows", () => {
        const now = Date.now();
        const ticket = makeTicket({
            close_requested_at: new Date(now).toISOString(),
            close_request_deadline_at: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        });
        const reminder = getNextReminderAt(ticket);
        expect(reminder).not.toBeNull();
        expect(Math.abs((reminder as Date).getTime() - (now + 24 * 60 * 60 * 1000))).toBeLessThan(2000);
    });
});
