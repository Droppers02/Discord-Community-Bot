import { ButtonBuilder, ButtonStyle, GuildMember, StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import {
    getClosedTicketsByGuild,
    getOpenStaffLoad,
    getOpenTicketCategoryBreakdown,
    getOpenTicketsByGuild,
    getRatingStats,
    getStaffRatingSummary,
} from "../../repositories/ticketRepository.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getEmbedColor, getFooterText } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { hasSuperAdminAccess } from "../../lib/discord.js";
import { emoji } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import type { GuildConfig, TicketRecord } from "../../types.js";
import { getCategoryLabel } from "./categories.js";
import { comparePriority, priorityMeta } from "./priorities.js";
import { t } from "../../lib/i18n.js";

const DASHBOARD_PAGE_SIZE = 5;
export const DASHBOARD_WINDOWS = ["24h", "7d", "30d", "90d", "all"] as const;
export type DashboardWindow = (typeof DASHBOARD_WINDOWS)[number];

export function isDashboardWindow(value: string): value is DashboardWindow {
    return DASHBOARD_WINDOWS.includes(value as DashboardWindow);
}

function average(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minutesBetween(start: string, end: string): number {
    return (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
}

function hoursBetween(start: string, end: string): number {
    return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}

function oldestTicket(openTickets: TicketRecord[], config: GuildConfig): string {
    if (!openTickets.length) return t("Sem tickets abertos.");
    const oldest = [...openTickets].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())[0];
    return `${getCategoryLabel(config, oldest.category)} • <t:${Math.floor(new Date(oldest.created_at).getTime() / 1000)}:R>`;
}

function getWindowStart(window: DashboardWindow): Date | null {
    const now = Date.now();
    if (window === "24h") return new Date(now - 24 * 3_600_000);
    if (window === "7d") return new Date(now - 7 * 24 * 3_600_000);
    if (window === "30d") return new Date(now - 30 * 24 * 3_600_000);
    if (window === "90d") return new Date(now - 90 * 24 * 3_600_000);
    return null;
}

function paginate<T>(values: T[], page: number, pageSize: number): T[] {
    const offset = (page - 1) * pageSize;
    return values.slice(offset, offset + pageSize);
}

function buildDashboardRows(window: DashboardWindow, page: number, maxPage: number) {
    const previousPage = Math.max(1, page - 1);
    const nextPage = Math.min(maxPage, page + 1);

    return [
        row(
            new ButtonBuilder().setCustomId(buildCustomId("dashboard", "nav", window, previousPage)).setLabel(t("Anterior")).setEmoji(emoji.arrowLeft).setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
            new ButtonBuilder().setCustomId("dashboard/pageinfo").setLabel(t("Página {page}/{pages}", { page, pages: maxPage })).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(buildCustomId("dashboard", "nav", window, nextPage)).setLabel(t("Seguinte")).setEmoji(emoji.arrowRight).setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage),
        ),
        row(
            new StringSelectMenuBuilder()
                .setCustomId(buildCustomId("dashboard", "window", page))
                .setPlaceholder(t("Seleciona a janela temporal"))
                .addOptions(
                    { label: t("24 horas"), value: "24h", default: window === "24h" },
                    { label: t("7 dias"), value: "7d", default: window === "7d" },
                    { label: t("30 dias"), value: "30d", default: window === "30d" },
                    { label: t("90 dias"), value: "90d", default: window === "90d" },
                    { label: t("Tudo"), value: "all", default: window === "all" },
                ),
        ),
    ];
}

export interface DashboardPayload {
    components: ContainerPlusBuilder[];
    page: number;
    maxPage: number;
}

export async function buildDashboardPayload(guildId: string, window: DashboardWindow, requestedPage: number): Promise<DashboardPayload> {
    const config = await ensureGuildConfig(guildId);
    const cutoff = getWindowStart(window);
    const allOpen = await getOpenTicketsByGuild(guildId);
    const openTickets = allOpen.filter((ticket) => !cutoff || new Date(ticket.created_at) >= cutoff);
    const closedTickets = (await getClosedTicketsByGuild(guildId, 500)).filter((ticket) => !cutoff || new Date(ticket.closed_at ?? ticket.created_at) >= cutoff);
    const responseSlaMs = (config.sla_first_response_minutes ?? 15) * 60_000;
    const resolutionSlaMs = (config.sla_resolution_hours ?? 24) * 3_600_000;
    const now = Date.now();

    const overdueFirstResponse = openTickets.filter((ticket) => !ticket.first_response_at && now - new Date(ticket.created_at).getTime() > responseSlaMs).length;
    const overdueResolution = openTickets.filter((ticket) => now - new Date(ticket.created_at).getTime() > resolutionSlaMs).length;
    const firstResponseSamples = closedTickets.filter((ticket) => ticket.first_response_at).map((ticket) => minutesBetween(ticket.created_at, ticket.first_response_at as string));
    const resolutionSamples = closedTickets.filter((ticket) => ticket.closed_at).map((ticket) => hoursBetween(ticket.created_at, ticket.closed_at as string));
    const categoriesData = await getOpenTicketCategoryBreakdown(guildId);
    const workloadData = await getOpenStaffLoad(guildId);
    const ratingStats = await getRatingStats(guildId);
    const staffRatings = await getStaffRatingSummary(guildId);
    // Triage queue: most urgent first, then oldest.
    const oldestOpen = [...openTickets].sort(comparePriority).slice(0, 50);
    const urgentCount = openTickets.filter((ticket) => ticket.priority === "urgent").length;
    const highCount = openTickets.filter((ticket) => ticket.priority === "high").length;

    const maxPage = Math.max(1, Math.ceil(Math.max(categoriesData.length, workloadData.length, oldestOpen.length, staffRatings.length, 1) / DASHBOARD_PAGE_SIZE));
    const page = Math.min(Math.max(1, requestedPage), maxPage);

    const categories = paginate(categoriesData, page, DASHBOARD_PAGE_SIZE)
        .map((entry) => `• ${getCategoryLabel(config, entry.category)} — ${entry.count}`)
        .join("\n") || t("Sem tickets abertos.");
    const workload = paginate(workloadData, page, DASHBOARD_PAGE_SIZE)
        .map((entry) => `• <@${entry.staff_id}> — ${entry.count}`)
        .join("\n") || t("Nenhum ticket atribuído neste momento.");
    const oldestLines = paginate(oldestOpen, page, DASHBOARD_PAGE_SIZE)
        .map((ticket) => `• ${priorityMeta(ticket.priority).icon} [${ticket.id.slice(0, 8)}](https://discord.com/channels/${ticket.guild_id}/${ticket.channel_id}) — ${getCategoryLabel(config, ticket.category)} — <t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R>`)
        .join("\n") || t("Sem tickets nesta janela.");

    const color = getEmbedColor(config);
    const footerText = getFooterText(config);

    const metrics = buildContainer({
        color,
        thumbnailUrl: config.branding_logo,
        title: `${emoji.chart} ${t("Dashboard staff")}`,
        description: t("Visão operacional do suporte com SLA e carga atual. Janela: **{window}**. Página: **{page}**.", { window, page }),
        fields: [
            { name: t("Tickets abertos"), value: `${openTickets.length}` },
            { name: t("Prioridade urgente / alta"), value: `🔴 ${urgentCount} • 🟠 ${highCount}` },
            { name: t("SLA primeira resposta em risco"), value: `${overdueFirstResponse}` },
            { name: t("SLA resolução em risco"), value: `${overdueResolution}` },
            { name: t("Média primeira resposta"), value: firstResponseSamples.length ? `${average(firstResponseSamples).toFixed(1)} min` : t("Sem dados") },
            { name: t("Média resolução"), value: resolutionSamples.length ? `${average(resolutionSamples).toFixed(1)} h` : t("Sem dados") },
            { name: t("Ticket mais antigo"), value: oldestTicket(openTickets, config) },
        ],
        footerText,
    });

    const distribution = buildContainer({
        color,
        title: `${emoji.folder} ${t("Distribuição operacional")}`,
        description: t("Categorias, carga por staff e tickets mais antigos dentro da janela selecionada."),
        fields: [
            { name: t("Categorias abertas"), value: categories },
            { name: t("Carga por staff"), value: workload },
            { name: t("Fila por prioridade"), value: oldestLines },
        ],
        footerText,
    });

    const stars = (avg: number) => `${emoji.star} **${avg.toFixed(1)}/5**`;
    const staffRatingLines = paginate(staffRatings, page, DASHBOARD_PAGE_SIZE)
        .map((entry) => `• <@${entry.staff_id}> — ${stars(entry.average)} (${t("{count, plural, one {# avaliação} other {# avaliações}}", { count: entry.count })})`)
        .join("\n") || t("Sem avaliações registadas.");

    const satisfaction = buildContainer({
        color,
        title: `${emoji.star} ${t("Satisfação e avaliações da equipa")}`,
        description: t("Avaliação de 1 a 5 dada pelos utilizadores após o fecho do ticket (janela de 7 dias, com comentário opcional)."),
        fields: [
            { name: t("Satisfação global"), value: ratingStats.count ? `${stars(ratingStats.average)} • ${t("{count, plural, one {# avaliação} other {# avaliações}}", { count: ratingStats.count })}` : t("Sem avaliações ainda.") },
            { name: t("Ranking da equipa"), value: staffRatingLines },
        ],
        footerText,
        rows: buildDashboardRows(window, page, maxPage),
    });

    return { components: [metrics, distribution, satisfaction], page, maxPage };
}

export function hasDashboardAccess(member: GuildMember, config: GuildConfig): boolean {
    return hasSuperAdminAccess(member, config.admin_role);
}
