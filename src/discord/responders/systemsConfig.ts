import { t } from "../../lib/i18n.js";
import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import {
    GuildMember,
    type AnySelectMenuInteraction,
    type ButtonInteraction,
    type ModalMessageModalSubmitInteraction,
    type RepliableInteraction,
} from "discord.js";
import { ensureGuildConfig, upsertGuildConfig } from "../../repositories/guildConfigRepository.js";
import { errorContainer } from "../../lib/containers.js";
import { hasSuperAdminAccess, replyContainer, roleGrantProblem } from "../../lib/discord.js";
import { parseCustomId } from "../../lib/ids.js";
import {
    buildAntiSpamThresholdsModal,
    buildAntiSpamWhitelistModal,
    buildCategoryWelcomeModal,
    buildConfigComponents,
    buildReactionRolePanelModal,
    buildSocialAddModal,
    buildSocialTemplateModal,
    buildStatTemplateModal,
    buildSupportHoursModal,
    buildVoiceNamesModal,
    setConfigState,
    type ConfigSection,
} from "../../modules/config/configPanel.js";
import {
    getTicketCategories,
    getCategoryLabel,
    serializeTicketCategories,
    setCategoryWelcome,
} from "../../modules/tickets/categories.js";
import { DEFAULT_SUPPORT_TZ, isValidTimezone, serializeSupportHours } from "../../modules/tickets/officeHours.js";
import { enableAllLogCategories, getLogSettings, saveLogSettings, setAllLogCategoriesChannel } from "../../modules/logs/logSettings.js";
import { getSuggestionSettings, saveSuggestionSettings } from "../../modules/suggestions/suggestionSettings.js";
import { getAntiSpamSettings, saveAntiSpamSettings } from "../../modules/antispam/antispamSettings.js";
import { syncQuarantineRole } from "../../modules/antispam/quarantine.js";
import { saveGiveawaySettings } from "../../modules/giveaways/giveawaySettings.js";
import { getVoiceSettings, saveVoiceSettings } from "../../modules/voice/voiceSettings.js";
import { getRoleSettings, saveRoleSettings } from "../../modules/roles/roleSettings.js";
import { saveBroadcastSettings, getStatsSettings, saveStatsSettings, getSocialSettings, saveSocialSettings, getReactionRoleSettings, saveReactionRoleSettings } from "../../modules/community/communitySettings.js";
import { STAT_DEFAULT_TEMPLATES, STAT_LABELS } from "../../modules/community/statsAndBroadcast.js";
import { isSocialPlatform, normalizeSocialHandle } from "../../modules/community/socialAlerts.js";
import { randomUUID } from "node:crypto";
import { STAT_KEYS, ANTISPAM_ACTIONS, type AntiSpamAction, type StatKey, type ReactionRolePanel } from "../../types.js";
import { createEmptyPanel, MAX_RR_PANELS, MAX_RR_ROLES, publishReactionRolePanel } from "../../modules/community/reactionRoles.js";
import { buildSetupComponents, clearDraft, getDraft } from "../../modules/setup/setupWizard.js";
import { LOG_CATEGORIES, type LogCategory } from "../../types.js";

type UpdatableInteraction =
    | ButtonInteraction<"cached">
    | AnySelectMenuInteraction<"cached">
    | ModalMessageModalSubmitInteraction<"cached">;

async function gate(interaction: RepliableInteraction): Promise<boolean> {
    if (!interaction.inCachedGuild()) return false;
    const config = await ensureGuildConfig(interaction.guildId);
    if (!hasSuperAdminAccess(interaction.member as GuildMember, config.admin_role)) {
        await replyContainer(interaction, errorContainer(t("Apenas super-admin ou `Administrator` pode usar este painel.")));
        return false;
    }
    return true;
}

async function render(interaction: UpdatableInteraction, section: ConfigSection): Promise<void> {
    const components = await buildConfigComponents(section, interaction.guildId, interaction.guild, interaction.user.id);
    await interaction.update({ components });
}

