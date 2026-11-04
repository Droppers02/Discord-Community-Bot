import type { BaseInteraction } from "discord.js";
import { appendAuditLog } from "../services/auditService.js";
import { logger } from "./logger.js";

// Diagnóstico das interações em mensagem privada (revisão de bans): quando chegam ao bot, quanto
// tempo depois do clique, e como acabaram. Fica no log da Railway e no audit_log
// (action "diag.dm.<etapa>"), para se perceber porque é que o Discord mostra "interaction failed".

function routeOf(interaction: BaseInteraction): string {
    const data = interaction as unknown as { commandName?: unknown; customId?: unknown };
    if (typeof data.commandName === "string") return `cmd:${data.commandName}`;
    if (typeof data.customId === "string") return data.customId;
    return `type:${interaction.type}`;
}

export function noteDmInteraction(interaction: BaseInteraction, stage: string, extra: Record<string, unknown> = {}): void {
    if (interaction.guildId) return;
    const route = routeOf(interaction);
    const ageMs = Date.now() - interaction.createdTimestamp;
    logger.info(`[DM] ${stage} ${route} — ${ageMs} ms depois do clique`, Object.keys(extra).length ? extra : "");
    appendAuditLog({ guildId: null, actorId: interaction.user.id, action: `diag.dm.${stage}`, details: { route, ageMs, ...extra } });
}
