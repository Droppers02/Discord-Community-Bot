import { randomUUID } from "node:crypto";
import type { GuildConfig, TicketMacro } from "../../types.js";

export const MAX_MACROS = 20;
const MAX_NAME = 60;
const MAX_CONTENT = 1800;

type MacroConfigInput = Pick<GuildConfig, "ticket_macros_json"> | { ticket_macros_json?: string | null };

function normalizeMacros(input: unknown): TicketMacro[] {
    if (!Array.isArray(input)) return [];
    const usedIds = new Set<string>();
    return input
        .slice(0, MAX_MACROS)
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const name = typeof (entry as { name?: unknown }).name === "string" ? (entry as { name: string }).name.trim() : "";
            const content = typeof (entry as { content?: unknown }).content === "string" ? (entry as { content: string }).content : "";
            if (!name || !content.trim()) return null;
            let id = typeof (entry as { id?: unknown }).id === "string" && (entry as { id: string }).id.trim() ? (entry as { id: string }).id : randomUUID();
            while (usedIds.has(id)) id = randomUUID();
            usedIds.add(id);
            return { id, name: name.slice(0, MAX_NAME), content: content.slice(0, MAX_CONTENT) } satisfies TicketMacro;
        })
        .filter((entry): entry is TicketMacro => Boolean(entry));
}

export function getTicketMacros(config?: MacroConfigInput | null): TicketMacro[] {
    if (!config?.ticket_macros_json) return [];
    try {
        return normalizeMacros(JSON.parse(config.ticket_macros_json));
    } catch {
        return [];
    }
}

export function serializeTicketMacros(macros: TicketMacro[]): string {
    return JSON.stringify(macros.slice(0, MAX_MACROS).map((macro) => ({
        id: macro.id,
        name: macro.name.trim().slice(0, MAX_NAME),
        content: macro.content.slice(0, MAX_CONTENT),
    })));
}

export function findMacro(config: MacroConfigInput | null | undefined, macroId: string): TicketMacro | null {
    return getTicketMacros(config).find((macro) => macro.id === macroId) ?? null;
}

export function upsertMacro(macros: TicketMacro[], macro: { id?: string; name: string; content: string }): TicketMacro[] {
    const clean: TicketMacro = { id: macro.id ?? randomUUID(), name: macro.name.trim().slice(0, MAX_NAME), content: macro.content.slice(0, MAX_CONTENT) };
    const index = macros.findIndex((entry) => entry.id === clean.id);
    if (index >= 0) {
        const copy = [...macros];
        copy[index] = clean;
        return copy;
    }
    return [...macros, clean].slice(0, MAX_MACROS);
}

export function removeMacro(macros: TicketMacro[], macroId: string): TicketMacro[] {
    return macros.filter((macro) => macro.id !== macroId);
}
