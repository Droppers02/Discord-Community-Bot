import { setupCreators } from "@constatic/base";
import { MessageFlags, type ApplicationCommandDataResolvable, type MessageComponentInteraction, type ModalSubmitInteraction, type RepliableInteraction } from "discord.js";
import { randomUUID } from "node:crypto";
import { isAllowedGuild } from "../config.js";
import { noticeContainer } from "../lib/containers.js";
import { CV2_FLAG } from "../lib/discord.js";
import { emoji } from "../lib/emojis.js";
import { scheduleNoticeAutoClose, touchEphemeralPanel } from "../lib/ephemeralLifecycle.js";
import { t } from "../lib/i18n.js";
import { handleInteractionError } from "../lib/interactionError.js";
import { enterInteractionContext, runWithRequestContext } from "../lib/requestContext.js";

// O EPA BOTCHI é privado: só responde nos servidores do .env (GUILD_ID + EXTRA_GUILD_IDS).
// Se alguém o adicionar a outro servidor, os comandos não aparecem lá (são registados só
// nestes servidores) e qualquer interação perdida recebe este aviso.
async function replyPrivateNotice(interaction: RepliableInteraction): Promise<void> {
    await interaction.reply({
        components: [noticeContainer({
            title: `${emoji.lock} ${t("Bot privado")}`,
            description: t("O EPA BOTCHI só funciona no servidor da EPA."),
        })],
        flags: CV2_FLAG | MessageFlags.Ephemeral,
    }).catch(() => null);
    const msg = await interaction.fetchReply().catch(() => null);
    if (msg) scheduleNoticeAutoClose(interaction, msg.id);
}

const creators = setupCreators({
    commands: {
        // O @constatic/base regista os comandos no GUILD_ID. Os servidores extra são registados
        // no clientReady (registerExtraGuildCommands) e só se o bot lá estiver — se o constatic
        // tentasse um servidor onde o bot não está, o erro travava o resto do arranque.
        middleware: async (interaction, block) => {
            enterInteractionContext(interaction);
            if (interaction.guildId && isAllowedGuild(interaction.guildId)) return;
            block();
            await replyPrivateNotice(interaction as RepliableInteraction);
        },
        onError: (error, interaction) => {
            void handleInteractionError(interaction as RepliableInteraction, error);
        },
    },
    responders: {
        middleware: async (interaction, block) => {
            enterInteractionContext(interaction);
            touchEphemeralPanel(interaction as MessageComponentInteraction | ModalSubmitInteraction);
            // Interações em mensagens privadas (avaliação de tickets, modmail) não têm servidor.
            if (!interaction.guildId || isAllowedGuild(interaction.guildId)) return;
            block();
            await replyPrivateNotice(interaction as RepliableInteraction);
        },
        onError: (error, interaction) => {
            void handleInteractionError(interaction as RepliableInteraction, error);
        },
    },
});

export const { createResponder } = creators;

// Dados de cada comando (já normalizados pelo constatic), para registar nos servidores extra.
const commandData: Array<Record<string, unknown>> = [];

export const createCommand: typeof creators.createCommand = (data) => {
    const command = creators.createCommand(data);
    commandData.push(command.data as unknown as Record<string, unknown>);
    return command;
};

/** Os comandos no formato da API (sem os handlers). Nenhum comando usa .subcommand()/.group(). */
export function commandPayload(): ApplicationCommandDataResolvable[] {
    return commandData.map(({ run: _run, autocomplete: _autocomplete, ...rest }) => rest as unknown as ApplicationCommandDataResolvable);
}

/** Evento sem o filtro de servidores (só para casos como o guildCreate de servidores alheios). */
export const createRawEvent = creators.createEvent;

// Eventos correm fora de uma interação: ganham um contexto próprio (correlationId e servidor
// nos logs). Procura-se o servidor nos argumentos (guild, member.guild, message.guildId, …).
function guildIdOf(args: unknown[]): string | null {
    for (const arg of args.slice(0, 2)) {
        const value = arg as { id?: unknown; guildId?: unknown; guild?: { id?: unknown } | null; members?: unknown; channels?: unknown } | null;
        if (!value || typeof value !== "object") continue;
        if (typeof value.guildId === "string") return value.guildId;
        if (value.guild && typeof value.guild.id === "string") return value.guild.id;
        if (value.members && value.channels && typeof value.id === "string") return value.id; // Guild
    }
    return null;
}

export const createEvent: typeof creators.createEvent = (data) => {
    const original = (data as unknown as { run: (...args: unknown[]) => unknown }).run;
    const run = async (...args: unknown[]) => {
        const guildId = guildIdOf(args);
        if (!guildId) return original(...args);
        // Eventos de servidores que não são os nossos são ignorados (bot privado).
        if (!isAllowedGuild(guildId)) return;
        return runWithRequestContext({ correlationId: randomUUID(), guildId }, () => original(...args));
    };
    return creators.createEvent({ ...data, run } as typeof data);
};