function clampInt(value: string, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function isLogCategory(value: string): value is LogCategory {
    return (LOG_CATEGORIES as readonly string[]).includes(value);
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
createResponder({
    customId: "cfg/**",
    types: [ResponderType.Button],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (!(await gate(interaction))) return;
        const { action, systemId } = parseCustomId(interaction.customId);
        const guildId = interaction.guildId;

        switch (action) {
            case "back":
                setConfigState(guildId, interaction.user.id, { section: "hub" });
                return void render(interaction, "hub");

            // Logs
            case "logtoggle": {
                if (!isLogCategory(systemId)) return void interaction.deferUpdate();
                const settings = await getLogSettings(guildId);
                const categories = { ...settings.categories, [systemId]: { ...settings.categories[systemId], enabled: !settings.categories[systemId].enabled } };
                await saveLogSettings(guildId, { categories });
                setConfigState(guildId, interaction.user.id, { logCategory: systemId });
                return void render(interaction, "logs");
            }
            case "logenableall": {
                await enableAllLogCategories(guildId);
                return void render(interaction, "logs");
            }
            case "logallchan": {
                if (!isLogCategory(systemId)) return void interaction.deferUpdate();
                const settings = await getLogSettings(guildId);
                const channelId = settings.categories[systemId].channel_id;
                if (channelId) await setAllLogCategoriesChannel(guildId, channelId);
                setConfigState(guildId, interaction.user.id, { logCategory: systemId });
                return void render(interaction, "logs");
            }

            // Suggestions
            case "sugthreads": {
                const settings = await getSuggestionSettings(guildId);
                await saveSuggestionSettings(guildId, { create_threads: !settings.create_threads });
                return void render(interaction, "suggestions");
            }

            // Anti-spam
            case "astoggle": {
                const settings = await getAntiSpamSettings(guildId);
                await saveAntiSpamSettings(guildId, { enabled: !settings.enabled });
                return void render(interaction, "antispam");
            }
            case "asinvites": {
                const settings = await getAntiSpamSettings(guildId);
                await saveAntiSpamSettings(guildId, { allow_invites: !settings.allow_invites });
                return void render(interaction, "antispam");
            }
            case "aspurge": {
                const settings = await getAntiSpamSettings(guildId);
                await saveAntiSpamSettings(guildId, { purge_recent: !settings.purge_recent });
                return void render(interaction, "antispam");
            }
            case "asthresholds":
                return void interaction.showModal(buildAntiSpamThresholdsModal(await getAntiSpamSettings(guildId)));
            case "aswhitelist":
                return void interaction.showModal(buildAntiSpamWhitelistModal(await getAntiSpamSettings(guildId)));

            // Support / office hours
            case "supporthours":
                return void interaction.showModal(buildSupportHoursModal(await ensureGuildConfig(guildId)));
            case "supportoff":
                await upsertGuildConfig({ guild_id: guildId, support_hours_json: null });
                return void render(interaction, "support");

            // Canais de voz temporários
            case "voiceticket": {
                const settings = await getVoiceSettings(guildId);
                await saveVoiceSettings(guildId, { ticket_voice_enabled: !settings.ticket_voice_enabled });
                return void render(interaction, "voice");
            }
            case "voiceowner": {
                const settings = await getVoiceSettings(guildId);
                await saveVoiceSettings(guildId, { owner_can_manage: !settings.owner_can_manage });
                return void render(interaction, "voice");
            }
            case "voicenames": {
                const settings = await getVoiceSettings(guildId);
                return void interaction.showModal(buildVoiceNamesModal(settings.name_template, settings.user_limit));
            }

            // Cargos (sticky)
            case "stickytoggle": {
                const settings = await getRoleSettings(guildId);
                await saveRoleSettings(guildId, { sticky_enabled: !settings.sticky_enabled });
                return void render(interaction, "roles");
            }

            // Alertas sociais
            case "socialadd":
                return void interaction.showModal(buildSocialAddModal());
            case "socialdel": {
                const { systemId: subId } = parseCustomId(interaction.customId);
                const settings = await getSocialSettings(guildId);
                await saveSocialSettings(guildId, { subscriptions: settings.subscriptions.filter((sub) => sub.id !== subId) });
                return void render(interaction, "social");
            }
            case "socialtpl": {
                const settings = await getSocialSettings(guildId);
                const sub = settings.subscriptions.find((entry) => entry.id === systemId);
                if (!sub) return void interaction.deferUpdate();
                return void interaction.showModal(buildSocialTemplateModal(sub.id, sub.message_template));
            }

            // Auto-cargos (editor completo no Discord)
            case "rrnew": {
                const settings = await getReactionRoleSettings(guildId);
                if (settings.panels.length >= MAX_RR_PANELS) {
                    await replyContainer(interaction, errorContainer(t("Máximo de {max} painéis de auto-cargos.", { max: MAX_RR_PANELS })));
                    return;
                }
                return void interaction.showModal(buildReactionRolePanelModal());
            }
            case "rrmeta": {
                const settings = await getReactionRoleSettings(guildId);
                const panel = settings.panels.find((entry) => entry.id === systemId);
                if (!panel) return void interaction.deferUpdate();
                return void interaction.showModal(buildReactionRolePanelModal(panel));
            }
            case "rrpub": {
                const config = await ensureGuildConfig(guildId);
                const result = await publishReactionRolePanel(interaction.guild, systemId, config);
                if (!result.ok) {
                    await replyContainer(interaction, errorContainer(result.error ?? t("Falha ao publicar o painel.")));
                    return;
                }
                return void render(interaction, "reactionroles");
            }
            case "rrdelpanel": {
                const settings = await getReactionRoleSettings(guildId);
                await saveReactionRoleSettings(guildId, { panels: settings.panels.filter((entry) => entry.id !== systemId) });
                setConfigState(guildId, interaction.user.id, { rrPanel: null });
                return void render(interaction, "reactionroles");
            }

            default:
                return void interaction.deferUpdate();
        }
    },
});

// ─── String selects ────────────────────────────────────────────────────────────
createResponder({
    customId: "cfg/**",
    types: [ResponderType.StringSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (!(await gate(interaction))) return;
        const { action } = parseCustomId(interaction.customId);
        const guildId = interaction.guildId;
        const value = interaction.values[0];

        if (action === "hub") {
            if (value === "tickets") {
                // Delegate to the live ticket config wizard (its own responders take over).
                clearDraft("config", guildId, interaction.user.id);
                const draft = await getDraft("config", guildId, interaction.user.id);
                return void interaction.update({ components: buildSetupComponents(draft) });
            }
            const section = value as ConfigSection;
            setConfigState(guildId, interaction.user.id, { section });
            return void render(interaction, section);
        }

        if (action === "logcat") {
            if (isLogCategory(value)) setConfigState(guildId, interaction.user.id, { logCategory: value });
            return void render(interaction, "logs");
        }

        if (action === "welcomecat") {
            const config = await ensureGuildConfig(guildId);
            const category = getTicketCategories(config).find((entry) => entry.id === value);
            if (!category) return void interaction.deferUpdate();
            return void interaction.showModal(buildCategoryWelcomeModal(category.id, category.label, category.welcome_message ?? null));
        }


        // Os seletores de canal migraram para o ChannelSelect nativo (sem limite de 25).
        switch (action) {
            case "asaction": {
                if (!(ANTISPAM_ACTIONS as readonly string[]).includes(value)) return void render(interaction, "antispam");
                await saveAntiSpamSettings(guildId, { action: value as AntiSpamAction });
                return void render(interaction, "antispam");
            }
            case "statspick": {
                const picked = interaction.values.filter((entry): entry is StatKey => (STAT_KEYS as readonly string[]).includes(entry));
                const current = await getStatsSettings(guildId);
                const stats = picked.map((key) => current.stats.find((entry) => entry.key === key) ?? { key, template: t(STAT_DEFAULT_TEMPLATES[key]), channel_id: null });
                await saveStatsSettings(guildId, { stats });
                return void render(interaction, "stats");
            }
            case "socialpick":
                setConfigState(guildId, interaction.user.id, { socialSub: value });
                return void render(interaction, "social");
            case "stattpl": {
                if (!(STAT_KEYS as readonly string[]).includes(value)) return void interaction.deferUpdate();
                const key = value as StatKey;
                const settings = await getStatsSettings(guildId);
                const entry = settings.stats.find((item) => item.key === key);
                return void interaction.showModal(buildStatTemplateModal(key, t(STAT_LABELS[key]), entry?.template ?? t(STAT_DEFAULT_TEMPLATES[key])));
            }
            case "rrpick":
                setConfigState(guildId, interaction.user.id, { rrPanel: value });
                return void render(interaction, "reactionroles");
            default:
                return void interaction.deferUpdate();
        }
    },
});

// ─── Channel selects ─────────────────────────────────────────────────────────
createResponder({
    customId: "cfg/**",
    types: [ResponderType.ChannelSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (!(await gate(interaction))) return;
        const { action, systemId } = parseCustomId(interaction.customId);
        const guildId = interaction.guildId;
        const values = interaction.values;
        // Menu nativo com MinValues(0): sem escolha = limpar o canal.
        const value = values[0] ?? null;

        switch (action) {
            case "statscat":
                await saveStatsSettings(guildId, { category_id: values[0] ?? null });
                return void render(interaction, "stats");

            // ─── Seletores de canal (migrados do StringSelect: este menu nativo mostra
            // TODOS os canais, enquanto o de opções estava limitado a 25) ───
            case "logchannel": {
                if (!isLogCategory(systemId)) return void interaction.deferUpdate();
                const settings = await getLogSettings(guildId);
                const categories = { ...settings.categories, [systemId]: { enabled: true, channel_id: value } };
                await saveLogSettings(guildId, { categories });
                setConfigState(guildId, interaction.user.id, { logCategory: systemId });
                return void render(interaction, "logs");
            }
            case "sugchannel":
                await saveSuggestionSettings(guildId, { channel: value });
                return void render(interaction, "suggestions");
            case "aslog":
                await saveAntiSpamSettings(guildId, { log_channel: value });
                return void render(interaction, "antispam");
            case "gwchannel":
                await saveGiveawaySettings(guildId, { default_channel: value });
                return void render(interaction, "giveaways");
            case "joinlog":
                await upsertGuildConfig({ guild_id: guildId, join_log_channel: value });
                return void render(interaction, "welcome");
            case "leavelog":
                await upsertGuildConfig({ guild_id: guildId, leave_log_channel: value });
                return void render(interaction, "welcome");
            case "rrchannel": {
                const settings = await getReactionRoleSettings(guildId);
                await saveReactionRoleSettings(guildId, { panels: settings.panels.map((panel) => panel.id === systemId ? { ...panel, channel_id: value } : panel) });
                return void render(interaction, "reactionroles");
            }
            case "socialchan": {
                const settings = await getSocialSettings(guildId);
                await saveSocialSettings(guildId, { subscriptions: settings.subscriptions.map((sub) => sub.id === systemId ? { ...sub, announce_channel: value } : sub) });
                return void render(interaction, "social");
            }
            case "bcautopub":
                await saveBroadcastSettings(guildId, { autopublish_channels: values });
                return void render(interaction, "broadcast");
            case "voicehub":
                await saveVoiceSettings(guildId, { hub_channel: values[0] ?? null });
                return void render(interaction, "voice");
            case "voicecat":
                await saveVoiceSettings(guildId, { category_id: values[0] ?? null });
                return void render(interaction, "voice");
            case "logignch":
                await saveLogSettings(guildId, { ignored_channels: values });
                return void render(interaction, "logs");
            default:
                return void interaction.deferUpdate();
        }
    },
});

// ─── Role selects ──────────────────────────────────────────────────────────────
createResponder({
    customId: "cfg/**",
    types: [ResponderType.RoleSelect],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (!(await gate(interaction))) return;
        const { action } = parseCustomId(interaction.customId);
        const guildId = interaction.guildId;
        const values = interaction.values;

        switch (action) {
            case "stickyroles":
                await saveRoleSettings(guildId, { sticky_roles: values });
                return void render(interaction, "roles");
            case "logignrole":
                await saveLogSettings(guildId, { ignored_roles: values });
                return void render(interaction, "logs");
            case "sugrole":
                await saveSuggestionSettings(guildId, { required_role: values[0] ?? null });
                return void render(interaction, "suggestions");
            case "sugmanager":
                await saveSuggestionSettings(guildId, { manager_role: values[0] ?? null });
                return void render(interaction, "suggestions");
            case "asexempt":
                await saveAntiSpamSettings(guildId, { exempt_roles: values });
                return void render(interaction, "antispam");
            case "asquarantine": {
                const quarantineRole = values[0] ?? null;
                await saveAntiSpamSettings(guildId, { quarantine_role: quarantineRole });
                // Fecha o cargo em todos os canais e abre só o do painel de tickets — sem
                // isto o cargo era decorativo e não retirava acesso a nada.
                if (quarantineRole && interaction.guild) void syncQuarantineRole(interaction.guild, quarantineRole).catch(() => null);
                return void render(interaction, "antispam");
            }
            case "gwhost":
                await saveGiveawaySettings(guildId, { host_role: values[0] ?? null });
                return void render(interaction, "giveaways");
            case "clientrole": {
                const role = values[0] ? interaction.guild.roles.cache.get(values[0]) : null;
                const grant = role ? roleGrantProblem(interaction.member as GuildMember, role, { automatic: true }) : null;
                if (grant) return void replyContainer(interaction, errorContainer(grant));
                await upsertGuildConfig({ guild_id: guildId, client_role: values[0] ?? null });
                return void render(interaction, "support");
            }
            case "socialmention": {
                const { systemId: subId } = parseCustomId(interaction.customId);
                const settings = await getSocialSettings(guildId);
                await saveSocialSettings(guildId, { subscriptions: settings.subscriptions.map((sub) => sub.id === subId ? { ...sub, mention_role: values[0] ?? null } : sub) });
                return void render(interaction, "social");
            }
            case "rrroles": {
                const { systemId: panelId } = parseCustomId(interaction.customId);
                const settings = await getReactionRoleSettings(guildId);
                const panel = settings.panels.find((entry) => entry.id === panelId);
                if (!panel) return void interaction.deferUpdate();
                // Só cargos abaixo do cargo mais alto de quem configura (os membros vão poder tirá-los sozinhos).
                const permitted = values.filter((roleId) => {
                    const role = interaction.guild.roles.cache.get(roleId);
                    return role && !roleGrantProblem(interaction.member as GuildMember, role, { automatic: true });
                });
                if (permitted.length < values.length) {
                    await replyContainer(interaction, errorContainer(t("Nada foi guardado: só cargos abaixo do teu cargo mais alto (e do bot) e sem permissões de moderação.")));
                    return;
                }
                // Mantém label/emoji/descrição dos cargos que já estavam no painel.
                const roles = permitted.slice(0, MAX_RR_ROLES).map((roleId) => {
                    const existing = panel.roles.find((entry) => entry.role_id === roleId);
                    if (existing) return existing;
                    const roleName = interaction.guild.roles.cache.get(roleId)?.name ?? "Cargo";
                    return { role_id: roleId, label: roleName.slice(0, 80), emoji: null, description: null };
                });
                await saveReactionRoleSettings(guildId, { panels: settings.panels.map((entry) => entry.id === panelId ? { ...entry, roles } : entry) });
                return void render(interaction, "reactionroles");
            }
            default:
                return void interaction.deferUpdate();
        }
    },
});

