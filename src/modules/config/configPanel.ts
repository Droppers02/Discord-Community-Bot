import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    LabelBuilder,
    ModalBuilder,
    RadioGroupBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    type Guild,
} from "discord.js";
import type { AntiSpamSettings } from "../../types.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row, type ContainerField, type Row } from "../../lib/containers.js";
import { e, emoji, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { getLogSettings, LOG_CATEGORY_DESCRIPTIONS, LOG_CATEGORY_LABELS } from "../logs/logSettings.js";
import { getSuggestionSettings } from "../suggestions/suggestionSettings.js";
import { getAntiSpamSettings } from "../antispam/antispamSettings.js";
import { getGiveawaySettings } from "../giveaways/giveawaySettings.js";
import { ensureGuildConfig } from "../../repositories/guildConfigRepository.js";
import { getTicketCategories } from "../tickets/categories.js";
import { formatSupportWindow, formatSupportWindowNote, parseSupportHours, supportHoursModalFields } from "../tickets/officeHours.js";
import { LOG_CATEGORIES, type LogCategory } from "../../types.js";
import { getVoiceSettings } from "../voice/voiceSettings.js";
import { getBroadcastSettings, getReactionRoleSettings, getSocialSettings, getStatsSettings } from "../community/communitySettings.js";
import { isKickConfigured, isTwitchConfigured } from "../community/socialAlerts.js";
import { STAT_LABELS } from "../community/statsAndBroadcast.js";
import { STAT_KEYS, ANTISPAM_ACTIONS, ANTISPAM_ACTION_LABELS } from "../../types.js";
import { t, tk } from "../../lib/i18n.js";
import { getRoleSettings } from "../roles/roleSettings.js";
import { buildSlaContainer } from "../sla/slaConfigView.js";
import { buildModmailContainer } from "../modmail/modmailConfigView.js";
import { buildVerifyContainer } from "../verification/verifyConfigView.js";
import { buildLevelsContainer } from "../levels/levelsConfigView.js";
import { buildEconomyContainer } from "../economy/economyConfigView.js";
import { buildGamesContainer } from "../games/gamesConfigView.js";
import { buildModerationContainer } from "../moderation/moderationConfigView.js";
import { buildWelcomeMessagesContainer } from "../community/welcomeMessages.js";
import { buildStarboardContainer } from "../community/starboard.js";
import { buildAppealContainer } from "../appeals/appealConfigView.js";
import { buildProtectionContainer } from "../protection/protectionConfigView.js";
import { buildLockdownContainer } from "../moderation/lockdownConfigView.js";
import { buildReportsContainer } from "../reports/reportConfigView.js";
import { buildCountingContainer } from "../counting/countingConfigView.js";
import { buildConfessionsContainer } from "../confessions/confessionConfigView.js";

export type ConfigSection = "hub" | "giveaways" | "logs" | "suggestions" | "antispam" | "support" | "welcome" | "voice" | "roles" | "reactionroles" | "social" | "stats" | "broadcast" | "sla" | "modmail" | "verify" | "levels" | "economy" | "games" | "moderation" | "welcomemsg" | "starboard" | "appeals" | "protection"
    | "lockdown" | "reports" | "counting" | "confessions" | "lfg" | "freegames" | "predictions" | "teams" | "wrapped";

interface ConfigState {
    section: ConfigSection;
    logCategory: LogCategory;
    socialSub: string | null;
    /** Painel de auto-cargos selecionado para edição. */
    rrPanel: string | null;
}

const state = new Map<string, ConfigState>();

function stateKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
}

export function getConfigState(guildId: string, userId: string): ConfigState {
    const key = stateKey(guildId, userId);
    let current = state.get(key);
    if (!current) {
        current = { section: "hub", logCategory: "messages", socialSub: null, rrPanel: null };
        state.set(key, current);
    }
    return current;
}

export function setConfigState(guildId: string, userId: string, patch: Partial<ConfigState>): ConfigState {
    const current = getConfigState(guildId, userId);
    const updated = { ...current, ...patch };
    state.set(stateKey(guildId, userId), updated);
    return updated;
}

export function clearConfigState(guildId: string, userId: string): void {
    state.delete(stateKey(guildId, userId));
}

// All config-panel customIds share the `cfg` namespace; the 2nd segment is the action.
function cid(action: string, ...parts: Array<string | number>): string {
    return buildCustomId("cfg", action, ...parts);
}

function onOff(value: boolean): string {
    return value ? `${emoji.success} Ativado` : `${emoji.error} Desativado`;
}

function displayChannel(value?: string | null): string {
    return value ? `<#${value}>` : t("*Não definido*");
}

function displayRole(value?: string | null): string {
    return value ? `<@&${value}>` : t("*Não definido*");
}

function displayRoleList(values: string[]): string {
    return values.length ? values.map((id) => `<@&${id}>`).join(", ") : t("*Nenhum*");
}

function backRow(): Row {
    return row(new ButtonBuilder().setCustomId(cid("back")).setLabel(t("Voltar ao menu")).setEmoji(emoji.arrowLeft).setStyle(ButtonStyle.Secondary));
}

/**
 * Channel picker that shows each channel's parent category as the option description.
 * Native ChannelSelect can't do that; this lists text channels (capped at 25) instead.
 */
/**
 * Seletor de canal de texto.
 *
 * Usa o ChannelSelectMenu NATIVO do Discord, e não um menu de opções construído por nós:
 * um StringSelectMenu está limitado a 25 opções, por isso em servidores com muitos canais
 * os que passavam desse limite simplesmente não apareciam na lista. O menu nativo mostra
 * todos os canais e ainda traz pesquisa.
 *
 * `selectedId` fica como default para o Discord já o mostrar escolhido.
 */
function categoryChannelSelect(_guild: Guild, customId: string, placeholder: string, selectedId?: string | null): Row {
    const select = new ChannelSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder.slice(0, 150))
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1);
    if (selectedId) select.setDefaultChannels(selectedId);
    return row(select);
}

