import { describe, expect, it } from "vitest";
import { ComponentType, GuildPremiumTier } from "discord.js";
import { isDiscordCdnUrl, planBatches, safeFileName, uploadLimitFor } from "../../src/lib/formAttachments.js";
import { buildOpenTicketModal } from "../../src/modules/tickets/ticketForm.js";
import { getTicketForm } from "../../src/modules/tickets/forms.js";

const MB = 1024 * 1024;

describe("anexos do formulário: envio para o canal", () => {
    it("o limite segue o nível de boost do servidor", () => {
        expect(uploadLimitFor(GuildPremiumTier.None)).toBe(10 * MB);
        expect(uploadLimitFor(GuildPremiumTier.Tier1)).toBe(10 * MB);
        expect(uploadLimitFor(GuildPremiumTier.Tier2)).toBe(50 * MB);
        expect(uploadLimitFor(GuildPremiumTier.Tier3)).toBe(100 * MB);
    });

    it("agrupa em mensagens que cabem no limite e separa o que não cabe sozinho", () => {
        const files = [{ size: 4 * MB }, { size: 4 * MB }, { size: 4 * MB }, { size: 12 * MB }, { size: 1 * MB }];
        const { batches, tooLarge } = planBatches(files, 10 * MB);
        expect(tooLarge).toEqual([{ size: 12 * MB }]);
        expect(batches.map((b) => b.length)).toEqual([2, 2]);
        for (const batch of batches) expect(batch.reduce((s, f) => s + f.size, 0)).toBeLessThanOrEqual(10 * MB);
    });

    it("nunca mais de 10 ficheiros por mensagem", () => {
        const { batches } = planBatches(Array.from({ length: 13 }, () => ({ size: 1 })), 10 * MB);
        expect(batches.map((b) => b.length)).toEqual([10, 3]);
    });

    it("só descarrega do CDN do Discord", () => {
        expect(isDiscordCdnUrl("https://cdn.discordapp.com/ephemeral-attachments/1/2/a.png?ex=1")).toBe(true);
        expect(isDiscordCdnUrl("https://media.discordapp.net/attachments/1/2/a.png")).toBe(true);
        expect(isDiscordCdnUrl("http://cdn.discordapp.com/a.png")).toBe(false);
        expect(isDiscordCdnUrl("https://cdn.discordapp.com.evil.test/a.png")).toBe(false);
        expect(isDiscordCdnUrl("https://169.254.169.254/latest")).toBe(false);
        expect(isDiscordCdnUrl("nao é url")).toBe(false);
    });

    it("dá nomes seguros e únicos, mantendo a extensão", () => {
        expect(safeFileName("Captura de ecrã 2026.PNG", 0)).toBe("1-Captura-de-ecra-2026.png");
        expect(safeFileName("../../etc/passwd", 1)).toBe("2-etc-passwd");
        expect(safeFileName(".png", 2)).toBe("3-anexo.png");
    });
});

describe("campo de anexos no formulário do ticket", () => {
    const categories = JSON.stringify([{ id: "geral", label: "Geral" }]);
    const configWith = (fields: unknown[]) => ({
        ticket_categories_json: categories,
        ticket_forms_json: JSON.stringify([{ category_id: "geral", preset: "general_support", modal_title: "Geral", fields }]),
    });

    it("vira um upload de ficheiros no modal, com o máximo limitado a 1–10", () => {
        for (const [stored, expected] of [[3, 3], [0, 5], [50, 10], [undefined, 5]] as const) {
            const config = configWith([{ id: "prints", type: "file", label: "Prints", required: false, max_files: stored }]);
            expect(getTicketForm(config, "geral")!.fields[0].max_files).toBe(expected);
            const modal = buildOpenTicketModal(config, "geral").toJSON();
            const label = modal.components[0] as { component: { type: number; max_values?: number; required?: boolean } };
            expect(label.component.type).toBe(ComponentType.FileUpload);
            expect(label.component.max_values).toBe(expected);
            expect(label.component.required).toBe(false);
        }
    });

    it("limite 0 do painel do site é o máximo do Discord, não 1 carácter", () => {
        const config = configWith([{ id: "motivo", type: "paragraph", label: "Motivo", required: true, max_length: 0 }]);
        expect(getTicketForm(config, "geral")!.fields[0].max_length).toBe(4000);
    });

    it("o formulário de denúncia por omissão já aceita prints", () => {
        const config = { ticket_categories_json: JSON.stringify([{ id: "denuncia", label: "Denúncia" }]), ticket_forms_json: null };
        const form = getTicketForm(config, "denuncia")!;
        expect(form.fields.some((field) => field.type === "file" && !field.required)).toBe(true);
        expect(form.fields.length).toBeLessThanOrEqual(5);
        expect(() => buildOpenTicketModal(config, "denuncia").toJSON()).not.toThrow();
    });
});
