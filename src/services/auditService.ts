import { insertAuditLog, type AuditLogInput } from "../repositories/auditRepository.js";
import { logger } from "../lib/logger.js";

/**
 * Records an administrative action. Fire-and-forget: a failure to write the audit
 * trail must never break the user-facing flow, so it is logged and swallowed.
 */
export function appendAuditLog(entry: AuditLogInput): void {
    void insertAuditLog(entry, Date.now()).catch((err) => logger.error("Falha ao gravar audit log:", err));
}
