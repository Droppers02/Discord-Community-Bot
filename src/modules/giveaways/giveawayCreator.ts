import { ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder, type Guild } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t } from "../../lib/i18n.js";

export interface GiveawayDraft {
    prize: string | null;
    description: string | null;
    durationInput: string | null;
    durationMs: number | null;
    winners: number;
    channelId: string | null;
    requiredRole: string | null;
    bonusRole: string | null;
    bonusEntries: number;
    minAccountAgeDays: number;
    minServerAgeDays: number;
    requireClient: boolean;
    /** Publicar com um ping @everyone (mensagem própria antes do painel). */
    pingEveryone: boolean;
}

export const GIVEAWAY_MIN_DURATION_MS = 10_000;
export const GIVEAWAY_MAX_DURATION_MS = 30 * 86_400_000;

// Parse "1d", "2h30m", "45m", "90s" → milliseconds.
export function parseDuration(input: string): number | null {
    const matches = input.toLowerCase().matchAll(/(\d+)\s*(d|h|m|s)/g);
    const units: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 };
    let total = 0;
    let found = false;
    for (const match of matches) {
        total += Number.parseInt(match[1], 10) * units[match[2]];
        found = true;
    }
    return found ? total : null;
}

const drafts = new Map<string, GiveawayDraft>();

function key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
}

function freshDraft(): GiveawayDraft {
    return {
        prize: null, description: null, durationInput: null, durationMs: null,
        winners: 1, channelId: null, requiredRole: null, bonusRole: null, bonusEntries: 1,
        minAccountAgeDays: 0, minServerAgeDays: 0, requireClient: false, pingEveryone: false,
    };
}

export function getGiveawayDraft(guildId: string, userId: string): GiveawayDraft {
    const existing = drafts.get(key(guildId, userId));
    if (existing) return existing;
    const created = freshDraft();
    drafts.set(key(guildId, userId), created);
    return created;
}

export function updateGiveawayDraft(guildId: string, userId: string, patch: Partial<GiveawayDraft>): GiveawayDraft {
    const updated = { ...getGiveawayDraft(guildId, userId), ...patch };
    drafts.set(key(guildId, userId), updated);
    return updated;
}

export function resetGiveawayDraft(guildId: string, userId: string): GiveawayDraft {
    const created = freshDraft();
    drafts.set(key(guildId, userId), created);
    return created;
}

export function clearGiveawayDraft(guildId: string, userId: string): void {
    drafts.delete(key(guildId, userId));
}

export function isDraftReady(draft: GiveawayDraft): boolean {
    return Boolean(draft.prize && draft.durationMs && draft.channelId);
}

function cid(action: string): string {
    return buildCustomId("gwcreate", action);
}

export function buildGiveawayDraftPanel(draft: GiveawayDraft, _guild: Guild): ContainerPlusBuilder {
    const ready = isDraftReady(draft);
    const bonusValue = draft.bonusRole ? `<@&${draft.bonusRole}> • ${t("{count, plural, one {**+#** entrada} other {**+#** entradas}}", { count: draft.bonusEntries })}` : t("*Nenhum*");

    return buildContainer({
        color: COLORS.gold,
        title: `${emoji.gift} ${t("Criar sorteio")}`,
        description: t("Preenche os campos abaixo e carrega em **Criar sorteio**. As alterações ficam guardadas enquanto este painel estiver aberto."),
        fields: [
            { name: `${emoji.trophy} ${t("Prémio")}`, value: draft.prize ? `**${draft.prize}**` : t("*Por definir* (obrigatório)") },
            { name: `${emoji.note} ${t("Descrição")}`, value: draft.description || t("*Sem descrição*") },
            { name: `${emoji.clock} ${t("Duração")}`, value: draft.durationInput ? `**${draft.durationInput}**` : t("*Por definir* (obrigatório)") },
            { name: `${emoji.crown} ${t("Vencedores")}`, value: `**${draft.winners}**` },
            { name: `${emoji.channel} ${t("Canal")}`, value: draft.channelId ? `<#${draft.channelId}>` : t("*Por definir* (obrigatório)") },
            { name: `${emoji.shield} ${t("Cargo obrigatório")}`, value: draft.requiredRole ? `<@&${draft.requiredRole}>` : t("*Nenhum*") },
            { name: `${emoji.star} ${t("Cargo bónus")}`, value: bonusValue },
            { name: `${emoji.user} ${t("Idade mínima da conta")}`, value: draft.minAccountAgeDays > 0 ? t("{count, plural, one {**#** dia} other {**#** dias}}", { count: draft.minAccountAgeDays }) : t("*Sem mínimo*") },
            { name: `${emoji.calendar} ${t("Tempo mínimo no servidor")}`, value: draft.minServerAgeDays > 0 ? t("{count, plural, one {**#** dia} other {**#** dias}}", { count: draft.minServerAgeDays }) : t("*Sem mínimo*") },
            { name: `${emoji.crown} ${t("Apenas clientes")}`, value: draft.requireClient ? `${emoji.success} ${t("Sim")}` : `${emoji.error} ${t("Não")}` },
            { name: `${emoji.bell} ${t("Ping @everyone")}`, value: draft.pingEveryone ? `${emoji.success} ${t("Sim — todos são notificados na publicação")}` : `${emoji.error} ${t("Não")}` },
        ],
        footerText: ready ? t("Pronto a publicar") : t("Falta prémio, duração e/ou canal"),
        rows: [
            row(
                new ButtonBuilder().setCustomId(cid("prize")).setLabel(t("Prémio e descrição")).setEmoji(emoji.trophy).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("timing")).setLabel(t("Duração e vencedores")).setEmoji(emoji.clock).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("extra")).setLabel(t("Requisitos extra")).setEmoji(emoji.shield).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(cid("toggleclient")).setLabel(draft.requireClient ? t("Clientes: Sim") : t("Clientes: Não")).setEmoji(emoji.crown).setStyle(draft.requireClient ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(cid("toggleping")).setLabel(draft.pingEveryone ? t("Ping: Sim") : t("Ping: Não")).setEmoji(emoji.bell).setStyle(draft.pingEveryone ? ButtonStyle.Success : ButtonStyle.Secondary),
            ),
            row(new ChannelSelectMenuBuilder().setCustomId(cid("channel")).setPlaceholder(t("Canal onde publicar o sorteio")).addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)),
            row(new RoleSelectMenuBuilder().setCustomId(cid("reqrole")).setPlaceholder(t("Cargo obrigatório (opcional)")).setMinValues(0).setMaxValues(1)),
            row(new RoleSelectMenuBuilder().setCustomId(cid("bonusrole")).setPlaceholder(t("Cargo bónus / boost de chance (opcional)")).setMinValues(0).setMaxValues(1)),
            row(
                new ButtonBuilder().setCustomId(cid("confirm")).setLabel(t("Criar sorteio")).setEmoji(emoji.gift).setStyle(ButtonStyle.Success).setDisabled(!ready),
                new ButtonBuilder().setCustomId(cid("cancel")).setLabel(t("Cancelar")).setEmoji(emoji.close).setStyle(ButtonStyle.Danger),
            ),
        ],
    });
}