// ─── Modals (anti-spam thresholds / whitelist / support hours / welcome) ────────
createResponder({
    customId: "cfg/**",
    types: [ResponderType.Modal, ResponderType.ModalComponent],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        if (!(await gate(interaction))) return;
        const { action } = parseCustomId(interaction.customId);
        const guildId = interaction.guildId;

        if (action === "supporthours") {
            // Os três campos passaram a ser menus de seleção — os valores já vêm validados
            // da lista, mas confirmamos na mesma antes de gravar.
            const start = interaction.fields.getStringSelectValues("start")[0] ?? "";
            const end = interaction.fields.getStringSelectValues("end")[0] ?? "";
            const tzInput = interaction.fields.getStringSelectValues("tz")[0] ?? DEFAULT_SUPPORT_TZ;
            const timeRe = /^([01]?\d|2[0-3]):([0-5]\d)$/;
            if (!timeRe.test(start) || !timeRe.test(end)) {
                await replyContainer(interaction, errorContainer(t("Horas inválidas. Escolhe o início e o fim nas listas.")));
                return;
            }
            const tz = isValidTimezone(tzInput) ? tzInput : DEFAULT_SUPPORT_TZ;
            await upsertGuildConfig({ guild_id: guildId, support_hours_json: serializeSupportHours({ enabled: true, tz, start, end }) });
            if (interaction.isFromMessage()) return void render(interaction, "support");
            await replyContainer(interaction, errorContainer(t("Horário guardado. Reabre `/config` para ver o painel atualizado.")));
            return;
        }

        if (action === "voicenames") {
            const nameTemplate = interaction.fields.getTextInputValue("name_template").trim() || t("Sala de {user}");
            const userLimit = Math.max(0, Math.min(99, Number.parseInt(interaction.fields.getTextInputValue("user_limit"), 10) || 0));
            await saveVoiceSettings(guildId, { name_template: nameTemplate, user_limit: userLimit });
            if (interaction.isFromMessage()) return void render(interaction, "voice");
            await replyContainer(interaction, errorContainer(t("Definições de voz guardadas. Reabre /config para ver o painel.")));
            return;
        }

        if (action === "socialadd") {
            const platformRaw = interaction.fields.getRadioGroup("platform");
            const platform = isSocialPlatform(platformRaw) ? platformRaw : "youtube";
            const handle = normalizeSocialHandle(platform, interaction.fields.getTextInputValue("handle"));
            if (!handle) {
                await replyContainer(interaction, errorContainer(platform === "youtube"
                    ? t("Para YouTube usa o ID do canal (começa por UC...). Vê em youtube.com/account_advanced.")
                    : t("Não reconheci essa conta. Escreve o nome do perfil (ex.: pixelstudio) ou cola o link do perfil.")));
                return;
            }
            const settings = await getSocialSettings(guildId);
            if (settings.subscriptions.length >= 15) {
                await replyContainer(interaction, errorContainer(t("Máximo de 15 subscrições.")));
                return;
            }
            const sub = { id: randomUUID().slice(0, 8), platform, handle, display_name: interaction.fields.getTextInputValue("display_name").trim() || null, announce_channel: null, message_template: null, mention_role: null, last_item: null };
            await saveSocialSettings(guildId, { subscriptions: [...settings.subscriptions, sub] });
            setConfigState(guildId, interaction.user.id, { socialSub: sub.id });
            if (interaction.isFromMessage()) return void render(interaction, "social");
            await replyContainer(interaction, errorContainer(t("Canal adicionado — reabre /config → Alertas sociais para escolher o canal de anúncio.")));
            return;
        }

        if (action === "welcome") {
            const { systemId: categoryId } = parseCustomId(interaction.customId);
            const config = await ensureGuildConfig(guildId);
            const message = interaction.fields.getTextInputValue("message").trim() || null;
            const updated = setCategoryWelcome(getTicketCategories(config), categoryId, message);
            await upsertGuildConfig({ guild_id: guildId, ticket_categories_json: serializeTicketCategories(updated) });
            const label = getCategoryLabel(config, categoryId);
            if (interaction.isFromMessage()) return void render(interaction, "support");
            await replyContainer(interaction, errorContainer(t("Boas-vindas de **{category}** atualizadas. Reabre `/config` para ver o painel.", { category: label })));
            return;
        }


        if (action === "socialtpl") {
            const { systemId: subId } = parseCustomId(interaction.customId);
            const template = interaction.fields.getTextInputValue("template").trim() || null;
            const settings = await getSocialSettings(guildId);
            await saveSocialSettings(guildId, { subscriptions: settings.subscriptions.map((sub) => sub.id === subId ? { ...sub, message_template: template } : sub) });
            if (interaction.isFromMessage()) return void render(interaction, "social");
            await replyContainer(interaction, errorContainer(t("Mensagem do anúncio guardada. Reabre `/config` para ver o painel.")));
            return;
        }

        if (action === "stattpl") {
            const { systemId } = parseCustomId(interaction.customId);
            if (!(STAT_KEYS as readonly string[]).includes(systemId)) return void interaction.deferUpdate();
            const key = systemId as StatKey;
            const template = interaction.fields.getTextInputValue("template").trim() || t(STAT_DEFAULT_TEMPLATES[key]);
            const settings = await getStatsSettings(guildId);
            await saveStatsSettings(guildId, { stats: settings.stats.map((entry) => entry.key === key ? { ...entry, template } : entry) });
            if (interaction.isFromMessage()) return void render(interaction, "stats");
            await replyContainer(interaction, errorContainer(t("Nome do canal guardado. Reabre `/config` para ver o painel.")));
            return;
        }

        if (action === "rrnew" || action === "rrmeta") {
            const name = interaction.fields.getTextInputValue("name").trim();
            const title = interaction.fields.getTextInputValue("title").trim();
            const description = interaction.fields.getTextInputValue("description").trim() || null;
            const mode: ReactionRolePanel["mode"] = interaction.fields.getRadioGroup("mode") === "select" ? "select" : "buttons";
            const maxRoles = clampInt(interaction.fields.getTextInputValue("max_roles"), 0, 0, MAX_RR_ROLES);
            const settings = await getReactionRoleSettings(guildId);

            if (action === "rrnew") {
                if (settings.panels.length >= MAX_RR_PANELS) {
                    await replyContainer(interaction, errorContainer(t("Máximo de {max} painéis de auto-cargos.", { max: MAX_RR_PANELS })));
                    return;
                }
                const panel: ReactionRolePanel = { ...createEmptyPanel(name || "Painel"), title: title || name || t("Escolhe os teus cargos"), description, mode, max_roles: maxRoles };
                await saveReactionRoleSettings(guildId, { panels: [...settings.panels, panel] });
                setConfigState(guildId, interaction.user.id, { rrPanel: panel.id });
            } else {
                const { systemId: panelId } = parseCustomId(interaction.customId);
                await saveReactionRoleSettings(guildId, {
                    panels: settings.panels.map((panel) => panel.id === panelId
                        ? { ...panel, name: name || panel.name, title: title || panel.title, description, mode, max_roles: maxRoles }
                        : panel),
                });
            }
            if (interaction.isFromMessage()) return void render(interaction, "reactionroles");
            await replyContainer(interaction, errorContainer(t("Painel guardado. Reabre `/config` → Auto-cargos para continuar a edição.")));
            return;
        }

        if (action === "asthresholds") {
            await saveAntiSpamSettings(guildId, {
                flood_messages: clampInt(interaction.fields.getTextInputValue("flood_messages"), 5, 2, 50),
                flood_window_seconds: clampInt(interaction.fields.getTextInputValue("flood_window_seconds"), 8, 2, 120),
                score_threshold: clampInt(interaction.fields.getTextInputValue("score_threshold"), 60, 10, 1000),
                min_account_age_days: clampInt(interaction.fields.getTextInputValue("min_account_age_days"), 14, 0, 365),
            });
        } else if (action === "aswhitelist") {
            const domains = interaction.fields.getTextInputValue("whitelist")
                .split(/[\n,]/)
                .map((line) => line.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
                .filter((line) => line.length > 0);
            await saveAntiSpamSettings(guildId, { link_whitelist: [...new Set(domains)] });
        } else {
            return void interaction.deferUpdate();
        }

        if (interaction.isFromMessage()) {
            await render(interaction, "antispam");
            return;
        }
        await replyContainer(interaction, errorContainer(t("Definições guardadas. Reabre `/config` para ver o painel atualizado.")));
    },
});
