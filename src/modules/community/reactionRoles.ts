import { hasPowerPermissions } from "../../lib/discord.js";
import { ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, type Guild, type GuildMember, type TextChannel } from "discord.js";
import { randomUUID } from "node:crypto";
import { buildContainer, row, type Row } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { buildCustomId } from "../../lib/ids.js";
import { getEmbedColor, getFooterText } from "../../lib/branding.js";
import { getReactionRoleSettings, saveReactionRoleSettings } from "./communitySettings.js";
import type { GuildConfig, ReactionRolePanel } from "../../types.js";
import { t } from "../../lib/i18n.js";

// Reaction roles: painéis publicados como mensagens CV2 com botões toggle ou um menu
// de seleção. Os customIds carregam o id do painel; o responder resolve os cargos.

export const MAX_RR_PANELS = 10;
export const MAX_RR_ROLES = 20;

export function createEmptyPanel(name: string): ReactionRolePanel {
    return { id: randomUUID().slice(0, 8), name, channel_id: null, message_id: null, title: name, description: null, mode: "buttons", max_roles: 0, roles: [] };
}

export function buildPanelComponents(panel: ReactionRolePanel, config: GuildConfig) {
    const rows: Row[] = [];
    if (panel.mode === "select" && panel.roles.length > 0) {
        rows.push(row(new StringSelectMenuBuilder()
            .setCustomId(buildCustomId("rr", "select", panel.id))
            .setPlaceholder(t("Escolhe os teus cargos…"))
            .setMinValues(0)
            .setMaxValues(panel.max_roles > 0 ? Math.min(panel.max_roles, panel.roles.length) : panel.roles.length)
            .addOptions(panel.roles.slice(0, 25).map((entry) => ({
                label: entry.label.slice(0, 100),
                value: entry.role_id,
                description: entry.description?.slice(0, 100) || undefined,
                emoji: entry.emoji || undefined,
            })))));
    } else {
        for (let i = 0; i < panel.roles.length; i += 5) {
            rows.push(row(...panel.roles.slice(i, i + 5).map((entry) => {
                const button = new ButtonBuilder()
                    .setCustomId(buildCustomId("rr", "toggle", panel.id, entry.role_id))
                    .setLabel(entry.label.slice(0, 80))
                    .setStyle(ButtonStyle.Secondary);
                if (entry.emoji) button.setEmoji(entry.emoji);
                return button;
            })));
        }
    }

    return buildContainer({
        color: getEmbedColor(config),
        thumbnailUrl: config.branding_logo,
        title: panel.title || panel.name,
        description: panel.description ?? (panel.mode === "select" ? t("Usa o menu abaixo para escolheres os teus cargos.") : t("Clica nos botões para receberes (ou removeres) os cargos.")),
        footerText: getFooterText(config),
        rows: rows.slice(0, 4),
    });
}

/** Publica (ou republica) o painel no canal configurado; guarda channel/message id. */
export async function publishReactionRolePanel(guild: Guild, panelId: string, config: GuildConfig): Promise<{ ok: boolean; error?: string }> {
    const settings = await getReactionRoleSettings(guild.id);
    const panel = settings.panels.find((entry) => entry.id === panelId);
    if (!panel) return { ok: false, error: t("Painel não encontrado.") };
    if (!panel.channel_id) return { ok: false, error: t("Define primeiro o canal do painel.") };
    if (panel.roles.length === 0) return { ok: false, error: t("Adiciona pelo menos um cargo ao painel.") };

    const channel = guild.channels.cache.get(panel.channel_id);
    if (!channel?.isTextBased()) return { ok: false, error: t("O canal configurado já não existe.") };

    // Remove a publicação anterior para não deixar painéis duplicados.
    if (panel.message_id) {
        await (channel as TextChannel).messages.delete(panel.message_id).catch(() => null);
    }

    try {
        const message = await (channel as TextChannel).send({ components: [buildPanelComponents(panel, config)], flags: CV2_FLAG });
        const panels = settings.panels.map((entry) => entry.id === panelId ? { ...entry, message_id: message.id } : entry);
        await saveReactionRoleSettings(guild.id, { panels });
        return { ok: true };
    } catch {
        return { ok: false, error: t("Não consegui publicar — confirma as minhas permissões nesse canal.") };
    }
}

export interface RoleToggleResult { added: string[]; removed: string[]; failed: string[] }

/** Aplica um toggle de um cargo (botões) ou o conjunto selecionado (menu). */
export async function applyRoleSelection(member: GuildMember, panel: ReactionRolePanel, selectedRoleIds: string[], toggleRoleId?: string): Promise<RoleToggleResult> {
    const result: RoleToggleResult = { added: [], removed: [], failed: [] };
    // Só os cargos do painel, e nunca cargos que entretanto ganharam permissões de moderação.
    const safe = (roleId: string) => {
        const role = member.guild.roles.cache.get(roleId);
        return Boolean(role && role.editable && !hasPowerPermissions(role));
    };
    const panelRoleIds = panel.roles.map((entry) => entry.role_id).filter(safe);

    if (toggleRoleId) {
        if (!panelRoleIds.includes(toggleRoleId)) {
            result.failed.push(toggleRoleId);
            return result;
        }
        const has = member.roles.cache.has(toggleRoleId);
        try {
            if (has) { await member.roles.remove(toggleRoleId, t("Reaction roles")); result.removed.push(toggleRoleId); }
            else { await member.roles.add(toggleRoleId, t("Reaction roles")); result.added.push(toggleRoleId); }
        } catch {
            result.failed.push(toggleRoleId);
            return result;
        }
        // Escolha única (máx. 1, p.ex. preferências de DM): escolher uma opção tira as outras do painel.
        if (!has && panel.max_roles === 1) {
            for (const other of panelRoleIds) {
                if (other === toggleRoleId || !member.roles.cache.has(other)) continue;
                try { await member.roles.remove(other, t("Reaction roles")); result.removed.push(other); } catch { result.failed.push(other); }
            }
        }
        return result;
    }

    for (const roleId of panelRoleIds) {
        const wants = selectedRoleIds.includes(roleId);
        const has = member.roles.cache.has(roleId);
        try {
            if (wants && !has) { await member.roles.add(roleId, t("Reaction roles")); result.added.push(roleId); }
            else if (!wants && has) { await member.roles.remove(roleId, t("Reaction roles")); result.removed.push(roleId); }
        } catch { result.failed.push(roleId); }
    }
    return result;
}