// ─── Hub ──────────────────────────────────────────────────────────────────────
type HubGroup = "gestao" | "comunidade";

const SECTION_OPTIONS: Array<{ value: Exclude<ConfigSection, "hub"> | "tickets"; label: string; description: string; group: HubGroup; icon: string }> = [
    { value: "tickets", label: tk("Tickets"), description: tk("Categorias, formulários, painel e equipa."), group: "gestao", icon: "ticket" },
    { value: "support", label: tk("Atendimento"), description: tk("Horário e mensagens de boas-vindas por categoria."), group: "gestao", icon: "clock" },
    { value: "sla", label: tk("Avisos de tickets parados"), description: tk("Avisar a equipa quando um ticket fica sem resposta."), group: "gestao", icon: "hourglass" },
    { value: "modmail", label: tk("Modmail"), description: tk("Membros falam com a equipa por mensagem privada ao bot."), group: "gestao", icon: "message" },
    { value: "verify", label: tk("Verificação à entrada"), description: tk("Captcha de figuras para quem entra no servidor."), group: "gestao", icon: "shield" },
    { value: "welcomemsg", label: tk("Boas-vindas"), description: tk("Mensagens de boas-vindas/despedida, DM e cargos automáticos."), group: "gestao", icon: "heart" },
    { value: "welcome", label: tk("Log de entradas e saídas"), description: tk("Cartões de registo com o convite usado."), group: "gestao", icon: "join" },
    { value: "moderation", label: tk("Moderação"), description: tk("Avisos, castigos automáticos e registo de moderação."), group: "gestao", icon: "hammer" },
    { value: "appeals", label: tk("Revisão de bans"), description: tk("Pedidos de unban por DM, votação e decisão da equipa."), group: "gestao", icon: "receipt" },
    { value: "protection", label: tk("Proteção"), description: tk("Filtro de palavras, conteúdo adulto, anti-raid e slowmode automático."), group: "gestao", icon: "shield" },
    { value: "antispam", label: tk("Anti-spam"), description: tk("Proteção automática contra flood, links e menções."), group: "gestao", icon: "shield" },
    { value: "logs", label: tk("Logs do servidor"), description: tk("Registo de eventos do servidor por categoria."), group: "gestao", icon: "newspaper" },
    { value: "reports", label: tk("Denúncias"), description: tk("Membros denunciam mensagens; a equipa resolve num cartão com provas."), group: "gestao", icon: "report" },
    { value: "lockdown", label: tk("Trancas e horário de silêncio"), description: tk("Trancar canais/servidor, anti-raid e canais que fecham a certas horas."), group: "gestao", icon: "lock" },
    { value: "levels", label: tk("Níveis e XP"), description: tk("XP por mensagem e voz, cargos de recompensa e ranking."), group: "comunidade", icon: "trophy" },
    { value: "economy", label: tk("Economia"), description: tk("EPA Coins: diário, trabalho, apostas máximas e lojas."), group: "comunidade", icon: "coin" },
    { value: "games", label: tk("Mini-jogos"), description: tk("Canal dos jogos, prémios e limites de apostas."), group: "comunidade", icon: "jigsaw" },
    { value: "giveaways", label: tk("Sorteios"), description: tk("Canal e cargo de organizador dos sorteios."), group: "comunidade", icon: "gift" },
    { value: "suggestions", label: tk("Sugestões"), description: tk("Canal, votação e moderação das sugestões."), group: "comunidade", icon: "megaphone" },
    { value: "starboard", label: tk("Starboard"), description: tk("Mensagens com mais ⭐ vão para um canal de destaque."), group: "comunidade", icon: "star" },
    { value: "reactionroles", label: tk("Auto-cargos"), description: tk("Painéis de cargos por botões ou menu."), group: "comunidade", icon: "role" },
    { value: "confessions", label: tk("Confissões"), description: tk("Confissões e respostas anónimas, com revisão da equipa."), group: "comunidade", icon: "message" },
    { value: "counting", label: tk("Contagem"), description: tk("Canal onde se conta à vez, com recordes, vidas, prémios e vergonha."), group: "comunidade", icon: "chart" },
    { value: "social", label: tk("Alertas sociais"), description: tk("YouTube, TikTok, Twitch e Kick anunciados automaticamente."), group: "comunidade", icon: "megaphone" },
    { value: "stats", label: tk("Estatísticas"), description: tk("Contadores de membros, canais e boosts em nomes de canais."), group: "gestao", icon: "chart" },
    { value: "broadcast", label: tk("Publicação automática"), description: tk("Auto-publish dos canais de anúncios."), group: "gestao", icon: "bell" },
    { value: "voice", label: tk("Canais de voz"), description: tk("Salas temporárias e voz privada por ticket."), group: "gestao", icon: "voice" },
    { value: "roles", label: tk("Cargos"), description: tk("Cargos que voltam ao regressar e cargos temporários."), group: "gestao", icon: "role" },
];

const HUB_GROUPS: Array<{ id: HubGroup; label: string; placeholder: string }> = [
    { id: "gestao", label: tk("Gestão e moderação"), placeholder: tk("Gestão e moderação…") },
    { id: "comunidade", label: tk("Comunidade e diversão"), placeholder: tk("Comunidade e diversão…") },
];

