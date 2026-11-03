import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags, PermissionFlagsBits, PollLayoutType } from "discord.js";
import { errorContainer, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { t } from "../../../lib/i18n.js";

// ─── /sondagem — usa as sondagens NATIVAS do Discord (sem storage) ────────────
createCommand({
    name: "sondagem",
    description: t("Cria uma sondagem nativa no canal atual."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "pergunta", description: t("A pergunta da sondagem"), type: ApplicationCommandOptionType.String, required: true, maxLength: 300 },
        { name: "opcoes", description: t("Opções separadas por | (2 a 10)"), type: ApplicationCommandOptionType.String, required: true, maxLength: 500 },
        { name: "duracao", description: t("Duração em horas (1 a 168, padrão 24)"), type: ApplicationCommandOptionType.Integer, required: false, minValue: 1, maxValue: 168 },
        { name: "multipla", description: t("Permitir escolher várias opções?"), type: ApplicationCommandOptionType.Boolean, required: false },
        { name: "cargo", description: t("Cargo a mencionar ao publicar a sondagem (opcional)"), type: ApplicationCommandOptionType.Role, required: false },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild() || !interaction.channel) return;
        const canal = interaction.channel;
        const role = interaction.options.getRole("cargo");

        // O bot não faz por um membro o que ele não podia fazer à mão. A sondagem é
        // publicada com a permissão do BOT: sem esta verificação, qualquer membro
        // publicava em canais onde não pode escrever (anúncios, regras) e mencionava
        // cargos não mencionáveis, que ele próprio não conseguiria pingar.
        const permissoes = canal.permissionsFor(interaction.member);
        // Num thread, escrever é `SendMessagesInThreads` — com `SendMessages` recusava
        // sondagens legítimas dentro de threads.
        const escrever = canal.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
        if (!permissoes?.has([escrever, PermissionFlagsBits.SendPolls])) {
            await interaction.reply({ components: [errorContainer(t("Não podes publicar sondagens neste canal."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }
        if (role && !role.mentionable && !permissoes.has(PermissionFlagsBits.MentionEveryone)) {
            await interaction.reply({ components: [errorContainer(t("Não tens permissão para mencionar **{role}**.", { role: role.name }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }

        const options = interaction.options.getString("opcoes", true).split("|").map((option) => option.trim()).filter(Boolean).slice(0, 10);
        if (options.length < 2) {
            await interaction.reply({ components: [errorContainer(t("Dá pelo menos 2 opções separadas por `|` — ex.: `Sim | Não | Talvez`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            return;
        }
        // A menção vai no conteúdo da mensagem da sondagem: as sondagens nativas não têm
        // campo próprio para isso, e uma mensagem à parte separava a menção da votação.
        try {
            await canal.send({
                content: role ? `<@&${role.id}>` : undefined,
                allowedMentions: role ? { roles: [role.id] } : { parse: [] },
                poll: {
                    question: { text: interaction.options.getString("pergunta", true).slice(0, 300) },
                    answers: options.map((option) => ({ text: option.slice(0, 55) })),
                    duration: interaction.options.getInteger("duracao") ?? 24,
                    allowMultiselect: interaction.options.getBoolean("multipla") ?? false,
                    layoutType: PollLayoutType.Default,
                },
            });
            await interaction.reply({ components: [successContainer(t("Sondagem criada! 🗳️"))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        } catch {
            await interaction.reply({ components: [errorContainer(t("Não consegui criar a sondagem — confirma as minhas permissões neste canal."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
    },
});
