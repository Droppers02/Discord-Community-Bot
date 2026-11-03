import { describe, expect, it } from "vitest";
import {
    formatSupportWindow,
    formatSupportWindowPlain,
    isWithinSupportHours,
    supportWindowInstants,
    type SupportHours,
} from "../../src/modules/tickets/officeHours.js";

// O horário de atendimento passou a ser mostrado como timestamp do Discord: cada pessoa
// vê a hora no seu próprio relógio. Estes testes fixam a conversão hora-de-parede → epoch,
// que é onde mora o risco (fusos, horário de verão e janelas que atravessam a meia-noite).

const lisbon: SupportHours = { enabled: true, tz: "Europe/Lisbon", start: "09:00", end: "21:00" };

describe("supportWindowInstants", () => {
    it("converte a janela do dia para instantes reais no fuso configurado", () => {
        // Em setembro Lisboa está em UTC+1 → 09:00 locais são 08:00 UTC.
        const { start, end } = supportWindowInstants(lisbon, new Date("2026-09-17T12:00:00Z"));
        expect(new Date(start * 1000).toISOString()).toBe("2026-09-17T08:00:00.000Z");
        expect(new Date(end * 1000).toISOString()).toBe("2026-09-17T20:00:00.000Z");
    });

    it("respeita a mudança para hora de inverno (UTC+0 em janeiro)", () => {
        const { start, end } = supportWindowInstants(lisbon, new Date("2026-01-15T12:00:00Z"));
        expect(new Date(start * 1000).toISOString()).toBe("2026-01-15T09:00:00.000Z");
        expect(new Date(end * 1000).toISOString()).toBe("2026-01-15T21:00:00.000Z");
    });

    it("aponta para o dia seguinte quando a janela de hoje já fechou", () => {
        const { start, end } = supportWindowInstants(lisbon, new Date("2026-09-17T22:30:00Z"));
        expect(new Date(start * 1000).toISOString()).toBe("2026-09-18T08:00:00.000Z");
        expect(new Date(end * 1000).toISOString()).toBe("2026-09-18T20:00:00.000Z");
    });

    it("trata janelas que atravessam a meia-noite", () => {
        const overnight: SupportHours = { enabled: true, tz: "Europe/Lisbon", start: "22:00", end: "08:00" };
        const { start, end } = supportWindowInstants(overnight, new Date("2026-09-17T23:30:00Z"));
        expect(end).toBeGreaterThan(start);
        expect((end - start) / 3600).toBe(10);
    });

    it("usa o fuso do servidor, não o da máquina", () => {
        const saoPaulo: SupportHours = { enabled: true, tz: "America/Sao_Paulo", start: "09:00", end: "18:00" };
        const { start } = supportWindowInstants(saoPaulo, new Date("2026-09-17T12:00:00Z"));
        expect(new Date(start * 1000).toISOString()).toBe("2026-09-17T12:00:00.000Z"); // UTC-3
    });
});

describe("formatSupportWindow", () => {
    it("rende timestamps do Discord, para a hora ser a de quem lê", () => {
        const rendered = formatSupportWindow(lisbon, new Date("2026-09-17T12:00:00Z"));
        expect(rendered).toBe("das <t:1789632000:t> às <t:1789675200:t>");
    });

    it("mantém o horário oficial legível em texto simples", () => {
        expect(formatSupportWindowPlain(lisbon)).toBe("09:00–21:00 · Lisboa");
    });
});

describe("isWithinSupportHours", () => {
    it("continua a decidir dentro/fora pelo fuso configurado", () => {
        expect(isWithinSupportHours(lisbon, new Date("2026-09-17T12:00:00Z"))).toBe(true);
        expect(isWithinSupportHours(lisbon, new Date("2026-09-17T22:30:00Z"))).toBe(false);
    });
});