// Dois menus (o Discord só deixa 25 opções por menu): um para a gestão do servidor, outro para
// a comunidade. Os dois mandam para `cfg/hub/<grupo>`, tratado como `hub` pelo responder.
function buildHubContainer(): ContainerPlusBuilder {
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.settings} ${t("Configuração — EPA BOTCHI")}`,
        description: t("Escolhe o sistema que queres configurar. Tudo fica guardado em direto."),
        fields: HUB_GROUPS.map((group) => ({
            name: t(group.label),
            value: SECTION_OPTIONS.filter((option) => option.group === group.id).map((option) => `${e(option.icon)} ${t(option.label)}`.trim()).join(" · "),
        })),
        rows: HUB_GROUPS.map((group) => row(new StringSelectMenuBuilder()
            .setCustomId(cid("hub", group.id))
            .setPlaceholder(t(group.placeholder))
            .addOptions(SECTION_OPTIONS.filter((option) => option.group === group.id).slice(0, 25).map((option) => ({ label: t(option.label), value: option.value, description: t(option.description).slice(0, 100), emoji: ei(option.icon) }))))),
    });
}

// ─── Logs ───────────────────────────────────────────────────────────────────
async function buildLogsContainer(guild: Guild, guildId: string, selectedCategory: LogCategory): Promise<ContainerPlusBuilder> {
    const settings = await getLogSettings(guildId);
    const fields: ContainerField[] = LOG_CATEGORIES.map((category) => {
        const conf = settings.categories[category];
        return { name: `${t(LOG_CATEGORY_LABELS[category])}`, value: `${onOff(conf.enabled)} • ${displayChannel(conf.channel_id)}` };
    });
    fields.push({ name: t("Canais ignorados"), value: settings.ignored_channels.length ? settings.ignored_channels.map((id) => `<#${id}>`).join(", ") : t("*Nenhum*") });
    fields.push({ name: t("Cargos ignorados"), value: displayRoleList(settings.ignored_roles) });

    const selected = settings.categories[selectedCategory];
    const rows: Row[] = [
        row(new StringSelectMenuBuilder()
            .setCustomId(cid("logcat"))
            .setPlaceholder(t("Seleciona a categoria a configurar"))
            .addOptions(LOG_CATEGORIES.map((category) => ({
                label: t(LOG_CATEGORY_LABELS[category]),
                value: category,
                description: t(LOG_CATEGORY_DESCRIPTIONS[category]).slice(0, 100),
                default: category === selectedCategory,
            })))),
        row(new ButtonBuilder()
            .setCustomId(cid("logtoggle", selectedCategory))
            .setLabel(selected.enabled ? t("Desativar {category}", { category: t(LOG_CATEGORY_LABELS[selectedCategory]) }) : t("Ativar {category}", { category: t(LOG_CATEGORY_LABELS[selectedCategory]) }))
            .setEmoji(selected.enabled ? emoji.error : emoji.success)
            .setStyle(selected.enabled ? ButtonStyle.Danger : ButtonStyle.Success)),
        categoryChannelSelect(guild, cid("logchannel", selectedCategory), t("Canal de {category}", { category: t(LOG_CATEGORY_LABELS[selectedCategory]) }), selected.channel_id),
    ];

    // Once a channel is set, offer one-click bulk actions.
    if (selected.channel_id) {
        rows.push(row(
            new ButtonBuilder().setCustomId(cid("logenableall")).setLabel(t("Ativar todas as categorias")).setEmoji(emoji.success).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(cid("logallchan", selectedCategory)).setLabel(t("Usar este canal em todas")).setEmoji(emoji.channel).setStyle(ButtonStyle.Primary),
        ));
    }

    rows.push(
        row(new ChannelSelectMenuBuilder()
            .setCustomId(cid("logignch"))
            .setPlaceholder(t("Canais ignorados (opcional)"))
            .addChannelTypes(ChannelType.GuildText)
            .setMinValues(0).setMaxValues(10)),
        row(new RoleSelectMenuBuilder()
            .setCustomId(cid("logignrole"))
            .setPlaceholder(t("Cargos ignorados (opcional)"))
            .setMinValues(0).setMaxValues(10)),
        backRow(),
    );

    return buildContainer({
        color: COLORS.info,
        title: `${e("newspaper")} ${t("Logs do servidor")}`,
        description: t("Ativa cada categoria e escolhe o canal de destino. Eventos de canais/cargos/membros ignorados não são registados."),
        fields,
        rows,
    });
}

// ─── Suggestions ──────────────────────────────────────────────────────────────
async function buildSuggestionsContainer(guild: Guild, guildId: string): Promise<ContainerPlusBuilder> {
    const settings = await getSuggestionSettings(guildId);
    return buildContainer({
        color: COLORS.gold,
        title: `${emoji.megaphone} ${t("Sugestões")}`,
        description: t("Define o canal onde as sugestões são publicadas e como são moderadas."),
        fields: [
            { name: t("Canal das sugestões"), value: displayChannel(settings.channel) },
            { name: t("Threads de discussão"), value: onOff(settings.create_threads) },
            { name: t("Cargo necessário p/ sugerir"), value: displayRole(settings.required_role) },
            { name: t("Cargo de moderação"), value: displayRole(settings.manager_role) },
        ],
        rows: [
            categoryChannelSelect(guild, cid("sugchannel"), t("Canal das sugestões"), settings.channel),
            row(new RoleSelectMenuBuilder().setCustomId(cid("sugrole")).setPlaceholder(t("Cargo necessário para sugerir (opcional)")).setMinValues(0).setMaxValues(1)),
            row(new RoleSelectMenuBuilder().setCustomId(cid("sugmanager")).setPlaceholder(t("Cargo de moderação das sugestões")).setMinValues(0).setMaxValues(1)),
            row(
                new ButtonBuilder().setCustomId(cid("sugthreads")).setLabel(settings.create_threads ? t("Desativar threads") : t("Ativar threads")).setStyle(ButtonStyle.Secondary),
            ),
            backRow(),
        ],
    });
}

