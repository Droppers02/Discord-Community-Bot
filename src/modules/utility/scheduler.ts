import { MediaGalleryBuilder, MediaGalleryItemBuilder, type Client, type TextChannel } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { e } from "../../lib/emojis.js";
import { t } from "../../lib/i18n.js";
import { logger } from "../../lib/logger.js";
import { timestamp } from "../../lib/time.js";
import {
    deleteAnnouncement,
    deleteReminder,
    dueAnnouncements,
    dueReminders,
    rescheduleAnnouncement,
    rescheduleReminder,
    type ScheduledAnnouncement,
} from "../../repositories/scheduleRepository.js";

// Agendador dos anúncios e lembretes: de 15 em 15 segundos envia o que já chegou à hora.
// Repetições (diário/semanal, ou o mesmo intervalo nos lembretes) voltam a ser agendadas;
// se o bot esteve desligado, um anúncio atrasado sai uma vez e salta para a próxima hora.

const TICK_MS = 15_000;
const REPEAT_MS = { none: 0, daily: 86_400_000, weekly: 7 * 86_400_000 } as const;
let timer: NodeJS.Timeout | null = null;

export function isHttpImage(url: string | null | undefined): url is string {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
        return false;
    }
}

/** O anúncio como sai no canal (também serve de pré-visualização). */
export function buildAnnouncement(entry: Pick<ScheduledAnnouncement, "title" | "content" | "mention_role" | "image_url">): ContainerPlusBuilder {
    const mention = entry.mention_role === "everyone" ? "@everyone" : entry.mention_role ? `<@&${entry.mention_role}>` : null;
    const container = buildContainer({
        color: COLORS.primary,
        title: entry.title ? `${e("megaphone")} ${entry.title}` : null,
        description: [mention, entry.content].filter(Boolean).join("\n"),
    });
    if (isHttpImage(entry.image_url)) {
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(entry.image_url)));
    }
    return container;
}

async function sendAnnouncement(client: Client<true>, entry: ScheduledAnnouncement): Promise<void> {
    const channel = await client.channels.fetch(entry.channel_id).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) {
        logger.warn(`Anúncio ${entry.id}: o canal ${entry.channel_id} já não existe — apagado.`);
        await deleteAnnouncement(entry.guild_id, entry.id);
        return;
    }
    await (channel as TextChannel).send({
        components: [buildAnnouncement(entry)],
        flags: CV2_FLAG,
        allowedMentions: entry.mention_role === "everyone" ? { parse: ["everyone"] } : entry.mention_role ? { roles: [entry.mention_role] } : { parse: [] },
    });
}

async function tick(client: Client<true>): Promise<void> {
    const now = Date.now();
    for (const entry of await dueAnnouncements(now)) {
        try {
            await sendAnnouncement(client, entry);
        } catch (error) {
            logger.warn(`Anúncio ${entry.id}: falha a enviar:`, error);
        }
        const step = REPEAT_MS[entry.repeat] ?? 0;
        if (step > 0) {
            let next = entry.send_at + step;
            while (next <= now) next += step;
            await rescheduleAnnouncement(entry.id, next);
        } else {
            await deleteAnnouncement(entry.guild_id, entry.id);
        }
    }

    for (const reminder of await dueReminders(now)) {
        const container = buildContainer({
            color: COLORS.info,
            title: `${e("bell")} ${t("Lembrete")}`,
            description: [
                reminder.dm ? null : `<@${reminder.user_id}>`,
                reminder.content,
                `-# ${t("Pedido {at}", { at: timestamp(reminder.created_at, "R") })}${reminder.repeat_ms ? ` · ${t("repete-se")}` : ""}`,
            ].filter(Boolean).join("\n"),
        });
        try {
            if (reminder.dm) {
                const user = await client.users.fetch(reminder.user_id);
                await user.send({ components: [container], flags: CV2_FLAG });
            } else {
                const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
                if (channel?.isTextBased() && !channel.isDMBased()) {
                    await (channel as TextChannel).send({ components: [container], flags: CV2_FLAG, allowedMentions: { users: [reminder.user_id] } });
                } else {
                    const user = await client.users.fetch(reminder.user_id);
                    await user.send({ components: [container], flags: CV2_FLAG });
                }
            }
        } catch (error) {
            logger.warn(`Lembrete ${reminder.id}: não foi entregue:`, error);
        }
        if (reminder.repeat_ms > 0) {
            let next = reminder.remind_at + reminder.repeat_ms;
            while (next <= now) next += reminder.repeat_ms;
            await rescheduleReminder(reminder.id, next);
        } else {
            await deleteReminder(reminder.id);
        }
    }
}

export function startScheduler(client: Client<true>): void {
    if (timer) return;
    let running = false;
    timer = setInterval(() => {
        if (running) return;
        running = true;
        void tick(client).catch((error) => logger.warn("Agendador: falha:", error)).finally(() => { running = false; });
    }, TICK_MS);
    timer.unref?.();
}
