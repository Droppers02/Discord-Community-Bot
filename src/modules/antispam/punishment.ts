import { PermissionFlagsBits, type Guild, type GuildMember, type Message } from "discord.js";
import { logger } from "../../lib/logger.js";
import type { AntiSpamAction, AntiSpamSettings } from "../../types.js";
import { timeoutForOffense } from "./antiSpamEngine.js";
import { t } from "../../lib/i18n.js";

// Aplicação da punição escolhida pelo administrador (/config → Anti-spam) e limpeza das
// mensagens recentes do infrator (texto, imagens e links), não só a que disparou a deteção.

/** Mensagens com mais de 14 dias não podem ir por bulkDelete (limite do Discord). */
const BULK_DELETE_MAX_AGE_MS = 14 * 86_400_000;
const PURGE_FETCH_LIMIT = 100;

export interface PunishmentOutcome {
    action: AntiSpamAction;
    /** Descrição pronta a mostrar nos logs/aviso (ex.: "timeout 10min", "expulso"). */
    detail: string;
    /** Timeout aplicado, quando a ação foi `timeout` (para o log de auditoria). */
    timeoutMs: number | null;
    /** Mensagens do infrator apagadas além da que disparou a deteção. */
    purged: number;
    /** Preenchido quando a punição falhou (permissões/hierarquia). */
    error: string | null;
}

function formatMinutes(ms: number): string {
    const minutes = Math.round(ms / 60_000);
    if (minutes % 1440 === 0) return `${minutes / 1440}d`;
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes}min`;
}

/**
 * Apaga as mensagens recentes do infrator nos canais onde esteve ativo — é isto que tira
 * do servidor as imagens e os links que ele despejou, e não apenas a última mensagem.
 */
export async function purgeRecentMessages(
    guild: Guild,
    userId: string,
    channelIds: Iterable<string>,
    windowMinutes: number,
): Promise<number> {
    const cutoff = Date.now() - Math.max(1, windowMinutes) * 60_000;
    let purged = 0;

    for (const channelId of new Set(channelIds)) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) continue;

        const me = guild.members.me;
        if (!me || !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages)) continue;

        try {
            const recent = await channel.messages.fetch({ limit: PURGE_FETCH_LIMIT });
            const mine = [...recent.values()].filter((message: Message) =>
                message.author.id === userId
                && message.createdTimestamp >= cutoff
                && Date.now() - message.createdTimestamp < BULK_DELETE_MAX_AGE_MS);
            if (mine.length === 0) continue;

            const deleted = await channel.bulkDelete(mine, true);
            purged += deleted.size;
        } catch (error) {
            logger.warn(`Anti-spam: falha a purgar mensagens em ${channelId}:`, error);
        }
    }
    return purged;
}

/** Aplica a punição configurada. Nunca lança — devolve o erro em `error`. */
export async function applyPunishment(
    member: GuildMember,
    settings: AntiSpamSettings,
    reason: string,
    offenses: number,
): Promise<PunishmentOutcome> {
    const outcome: PunishmentOutcome = {
        action: settings.action,
        detail: "",
        timeoutMs: null,
        purged: 0,
        error: null,
    };
    const auditReason = `Anti-spam: ${reason}`.slice(0, 500);

    try {
        switch (settings.action) {
            case "delete":
                outcome.detail = t("mensagens apagadas");
                break;

            case "timeout": {
                const timeoutMs = timeoutForOffense(offenses);
                await member.timeout(timeoutMs, auditReason);
                outcome.timeoutMs = timeoutMs;
                outcome.detail = `timeout ${formatMinutes(timeoutMs)}`;
                break;
            }

            case "quarantine": {
                if (!settings.quarantine_role) {
                    outcome.error = t("Cargo de castigo não configurado.");
                    break;
                }
                await member.roles.add(settings.quarantine_role, auditReason);
                outcome.detail = t("cargo de castigo aplicado");
                break;
            }

            case "kick":
                await member.kick(auditReason);
                outcome.detail = "expulso";
                break;

            case "ban":
                // As mensagens são apagadas pela purga (que corre antes), por isso não é
                // preciso pedir ao Discord para apagar histórico no próprio ban.
                await member.ban({ reason: auditReason });
                outcome.detail = "banido";
                break;
        }
    } catch (error) {
        outcome.error = error instanceof Error ? error.message : t("erro desconhecido");
        logger.warn(`Anti-spam: falha a aplicar "${settings.action}" a ${member.id} (verifica permissões/hierarquia):`, error);
    }

    return outcome;
}
