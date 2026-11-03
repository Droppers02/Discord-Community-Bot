import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags, StringSelectMenuBuilder, formatEmoji, parseEmoji } from "discord.js";
import { COLORS } from "../../../lib/branding.js";
import { buildContainer, errorContainer, row, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { e } from "../../../lib/emojis.js";
import { t } from "../../../lib/i18n.js";
import { humanizeDuration, timestamp } from "../../../lib/time.js";
import { parseDelay, parseWhen } from "../../../lib/when.js";
import { addNote, countNotes, listNotes, setAfk } from "../../../repositories/utilityRepository.js";

const MAX_NOTES = 25;

// ─── /nota ───────────────────────────────────────────────────────────────────
createCommand({
    name: "nota",
    description: t("Notas pessoais e privadas (só tu as vês)."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "criar",
            description: t("Guarda uma nota."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "titulo", description: t("Título"), type: ApplicationCommandOptionType.String, required: true, maxLength: 80 },
                { name: "texto", description: t("Conteúdo"), type: ApplicationCommandOptionType.String, required: true, maxLength: 1500 },
            ],
        },
        { name: "lista", description: t("As tuas notas (abre, lê e apaga)."), type: ApplicationCommandOptionType.Subcommand },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (interaction.options.getSubcommand() === "criar") {
            if (await countNotes(interaction.guildId, interaction.user.id) >= MAX_NOTES) {
                return void interaction.reply({ components: [errorContainer(t("Já tens {max} notas — apaga alguma em `/nota lista`.", { max: MAX_NOTES }))], flags: CV2_FLAG | MessageFlags.Ephemeral });
            }
            await addNote(interaction.guildId, interaction.user.id, interaction.options.getString("titulo", true), interaction.options.getString("texto", true));
            return void interaction.reply({ components: [successContainer(t("Nota guardada. Vê-as em `/nota lista`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        const notes = await listNotes(interaction.guildId, interaction.user.id);
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.info,
                title: `${e("notes")} ${t("As tuas notas ({count})", { count: notes.length })}`,
                description: notes.length ? notes.map((note) => `**${note.title}** · ${timestamp(note.created_at, "R")}\n-# ${note.content.replace(/\n/g, " ").slice(0, 90)}`).join("\n") : t("Ainda não tens notas. Cria uma com `/nota criar`."),
                rows: notes.length ? [row(new StringSelectMenuBuilder()
                    .setCustomId(`note/open/${interaction.user.id}`)
                    .setPlaceholder(t("Abrir uma nota…"))
                    .addOptions(notes.map((note) => ({ label: note.title.slice(0, 100), value: String(note.id), description: note.content.replace(/\n/g, " ").slice(0, 100) }))))] : [],
            })],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});

// ─── /afk ────────────────────────────────────────────────────────────────────
createCommand({
    name: "afk",
    description: t("Fica ausente: quem te mencionar recebe o aviso. Sai sozinho quando voltares a escrever."),
    type: ApplicationCommandType.ChatInput,
    options: [{ name: "motivo", description: t("Porquê (opcional)"), type: ApplicationCommandOptionType.String, required: false, maxLength: 200 }],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const reason = interaction.options.getString("motivo")?.trim() || t("AFK");
        await setAfk(interaction.guildId, interaction.user.id, reason);
        // Prefixo [AFK] no nome, se o bot puder mexer nele.
        const member = interaction.member;
        if (member.manageable && !member.displayName.startsWith("[AFK]")) {
            await member.setNickname(`[AFK] ${member.displayName}`.slice(0, 32), t("AFK")).catch(() => null);
        }
        await interaction.reply({ components: [successContainer(t("{user} está agora AFK: {reason}", { user: `<@${member.id}>`, reason }))], flags: CV2_FLAG, allowedMentions: { parse: [] } });
    },
});

// ─── /timestamp ──────────────────────────────────────────────────────────────
const STYLES = [
    { value: "t", name: "Hora curta (16:20)" },
    { value: "T", name: "Hora longa (16:20:30)" },
    { value: "d", name: "Data curta (20/04/2026)" },
    { value: "D", name: "Data longa (20 de abril de 2026)" },
    { value: "f", name: "Data e hora (20 de abril de 2026 16:20)" },
    { value: "F", name: "Completa (segunda-feira, 20 de abril de 2026 16:20)" },
    { value: "R", name: "Relativo (daqui a 2 horas)" },
] as const;

createCommand({
    name: "timestamp",
    description: t("Gera um timestamp do Discord (cada um vê na sua hora)."),
    type: ApplicationCommandType.ChatInput,
    options: [
        { name: "quando", description: t("21:30 · amanhã 9:00 · 25/12/2026 18:00 · ou 2h (daqui a)"), type: ApplicationCommandOptionType.String, required: true, maxLength: 40 },
        { name: "estilo", description: t("Formato (vazio = todos)"), type: ApplicationCommandOptionType.String, required: false, choices: STYLES.map((style) => ({ name: style.name, value: style.value })) },
    ],
    async run(interaction) {
        const raw = interaction.options.getString("quando", true);
        const delay = parseDelay(raw);
        const at = delay ? Date.now() + delay : parseWhen(raw);
        if (!at) return void interaction.reply({ components: [errorContainer(t("Não percebi a data. Exemplos: `21:30`, `amanhã 9:00`, `25/12/2026 18:00`, `2h`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const unix = Math.floor(at / 1000);
        const chosen = interaction.options.getString("estilo");
        const styles = chosen ? STYLES.filter((style) => style.value === chosen) : STYLES;
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.info,
                title: `${e("clock")} ${t("Timestamp")}`,
                description: styles.map((style) => `<t:${unix}:${style.value}> — \`<t:${unix}:${style.value}>\``).join("\n"),
                footerText: t("Copia o código e cola-o numa mensagem."),
            })],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});

// ─── /emoji ──────────────────────────────────────────────────────────────────
createCommand({
    name: "emoji",
    description: t("Mostra um emoji personalizado em grande, com as informações."),
    type: ApplicationCommandType.ChatInput,
    options: [{ name: "emoji", description: t("O emoji (personalizado)"), type: ApplicationCommandOptionType.String, required: true, maxLength: 100 }],
    async run(interaction) {
        const parsed = parseEmoji(interaction.options.getString("emoji", true).trim());
        if (!parsed?.id) return void interaction.reply({ components: [errorContainer(t("Isso não é um emoji personalizado (os emojis normais do teclado não têm imagem própria)."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const url = `https://cdn.discordapp.com/emojis/${parsed.id}.${parsed.animated ? "gif" : "png"}?size=512`;
        const created = Number((BigInt(parsed.id) >> 22n) + 1_420_070_400_000n);
        const local = interaction.guild?.emojis.cache.get(parsed.id);
        await interaction.reply({
            components: [buildContainer({
                color: COLORS.primary,
                title: `${formatEmoji({ id: parsed.id, name: parsed.name ?? "emoji", animated: parsed.animated })} :${parsed.name}:`,
                thumbnailUrl: url,
                description: [
                    `**ID** \`${parsed.id}\``,
                    t("**Animado:** {value}", { value: parsed.animated ? t("sim") : t("não") }),
                    t("**Criado:** {at} ({age})", { at: timestamp(created, "D"), age: humanizeDuration(Date.now() - created) }),
                    local ? t("**Deste servidor** · criado por {user}", { user: local.author ? `<@${local.author.id}>` : "—" }) : t("**De outro servidor**"),
                    `[${t("Abrir imagem")}](${url})`,
                ].join("\n"),
            })],
            flags: CV2_FLAG,
            allowedMentions: { parse: [] },
        });
    },
});