// ─── Anti-spam ──────────────────────────────────────────────────────────────
async function buildAntiSpamContainer(guild: Guild, guildId: string): Promise<ContainerPlusBuilder> {
    const settings = await getAntiSpamSettings(guildId);

    const actionSelect = row(
        new StringSelectMenuBuilder()
            .setCustomId(cid("asaction"))
            .setPlaceholder(t("Punição a aplicar"))
            .addOptions(ANTISPAM_ACTIONS.map((action) => ({
                label: t(ANTISPAM_ACTION_LABELS[action]).slice(0, 100),
                value: action,
                default: settings.action === action,
            }))),
    );

    return buildContainer({
        color: settings.enabled ? COLORS.success : COLORS.neutral,
        title: `${emoji.shield} Anti-spam`,
        description: [
            t("Proteção automática: flood, mensagens repetidas, links/convites, menções e contas novas."),
            "",
            `${emoji.warn} ${t("O **timeout** do Discord impede o membro de interagir com tudo — nem consegue abrir um ticket para recorrer. Para que quem for punido por engano se possa defender, usa o **cargo de castigo**: retira acesso a todos os canais exceto ao dos tickets.")}`,
        ].join("\n"),
        fields: [
            { name: t("Estado"), value: onOff(settings.enabled) },
            { name: t("Punição"), value: t(ANTISPAM_ACTION_LABELS[settings.action]) },
            { name: t("Cargo de castigo"), value: displayRole(settings.quarantine_role) },
            { name: t("Limpar mensagens do infrator"), value: settings.purge_recent ? `${onOff(true)} — ${t("últimos {minutes} min", { minutes: settings.purge_minutes })}` : onOff(false) },
            { name: t("Canal de logs"), value: displayChannel(settings.log_channel) },
            { name: t("Cargos isentos"), value: displayRoleList(settings.exempt_roles) },
            { name: t("Permitir convites Discord"), value: onOff(settings.allow_invites) },
            { name: t("Flood"), value: t("{messages} msgs / {seconds}s", { messages: settings.flood_messages, seconds: settings.flood_window_seconds }) },
            { name: t("Limiar de ação"), value: t("{count, plural, one {# ponto} other {# pontos}}", { count: settings.score_threshold }) },
            { name: t("Conta nova (suspeita)"), value: `< ${t("{count, plural, one {# dia} other {# dias}}", { count: settings.min_account_age_days })}` },
            { name: t("Whitelist de links"), value: (settings.link_whitelist.join(", ") || t("*Vazia*")).slice(0, 1024) },
        ],
        rows: [
            row(
                new ButtonBuilder().setCustomId(cid("astoggle")).setLabel(settings.enabled ? t("Desativar") : t("Ativar")).setEmoji(settings.enabled ? emoji.error : emoji.success).setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder().setCustomId(cid("asinvites")).setLabel(settings.allow_invites ? t("Bloquear convites") : t("Permitir convites")).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(cid("aspurge")).setLabel(settings.purge_recent ? t("Não limpar mensagens") : t("Limpar mensagens")).setStyle(ButtonStyle.Secondary),
            ),
            actionSelect,
            row(new RoleSelectMenuBuilder().setCustomId(cid("asquarantine")).setPlaceholder(t("Cargo de castigo (só vê o canal dos tickets)")).setMinValues(0).setMaxValues(1)),
            categoryChannelSelect(guild, cid("aslog"), t("Canal de logs do anti-spam"), settings.log_channel),
            row(new RoleSelectMenuBuilder().setCustomId(cid("asexempt")).setPlaceholder(t("Cargos isentos (opcional)")).setMinValues(0).setMaxValues(10)),
            row(
                new ButtonBuilder().setCustomId(cid("asthresholds")).setLabel(t("Editar limites")).setEmoji(emoji.settings).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("aswhitelist")).setLabel(t("Editar whitelist")).setEmoji(emoji.link).setStyle(ButtonStyle.Primary),
            ),
            backRow(),
        ],
    });
}

// ─── Giveaways ────────────────────────────────────────────────────────────────
async function buildGiveawaysContainer(guild: Guild, guildId: string): Promise<ContainerPlusBuilder> {
    const settings = await getGiveawaySettings(guildId);
    return buildContainer({
        color: COLORS.gold,
        title: `${emoji.gift} Giveaways`,
        description: t("Define o canal padrão dos sorteios e o cargo que pode criá-los. Usa `/sorteio criar` para lançar um sorteio."),
        fields: [
            { name: t("Canal padrão"), value: displayChannel(settings.default_channel) },
            { name: t("Cargo de organizador"), value: displayRole(settings.host_role) },
        ],
        rows: [
            categoryChannelSelect(guild, cid("gwchannel"), t("Canal padrão dos sorteios"), settings.default_channel),
            row(new RoleSelectMenuBuilder().setCustomId(cid("gwhost")).setPlaceholder(t("Cargo de organizador (opcional)")).setMinValues(0).setMaxValues(1)),
            backRow(),
        ],
    });
}

// ─── Anti-spam modals ─────────────────────────────────────────────────────────
export function buildAntiSpamThresholdsModal(settings: AntiSpamSettings): ModalBuilder {
    const field = (id: string, label: string, value: number) =>
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6).setValue(String(value)),
        );
    return new ModalBuilder()
        .setCustomId(cid("asthresholds", "submit"))
        .setTitle(t("Limiares do anti-spam"))
        .addComponents(
            field("flood_messages", t("Flood: nº de mensagens"), settings.flood_messages),
            field("flood_window_seconds", t("Flood: janela (segundos)"), settings.flood_window_seconds),
            field("score_threshold", t("Limiar de ação (pontos)"), settings.score_threshold),
            field("min_account_age_days", t("Conta nova: idade mínima (dias)"), settings.min_account_age_days),
        );
}

export function buildAntiSpamWhitelistModal(settings: AntiSpamSettings): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(cid("aswhitelist", "submit"))
        .setTitle(t("Whitelist de links"))
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("whitelist")
                .setLabel(t("Domínios permitidos (um por linha)"))
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(1000)
                .setValue(settings.link_whitelist.join("\n"))
                .setPlaceholder("youtube.com\ngithub.com\ncdn.discordapp.com"),
        ));
}

