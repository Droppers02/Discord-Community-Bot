import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasCooldown, setCooldown } from "../../src/modules/tickets/ticketManager.js";

describe("ticket cooldown", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("is active right after being set and expires after 60s", () => {
        setCooldown("user-1");
        expect(hasCooldown("user-1")).toBe(true);

        vi.advanceTimersByTime(59_000);
        expect(hasCooldown("user-1")).toBe(true);

        vi.advanceTimersByTime(2_000);
        expect(hasCooldown("user-1")).toBe(false);
    });

    it("is independent per user", () => {
        setCooldown("user-a");
        expect(hasCooldown("user-a")).toBe(true);
        expect(hasCooldown("user-b")).toBe(false);
    });
});
