import { createCommand } from "#base";
import { ApplicationCommandOptionType, ApplicationCommandType, MessageFlags, StringSelectMenuBuilder } from "discord.js";
import { randomUUID } from "node:crypto";
import { COLORS } from "../../../lib/branding.js";
import { buildContainer, errorContainer, row, successContainer } from "../../../lib/containers.js";
import { CV2_FLAG } from "../../../lib/discord.js";
import { e } from "../../../lib/emojis.js";
import { t } from "../../../lib/i18n.js";
import { humanizeDuration, timestamp } from "../../../lib/time.js";
import { parseDelay, parseWhen } from "../../../lib/when.js";
import { countReminders, insertReminder, listReminders } from "../../../repositories/scheduleRepository.js";

const MAX_REMINDERS = 25;

createCommand({
    name: "lembrete",
    description: t("Lembretes: o bot avisa-te a uma hora ou daqui a algum tempo."),
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "criar",
            description: t("Cria um lembrete."),
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: "quando", description: t("30m · 2h · 1d · 21:30 · amanhã 9:00 · 25/12 18:00"), type: ApplicationCommandOptionType.String, required: true, maxLength: 40 },
                { name: "mensagem", description: t("O que te devo lembrar"), type: ApplicationCommandOptionType.String, required: true, maxLength: 1000 },
                { name: "repetir", description: t("Repetir com o mesmo intervalo (só para esperas como 2h)"), type: ApplicationCommandOptionType.Boolean, required: false },
                { name: "privado", description: t("Avisar por mensagem privada em vez de no canal"), type: ApplicationCommandOptionType.Boolean, required: false },
            ],
        },
        { name: "lista", description: t("Os teus lembretes ativos."), type: ApplicationCommandOptionType.Subcommand },
    ],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const fail = (text: string) => interaction.reply({ components: [errorContainer(text)], flags: CV2_FLAG | MessageFlags.Ephemeral });

        if (interaction.options.getSubcommand() === "lista") {
            const reminders = await listReminders(interaction.guildId, interaction.user.id);
            return void interaction.reply({
                components: [buildContainer({
                    color: COLORS.info,
                    title: `${e("bell")} ${t("Os teus lembretes ({count})", { count: reminders.length })}`,
                    description: reminders.length
                        ? reminders.map((reminder) => `${timestamp(reminder.remind_at, "f")} (${timestamp(reminder.remind_at, "R")})${reminder.repeat_ms ? ` · 🔁 ${humanizeDuration(reminder.repeat_ms)}` : ""}${reminder.dm ? " · DM" : ` · <#${reminder.channel_id}>`}\n-# ${reminder.content.replace(/\n/g, " ").slice(0, 100)}`).join("\n")
                        : t("Não tens lembretes. Cria um com `/lembrete criar`."),
                    rows: reminders.length ? [row(new StringSelectMenuBuilder()
                        .setCustomId(`rem/delete/${interaction.user.id}`)
                        .setPlaceholder(t("Apagar um lembrete…"))
                        .addOptions(reminders.map((reminder) => ({ label: reminder.content.replace(/\n/g, " ").slice(0, 100), value: reminder.id, description: new Date(reminder.remind_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) }))))] : [],
                })],
                flags: CV2_FLAG | MessageFlags.Ephemeral,
            });
        }

        if (await countReminders(interaction.guildId, interaction.user.id) >= MAX_REMINDERS) return void fail(t("Já tens {max} lembretes — apaga algum em `/lembrete lista`.", { max: MAX_REMINDERS }));
        const when = interaction.options.getString("quando", true);
        const delay = parseDelay(when);
        const at = delay ? Date.now() + delay : parseWhen(when);
        if (!at) return void fail(t("Não percebi quando. Exemplos: `30m`, `2h`, `1d`, `21:30`, `amanhã 9:00`."));
        if (at - Date.now() < 30_000) return void fail(t("Escolhe pelo menos 30 segundos à frente."));
        if (at - Date.now() > 366 * 86_400_000) return void fail(t("No máximo um ano de antecedência."));
        const repeat = interaction.options.getBoolean("repetir") ?? false;
        if (repeat && !delay) return void fail(t("A repetição usa uma espera (ex.: `2h`), não uma hora fixa."));
        if (repeat && delay! < 10 * 60_000) return void fail(t("Para repetir, o intervalo mínimo é 10 minutos."));
        const dm = interaction.options.getBoolean("privado") ?? false;

        await insertReminder({
            id: randomUUID().slice(0, 12),
            guild_id: interaction.guildId,
            channel_id: interaction.channelId,
            user_id: interaction.user.id,
            content: interaction.options.getString("mensagem", true),
            remind_at: at,
            repeat_ms: repeat ? delay! : 0,
            dm,
            created_at: Date.now(),
        });
        await interaction.reply({
            components: [successContainer(t("Lembro-te {at} ({rel}){where}{repeat}.", {
                at: timestamp(at, "f"),
                rel: timestamp(at, "R"),
                where: dm ? t(" por mensagem privada") : t(" aqui no canal"),
                repeat: repeat ? t(", e depois de {every} em {every}", { every: humanizeDuration(delay!) }) : "",
            }))],
            flags: CV2_FLAG | MessageFlags.Ephemeral,
        });
    },
});