// ─── Support / office hours ─────────────────────────────────────────────────
async function buildSupportContainer(guildId: string): Promise<ContainerPlusBuilder> {
    const config = await ensureGuildConfig(guildId);
    const hours = parseSupportHours(config);
    const categories = getTicketCategories(config);

    const hoursValue = hours
        ? `${onOff(hours.enabled)} • ${formatSupportWindow(hours)}\n${formatSupportWindowNote(hours)}`
        : t("*Sem horário definido — tickets sempre tratados como em horário.*");

    const welcomeSummary = categories
        .map((category) => `${category.welcome_message ? emoji.success : emoji.error} **${category.label}**`)
        .join("\n");

    return buildContainer({
        color: COLORS.info,
        title: `${emoji.clock} Atendimento`,
        description: t("Define o horário de atendimento (fora dele os tickets recebem um aviso informativo), a mensagem de boas-vindas de cada categoria e o cargo dado a quem abre ticket."),
        fields: [
            { name: t("Horário de atendimento"), value: hoursValue },
            { name: t("Cargo dado a quem abre ticket"), value: displayRole(config.client_role) },
            { name: t("Mensagens de boas-vindas por categoria"), value: welcomeSummary || t("*Sem categorias.*") },
        ],
        rows: [
            row(new StringSelectMenuBuilder()
                .setCustomId(cid("welcomecat"))
                .setPlaceholder(t("Editar boas-vindas de uma categoria…"))
                .addOptions(categories.slice(0, 25).map((category) => ({
                    label: category.label.slice(0, 100),
                    value: category.id,
                    description: (category.welcome_message ? t("Mensagem definida") : t("Sem mensagem")).slice(0, 100),
                    emoji: ei(category.welcome_message ? "success" : "note"),
                })))),
            row(new RoleSelectMenuBuilder().setCustomId(cid("clientrole")).setPlaceholder(t("Cargo dado a quem abre ticket (opcional)")).setMinValues(0).setMaxValues(1)),
            row(
                new ButtonBuilder().setCustomId(cid("supporthours")).setLabel(t("Definir horário")).setEmoji(emoji.clock).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("supportoff")).setLabel(t("Remover horário")).setEmoji(emoji.error).setStyle(ButtonStyle.Secondary).setDisabled(!hours),
            ),
            backRow(),
        ],
    });
}

export function buildSupportHoursModal(config: { support_hours_json: string | null }): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(cid("supporthours", "submit"))
        .setTitle(t("Horário de atendimento"))
        .addLabelComponents(...supportHoursModalFields(parseSupportHours(config)));
}

export function buildCategoryWelcomeModal(categoryId: string, categoryLabel: string, current: string | null): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(cid("welcome", categoryId))
        .setTitle(t("Boas-vindas — {category}", { category: categoryLabel }).slice(0, 45))
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("message")
                .setLabel(t("Mensagem (vazio = remover)"))
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(1500)
                .setValue(current ?? "")
                .setPlaceholder(t("Ex.: Olá! Obrigado por abrires um ticket. Descreve o teu pedido com o máximo de detalhe.")),
        ));
}

// ─── Entrada / Saída (welcome) ──────────────────────────────────────────────
async function buildWelcomeContainer(guild: Guild, guildId: string): Promise<ContainerPlusBuilder> {
    const config = await ensureGuildConfig(guildId);
    return buildContainer({
        color: COLORS.info,
        title: `${e("join")} ${t("Entrada / Saída")}`,
        description: t("Define as salas onde são publicados os logs de entrada e saída de membros (a de entrada inclui o convite usado, quando disponível)."),
        fields: [
            { name: t("Sala de entradas"), value: displayChannel(config.join_log_channel) },
            { name: t("Sala de saídas"), value: displayChannel(config.leave_log_channel) },
        ],
        rows: [
            categoryChannelSelect(guild, cid("joinlog"), t("Sala de entradas"), config.join_log_channel),
            categoryChannelSelect(guild, cid("leavelog"), t("Sala de saídas"), config.leave_log_channel),
            backRow(),
        ],
    });
}

// ─── Canais de voz temporários ───────────────────────────────────────────────
async function buildVoiceContainer(_guild: Guild, guildId: string): Promise<ContainerPlusBuilder> {
    const settings = await getVoiceSettings(guildId);
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.voice} ${t("Canais de voz temporários")}`,
        description: t("Entrar no canal hub cria uma sala pessoal que desaparece quando fica vazia. Nos tickets, /voz cria uma sala privada dono+staff."),
        fields: [
            { name: t("Canal hub (join-to-create)"), value: displayChannel(settings.hub_channel) },
            { name: t("Categoria das salas"), value: settings.category_id ? `<#${settings.category_id}>` : t("*Mesma do hub*") },
            { name: t("Nome das salas"), value: settings.name_template },
            { name: t("Limite por sala"), value: settings.user_limit > 0 ? String(settings.user_limit) + " membros" : t("Sem limite") },
            { name: t("Dono gere a sala"), value: onOff(settings.owner_can_manage) },
            { name: t("Voz privada por ticket (/voz)"), value: onOff(settings.ticket_voice_enabled) },
        ],
        rows: [
            row(new ChannelSelectMenuBuilder().setCustomId(cid("voicehub")).setPlaceholder(t("Canal hub de voz (entrar = criar sala)")).addChannelTypes(ChannelType.GuildVoice).setMinValues(0).setMaxValues(1)),
            row(new ChannelSelectMenuBuilder().setCustomId(cid("voicecat")).setPlaceholder(t("Categoria onde criar as salas (opcional)")).addChannelTypes(ChannelType.GuildCategory).setMinValues(0).setMaxValues(1)),
            row(
                new ButtonBuilder().setCustomId(cid("voiceticket")).setLabel(settings.ticket_voice_enabled ? t("Desativar voz por ticket") : t("Ativar voz por ticket")).setStyle(settings.ticket_voice_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder().setCustomId(cid("voiceowner")).setLabel(settings.owner_can_manage ? t("Dono não gere a sala") : t("Dono gere a sala")).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(cid("voicenames")).setLabel(t("Nome e limite")).setStyle(ButtonStyle.Secondary),
            ),
            backRow(),
        ],
    });
}

export function buildVoiceNamesModal(nameTemplate: string, userLimit: number): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("voicenames")).setTitle(t("Salas temporárias")).addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("name_template").setLabel(t("Nome das salas ({user} = membro)")).setStyle(TextInputStyle.Short).setMaxLength(80).setValue(nameTemplate).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("user_limit").setLabel(t("Limite de membros (0 = sem limite)")).setStyle(TextInputStyle.Short).setMaxLength(2).setValue(String(userLimit)).setRequired(true)),
    );
}

