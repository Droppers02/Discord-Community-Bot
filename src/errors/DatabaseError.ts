import { BotError, type BotErrorOptions } from "./BotError.js";
import { t } from "../lib/i18n.js";

export class DatabaseError extends BotError {
    constructor(userMessage = t("Ocorreu um erro de base de dados. Tenta novamente daqui a pouco."), options: BotErrorOptions = {}) {
        super(userMessage, { code: "DATABASE_ERROR", ...options });
    }
}
