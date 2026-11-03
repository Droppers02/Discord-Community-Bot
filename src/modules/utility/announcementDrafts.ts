import type { AnnounceRepeat } from "../../repositories/scheduleRepository.js";

// Entre o comando e o modal do texto: as opções escolhidas ficam aqui 15 minutos.
export interface AnnouncementDraft {
    guildId: string;
    userId: string;
    channelId: string;
    sendAt: number;
    immediate: boolean;
    repeat: AnnounceRepeat;
    mentionRole: string | null;
}

const TTL_MS = 15 * 60_000;
const drafts = new Map<string, { draft: AnnouncementDraft; expires: number }>();

export const announcementDrafts = {
    set(id: string, draft: AnnouncementDraft): void {
        const now = Date.now();
        for (const [key, entry] of drafts) if (entry.expires < now) drafts.delete(key);
        drafts.set(id, { draft, expires: now + TTL_MS });
    },
    take(id: string): AnnouncementDraft | null {
        const entry = drafts.get(id);
        drafts.delete(id);
        return entry && entry.expires > Date.now() ? entry.draft : null;
    },
};