// ─── Cargos (sticky + temporários) ───────────────────────────────────────────
async function buildRolesContainer(_guild: Guild, guildId: string): Promise<ContainerPlusBuilder> {
    const settings = await getRoleSettings(guildId);
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.role} Cargos`,
        description: t("Sticky roles: os cargos escolhidos voltam quando um membro sai e regressa. Cargos temporários geram-se com /cargotemp (warns com prazo, VIP por tempo)."),
        fields: [
            { name: t("Sticky roles"), value: onOff(settings.sticky_enabled) },
            { name: t("Cargos a persistir"), value: displayRoleList(settings.sticky_roles) },
        ],
        rows: [
            row(new ButtonBuilder().setCustomId(cid("stickytoggle")).setLabel(settings.sticky_enabled ? t("Desativar sticky roles") : t("Ativar sticky roles")).setStyle(settings.sticky_enabled ? ButtonStyle.Danger : ButtonStyle.Success)),
            row(new RoleSelectMenuBuilder().setCustomId(cid("stickyroles")).setPlaceholder(t("Cargos a devolver quando o membro regressa")).setMinValues(0).setMaxValues(20)),
            backRow(),
        ],
    });
}

// ─── Auto-cargos / Sociais / Moderação AI / Stats / Broadcast (hub compacto) ──
async function buildReactionRolesContainer(guild: Guild, guildId: string, current: ConfigState): Promise<ContainerPlusBuilder> {
    const settings = await getReactionRoleSettings(guildId);
    const selected = settings.panels.find((panel) => panel.id === current.rrPanel) ?? null;

    const fields: ContainerField[] = settings.panels.length
        ? settings.panels.slice(0, 8).map((panel) => ({
            name: (panel.id === selected?.id ? "▸ " : "") + panel.name,
            value: (panel.message_id ? "Publicado" : t("Por publicar")) + " • " + panel.roles.length + t(" cargo(s) • ") + (panel.channel_id ? "<#" + panel.channel_id + ">" : t("sem canal")) + t(" • modo: ") + (panel.mode === "select" ? "menu" : t("botões")),
        }))
        : [{ name: t("Sem painéis"), value: t("Cria o primeiro com o botão abaixo — nome, título, cargos e publicação, tudo por aqui.") }];
    if (selected) {
        fields.push({ name: t("Cargos de «{panel}»", { panel: selected.name }), value: selected.roles.length ? selected.roles.map((entry) => `<@&${entry.role_id}>`).join(", ").slice(0, 1024) : t("*Nenhum — usa o seletor de cargos abaixo.*") });
    }

    const rows: Row[] = [
        row(new ButtonBuilder().setCustomId(cid("rrnew")).setLabel(t("Criar painel")).setEmoji(emoji.add).setStyle(ButtonStyle.Success)),
    ];
    if (settings.panels.length > 0) {
        rows.push(row(new StringSelectMenuBuilder().setCustomId(cid("rrpick")).setPlaceholder(t("Escolher painel para editar…"))
            .addOptions(settings.panels.slice(0, 25).map((panel) => ({
                label: panel.name.slice(0, 100),
                value: panel.id,
                description: ((panel.message_id ? "Publicado" : t("Por publicar")) + " • " + panel.roles.length + t(" cargo(s)")).slice(0, 100),
                default: panel.id === selected?.id,
            })))));
    }
    if (selected) {
        rows.push(
            categoryChannelSelect(guild, cid("rrchannel", selected.id), t("Canal onde publicar o painel"), selected.channel_id),
            row(new RoleSelectMenuBuilder().setCustomId(cid("rrroles", selected.id)).setPlaceholder(t("Cargos do painel (a ordem define a ordem dos botões)")).setMinValues(0).setMaxValues(20)),
            row(
                new ButtonBuilder().setCustomId(cid("rrmeta", selected.id)).setLabel(t("Título, modo e limites")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(cid("rrpub", selected.id)).setLabel(selected.message_id ? "Republicar" : "Publicar").setEmoji(emoji.megaphone).setStyle(ButtonStyle.Success).setDisabled(!selected.channel_id || selected.roles.length === 0),
                new ButtonBuilder().setCustomId(cid("rrdelpanel", selected.id)).setLabel(t("Apagar painel")).setEmoji(emoji.trash).setStyle(ButtonStyle.Danger),
            ),
        );
    }
    rows.push(backRow());
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.role} Auto-cargos`,
        description: t("Painéis onde os membros escolhem os próprios cargos (botões ou menu). Cria, edita e publica tudo por aqui."),
        fields,
        rows,
    });
}

