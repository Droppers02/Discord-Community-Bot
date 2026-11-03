import { installConsoleRedaction } from "./redact.js";

// Importado PRIMEIRO no index.ts: a partir daqui nenhum segredo do ambiente (tokens,
// chaves, passwords) aparece na consola — nem no nosso logger, nem no que o framework
// ou as bibliotecas escrevem. Ver redact.ts.
installConsoleRedaction(process.env);
