import { describe, expect, it } from "vitest";
import {
    buildTicketChannelName,
    DEFAULT_TICKET_NAME_FORMAT,
    normalizeTicketNameFormat,
    uniqueTicketChannelName,
} from "../../src/modules/tickets/ticketNaming.js";

describe("nome do canal do ticket", () => {
    const parts = { category: "Suporte", number: 6, username: "droppers02" };

    it("por omissão é categoria + nome, sem o número", () => {
        expect(DEFAULT_TICKET_NAME_FORMAT).toBe("category-user");
        expect(buildTicketChannelName({ ...parts, format: "category-user" })).toBe("suporte-droppers02");
    });

    it("segue o formato escolhido", () => {
        expect(buildTicketChannelName({ ...parts, format: "category-number" })).toBe("suporte-0006");
        expect(buildTicketChannelName({ ...parts, format: "category-number-user" })).toBe("suporte-0006-droppers02");
    });

    it("usa o nome da categoria (com acentos e espaços) e não o id", () => {
        expect(buildTicketChannelName({ ...parts, category: "Denúncias Graves", format: "category-user" })).toBe("denuncias-graves-droppers02");
    });

    it("nomes sem letras latinas (árabe, japonês, russo…) usam o id da categoria", () => {
        expect(buildTicketChannelName({ ...parts, category: "Поддержка", categoryId: "suporte", format: "category-user" })).toBe("suporte-droppers02");
        expect(buildTicketChannelName({ ...parts, category: "サポート", format: "category-number" })).toBe("ticket-0006");
    });

    it("sem número, os formatos com número caem para categoria + nome", () => {
        expect(buildTicketChannelName({ ...parts, number: null, format: "category-number" })).toBe("suporte-droppers02");
        expect(buildTicketChannelName({ ...parts, number: null, format: "category-number-user" })).toBe("suporte-droppers02");
    });

    it("deixa folga para o sufixo dentro dos 100 caracteres", () => {
        const name = buildTicketChannelName({ ...parts, username: "x".repeat(120), format: "category-user" });
        expect(name.length).toBeLessThanOrEqual(96);
        expect(name.endsWith("-")).toBe(false);
    });

    it("valores desconhecidos voltam ao formato por omissão", () => {
        expect(normalizeTicketNameFormat("category-number")).toBe("category-number");
        expect(normalizeTicketNameFormat("qualquer")).toBe("category-user");
        expect(normalizeTicketNameFormat(null)).toBe("category-user");
    });
});

describe("tickets repetidos da mesma pessoa", () => {
    it("o primeiro fica sem sufixo", () => {
        expect(uniqueTicketChannelName("suporte-droppers02", [])).toBe("suporte-droppers02");
        expect(uniqueTicketChannelName("suporte-droppers02", ["duvidas-droppers02"])).toBe("suporte-droppers02");
    });

    it("os seguintes levam -2, -3…", () => {
        expect(uniqueTicketChannelName("suporte-droppers02", ["suporte-droppers02"])).toBe("suporte-droppers02-2");
        expect(uniqueTicketChannelName("suporte-droppers02", ["suporte-droppers02", "suporte-droppers02-2"])).toBe("suporte-droppers02-3");
    });

    it("reaproveita o lugar livre quando um dos anteriores fecha", () => {
        expect(uniqueTicketChannelName("suporte-droppers02", ["suporte-droppers02-2"])).toBe("suporte-droppers02");
        expect(uniqueTicketChannelName("suporte-droppers02", ["suporte-droppers02", "suporte-droppers02-3"])).toBe("suporte-droppers02-2");
    });
});