/** Campo de texto dentro de uma `Label` — o formato dos modais com componentes ricos. */
function textField(id: string, label: string, value: string, opts?: { required?: boolean; paragraph?: boolean; max?: number; placeholder?: string; description?: string }): LabelBuilder {
    const input = new TextInputBuilder()
        .setCustomId(id)
        .setStyle(opts?.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(opts?.required ?? false)
        .setMaxLength(opts?.max ?? 100)
        .setPlaceholder(opts?.placeholder ?? "");
    if (value) input.setValue(value);
    const built = new LabelBuilder().setLabel(label).setTextInputComponent(input);
    if (opts?.description) built.setDescription(opts.description);
    return built;
}

export function buildReactionRolePanelModal(panel?: { id: string; name: string; title: string; description: string | null; mode: "buttons" | "select"; max_roles: number }): ModalBuilder {
    // O modo era um campo de texto onde se escrevia "botoes" ou "menu" — agora é uma
    // escolha com bolinhas, que não dá para escrever errado.
    const mode = new LabelBuilder().setLabel(t("Modo de escolha")).setRadioGroupComponent(
        new RadioGroupBuilder()
            .setCustomId("mode")
            .setRequired(true)
            .addOptions(
                { label: t("Botões"), value: "buttons", description: t("Um botão por cargo, sempre à vista."), default: panel?.mode !== "select" },
                { label: t("Menu suspenso"), value: "select", description: t("Uma lista — melhor para muitos cargos."), default: panel?.mode === "select" },
            ),
    );

    return new ModalBuilder()
        .setCustomId(panel ? cid("rrmeta", panel.id) : cid("rrnew"))
        .setTitle(panel ? t("Editar — {name}", { name: panel.name }).slice(0, 45) : t("Novo painel de auto-cargos"))
        .addLabelComponents(
            textField("name", t("Nome interno do painel"), panel?.name ?? "", { required: true, max: 60, placeholder: t("Ex.: Cargos de jogos"), description: t("Só tu o vês, na lista de painéis.") }),
            textField("title", t("Título mostrado aos membros"), panel?.title ?? "", { required: true, max: 100, placeholder: t("Ex.: Escolhe os teus jogos") }),
            textField("description", t("Descrição (opcional)"), panel?.description ?? "", { paragraph: true, max: 500, placeholder: t("Texto por cima dos botões/menu.") }),
            mode,
            textField("max_roles", t("Máx. cargos em simultâneo"), String(panel?.max_roles ?? 0), { required: true, max: 2, placeholder: "0", description: t("0 = sem limite. No menu: máximo de escolhas. Nos botões: 1 = só uma opção de cada vez.") }),
        );
}

async function buildSocialContainer(guild: Guild, guildId: string, current: ConfigState): Promise<ContainerPlusBuilder> {
    const settings = await getSocialSettings(guildId);
    const selected = settings.subscriptions.find((sub) => sub.id === current.socialSub) ?? settings.subscriptions[0] ?? null;
    const rows: Row[] = [
        row(new ButtonBuilder().setCustomId(cid("socialadd")).setLabel(t("Adicionar conta")).setEmoji(emoji.add).setStyle(ButtonStyle.Success)),
    ];
    if (settings.subscriptions.length > 0) {
        rows.push(row(new StringSelectMenuBuilder().setCustomId(cid("socialpick")).setPlaceholder(t("Escolher subscrição para gerir…"))
            .addOptions(settings.subscriptions.slice(0, 25).map((sub) => ({
                label: ((sub.display_name ?? sub.handle) + " (" + platformName(sub.platform) + ")").slice(0, 100),
                value: sub.id,
                default: selected?.id === sub.id,
            })))));
        if (selected) {
            rows.push(
                categoryChannelSelect(guild, cid("socialchan", selected.id), t("Canal de anúncio para ") + (selected.display_name ?? selected.handle), selected.announce_channel),
                row(new RoleSelectMenuBuilder().setCustomId(cid("socialmention", selected.id)).setPlaceholder(t("Cargo a mencionar nos anúncios (opcional)")).setMinValues(0).setMaxValues(1)),
                row(
                    new ButtonBuilder().setCustomId(cid("socialtpl", selected.id)).setLabel(t("Editar mensagem do anúncio")).setEmoji(emoji.edit).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(cid("socialdel", selected.id)).setLabel(t("Remover esta subscrição")).setEmoji(emoji.trash).setStyle(ButtonStyle.Danger),
                ),
            );
        }
    }
    rows.push(backRow());
    const subLine = (sub: typeof settings.subscriptions[number]): string => {
        const parts = [
            sub.announce_channel ? "<#" + sub.announce_channel + ">" : t("*sem canal de anúncio*"),
            sub.mention_role ? t("menciona <@&") + sub.mention_role + ">" : t("sem menção"),
            sub.message_template ? t("mensagem personalizada") : t("mensagem padrão"),
        ];
        return parts.join(" • ");
    };
    // Twitch e Kick precisam de credenciais da instância; sem elas, diz-se logo.
    const unavailable = [!isTwitchConfigured() ? "Twitch" : null, !isKickConfigured() ? "Kick" : null].filter((name): name is string => name !== null);
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.megaphone} ${t("Alertas sociais")}`,
        description: [
            t("O bot avisa quando uma conta publica um vídeo novo (YouTube, TikTok) ou entra em direto (Twitch, Kick, TikTok). Canal, menção e mensagem configuram-se aqui."),
            unavailable.length ? `-# ${t("Ainda indisponível nesta instância: {platforms}.", { platforms: unavailable.join(", ") })}` : null,
        ].filter(Boolean).join("\n"),
        fields: settings.subscriptions.length
            ? settings.subscriptions.slice(0, 10).map((sub) => ({ name: platformName(sub.platform) + " — " + (sub.display_name ?? sub.handle), value: subLine(sub) }))
            : [{ name: t("Sem subscrições"), value: t("Usa o botão abaixo para adicionar a primeira.") }],
        rows,
    });
}

export function buildSocialTemplateModal(subId: string, current: string | null): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("socialtpl", subId)).setTitle(t("Mensagem do anúncio")).addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("template")
                .setLabel(t("Template ({name} {title} {url}; vazio = padrão)"))
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500)
                .setValue(current ?? "")
                .setPlaceholder(t("📢 {name} publicou: **{title}**\n{url}")),
        ),
    );
}

export function buildSocialAddModal(): ModalBuilder {
    // Plataforma como escolha, não como texto livre: escrever "youtube" à mão era a única
    // forma de acertar, e qualquer outra coisa caía silenciosamente no YouTube.
    const platform = new LabelBuilder().setLabel(t("Plataforma")).setRadioGroupComponent(
        new RadioGroupBuilder()
            .setCustomId("platform")
            .setRequired(true)
            .addOptions(
                { label: t("YouTube"), value: "youtube", description: t("Anuncia vídeos novos do canal."), default: true },
                { label: t("TikTok"), value: "tiktok", description: t("Anuncia vídeos novos e diretos.") },
                { label: t("Twitch"), value: "twitch", description: t("Anuncia quando o canal entra em direto.") },
                { label: t("Kick"), value: "kick", description: t("Anuncia quando o canal entra em direto.") },
            ),
    );

    return new ModalBuilder().setCustomId(cid("socialadd")).setTitle(t("Adicionar conta")).addLabelComponents(
        platform,
        textField("handle", t("Conta a seguir"), "", { required: true, max: 120, placeholder: t("UCxxxxxxxxxxxxxxxxxxxxxx ou nome do perfil"), description: t("YouTube: o ID do canal (UC…). TikTok, Twitch e Kick: o nome do perfil ou o link.") }),
        textField("display_name", t("Nome a mostrar (opcional)"), "", { max: 60, placeholder: t("Ex.: Canal do Zé") }),
    );
}

