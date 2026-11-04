import { ApplicationIntegrationType, ButtonBuilder, ButtonStyle, type Client } from "discord.js";
import { row, type Row } from "../../lib/containers.js";
import { ei } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";

// Como é que alguém banido fala com o bot.
//
// O Discord só entrega ao bot os cliques e os comandos de quem partilha um servidor com ele (e só
// deixa o bot mandar DMs nesse caso) — e quem é banido deixa de partilhar o servidor da EPA. Foi por
// isso que o botão na DM do ban dava "This interaction failed": o clique nunca chegava ao bot
// (confirmado com o diagnóstico diag.dm.* em 4 nov 2026).
//
// A saída, sem servidor extra: a pessoa ADICIONA O BOT À PRÓPRIA CONTA ("User Install" — só dá ao
// bot os comandos, nenhuma permissão). A partir daí o /apelo aparece-lhe na DM com o bot e os botões
// das respostas do /apelo chegam ao bot. Tem de estar ligado em Developer Portal → Installation →
// Installation Contexts → User Install.

/** Link para a pessoa adicionar o bot à conta (só comandos, sem permissões). */
export function userInstallUrl(clientId: string): string {
    return `https://discord.com/oauth2/authorize?client_id=${clientId}&integration_type=${ApplicationIntegrationType.UserInstall}&scope=applications.commands`;
}

let cached: { enabled: boolean; at: number } | null = null;

/** A instalação na conta (User Install) está ligada na aplicação? */
export async function userInstallEnabled(client: Client): Promise<boolean> {
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.enabled;
    const app = await client.application?.fetch().catch(() => null);
    const enabled = Boolean(app?.integrationTypesConfig?.[ApplicationIntegrationType.UserInstall]);
    cached = { enabled, at: Date.now() };
    return enabled;
}

/** Texto e botões da DM do ban: 1) adicionar o bot à conta, 2) pedir a revisão. */
export function banAppealNotice(client: Client, guildId: string): { text: string; row: Row } {
    return {
        text: [
            t("**Achas que foi injusto? Pede a revisão do ban:**"),
            t("1. Carrega em **Adicionar o bot à minha conta** e confirma (o Discord só te deixa falar com o bot assim, agora que já não estás no servidor; o bot não fica com nenhuma permissão)."),
            t("2. Volta a esta conversa e escreve `/apelo` (ou carrega em **Pedir revisão do ban**)."),
            t("-# É também no `/apelo` que vês a resposta da equipa."),
        ].join("\n"),
        row: row(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(userInstallUrl(client.user?.id ?? client.application?.id ?? "")).setLabel(t("Adicionar o bot à minha conta")),
            new ButtonBuilder().setCustomId(`appeal/start/${guildId}`).setLabel(t("Pedir revisão do ban")).setEmoji(ei("receipt")).setStyle(ButtonStyle.Primary),
        ),
    };
}
