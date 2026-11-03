import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEphemeralPanel, touchEphemeralPanel } from "../../src/lib/ephemeralLifecycle.js";

const MIN = 60_000;
let nextId = 0;

async function openPanel() {
    const id = `panel-${++nextId}`;
    const command = { deleteReply: vi.fn(async () => undefined), fetchReply: vi.fn(async () => ({ id })) };
    await registerEphemeralPanel(command as never);
    return { id, command };
}

function panelClick(messageId: string, kind: "component" | "modal" = "component") {
    return {
        message: { id: messageId },
        isMessageComponent: () => kind === "component",
        isModalSubmit: () => kind === "modal",
        showModal: vi.fn(async () => undefined),
        webhook: { deleteMessage: vi.fn(async () => undefined) },
    };
}

describe("painéis efémeros do /config", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("fecham ao fim de 5 minutos sem uso", async () => {
        const { command } = await openPanel();
        await vi.advanceTimersByTimeAsync(5 * MIN - 1_000);
        expect(command.deleteReply).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2_000);
        expect(command.deleteReply).toHaveBeenCalledTimes(1);
    });

    it("um modal aberto a partir do painel segura-o até ser enviado", async () => {
        const { id, command } = await openPanel();
        const click = panelClick(id);
        touchEphemeralPanel(click as never);
        await (click as unknown as { showModal: (modal: unknown) => Promise<unknown> }).showModal({});
        await vi.advanceTimersByTimeAsync(12 * MIN);
        expect(click.webhook.deleteMessage).not.toHaveBeenCalled();
        expect(command.deleteReply).not.toHaveBeenCalled();

        const submit = panelClick(id, "modal");
        touchEphemeralPanel(submit as never);
        await vi.advanceTimersByTimeAsync(5 * MIN + 1_000);
        expect(submit.webhook.deleteMessage).toHaveBeenCalledWith(id);
    });
});