const PLATFORM_NAMES: Record<string, string> = { youtube: "YouTube", twitch: "Twitch", tiktok: "TikTok", kick: "Kick", instagram: "Instagram" };

function platformName(platform: string): string {
    return PLATFORM_NAMES[platform] ?? platform;
}

async function buildStatsContainer(_guild: Guild, guildId: string): Promise<ContainerPlusBuilder> {
    const settings = await getStatsSettings(guildId);
    const active = new Set(settings.stats.map((entry) => entry.key));
    const rows: Row[] = [
        row(new ChannelSelectMenuBuilder().setCustomId(cid("statscat")).setPlaceholder(t("Categoria dos canais de estatísticas")).addChannelTypes(ChannelType.GuildCategory).setMinValues(0).setMaxValues(1)),
        row(new StringSelectMenuBuilder().setCustomId(cid("statspick")).setPlaceholder(t("Que estatísticas mostrar…")).setMinValues(0).setMaxValues(STAT_KEYS.length)
            .addOptions(STAT_KEYS.map((key) => ({ label: t(STAT_LABELS[key]), value: key, default: active.has(key) })))),
    ];
    if (settings.stats.length > 0) {
        rows.push(row(new StringSelectMenuBuilder().setCustomId(cid("stattpl")).setPlaceholder(t("Personalizar o nome de uma estatística…"))
            .addOptions(settings.stats.slice(0, 25).map((entry) => ({
                label: t(STAT_LABELS[entry.key]),
                value: entry.key,
                description: entry.template.slice(0, 100),
                emoji: ei("edit"),
            })))));
    }
    rows.push(backRow());
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.chart} ${t("Canais de estatísticas")}`,
        description: t("Escolhe a categoria e as estatísticas — o bot cria os canais de voz trancados sozinho e atualiza a cada 10 min. Personaliza o nome de cada canal com o seletor abaixo."),
        fields: [
            { name: t("Categoria"), value: settings.category_id ? "<#" + settings.category_id + ">" : t("*Não definida*") },
            { name: t("Estatísticas ativas"), value: settings.stats.length ? settings.stats.map((entry) => `**${t(STAT_LABELS[entry.key])}** — \`${entry.template}\``).join("\n") : t("*Nenhuma*") },
        ],
        rows,
    });
}

export function buildStatTemplateModal(key: string, label: string, current: string): ModalBuilder {
    return new ModalBuilder().setCustomId(cid("stattpl", key)).setTitle(t("Nome do canal — {stat}", { stat: label }).slice(0, 45)).addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("template")
                .setLabel(t("Template ({value} = número)"))
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(90)
                .setValue(current)
                .setPlaceholder(t("👥 Membros: {value}")),
        ),
    );
}

async function buildBroadcastContainer(_guild: Guild, guildId: string): Promise<ContainerPlusBuilder> {
    const settings = await getBroadcastSettings(guildId);
    const rows: Row[] = [
        row(new ChannelSelectMenuBuilder().setCustomId(cid("bcautopub")).setPlaceholder(t("Canais de announcements com auto-publish")).addChannelTypes(ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(10)),
        backRow(),
    ];
    return buildContainer({
        color: COLORS.primary,
        title: `${emoji.bell} Broadcast`,
        description: t("Publica automaticamente, para os servidores seguidores, tudo o que sai nos canais de announcements escolhidos."),
        fields: [
            { name: t("Auto-publish"), value: settings.autopublish_channels.length ? settings.autopublish_channels.map((id) => "<#" + id + ">").join(", ") : t("*Nenhum canal*") },
        ],
        rows,
    });
}

export async function buildConfigComponents(section: ConfigSection, guildId: string, guild: Guild, userId: string): Promise<ContainerPlusBuilder[]> {
    const current = getConfigState(guildId, userId);
    switch (section) {
        case "giveaways": return [await buildGiveawaysContainer(guild, guildId)];
        case "support": return [await buildSupportContainer(guildId)];
        case "welcome": return [await buildWelcomeContainer(guild, guildId)];
        case "logs": return [await buildLogsContainer(guild, guildId, current.logCategory)];
        case "suggestions": return [await buildSuggestionsContainer(guild, guildId)];
        case "antispam": return [await buildAntiSpamContainer(guild, guildId)];
        case "voice": return [await buildVoiceContainer(guild, guildId)];
        case "roles": return [await buildRolesContainer(guild, guildId)];
        case "reactionroles": return [await buildReactionRolesContainer(guild, guildId, current)];
        case "social": return [await buildSocialContainer(guild, guildId, current)];
        case "stats": return [await buildStatsContainer(guild, guildId)];
        case "broadcast": return [await buildBroadcastContainer(guild, guildId)];
        case "sla": return [await buildSlaContainer(guildId)];
        case "modmail": return [await buildModmailContainer(guildId)];
        case "verify": return [await buildVerifyContainer(guildId)];
        case "levels": return [await buildLevelsContainer(guildId)];
        case "economy": return [await buildEconomyContainer(guildId)];
        case "games": return [await buildGamesContainer(guildId)];
        case "moderation": return [await buildModerationContainer(guildId)];
        case "welcomemsg": return [await buildWelcomeMessagesContainer(guildId)];
        case "starboard": return [await buildStarboardContainer(guildId)];
        case "appeals": return [await buildAppealContainer(guildId, guild.client)];
        case "protection": return [await buildProtectionContainer(guildId)];
        case "lockdown": return [await buildLockdownContainer(guildId)];
        case "reports": return [await buildReportsContainer(guildId)];
        case "counting": return [await buildCountingContainer(guildId)];
        case "confessions": return [await buildConfessionsContainer(guildId)];
        case "hub":
        default: return [buildHubContainer()];
    }
}
