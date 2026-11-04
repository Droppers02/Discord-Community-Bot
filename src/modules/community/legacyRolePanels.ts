import type { ReactionRoleEntry, ReactionRolePanel } from "../../types.js";

// Os 3 painéis de auto-cargos do bot antigo (Python: /setup_autoroles, config/utilities_config.json),
// com os mesmos cargos e textos. Entram uma vez como predefinições no /config → Auto-cargos
// (migração "2026-11-04-legacy-role-panels"); depois é só publicar. Canal: #「👷🏻」cargos.

export const LEGACY_ROLES_CHANNEL = "869989783856877618";

const role = (role_id: string, emoji: string, label: string): ReactionRoleEntry => ({ role_id, emoji, label, description: null });

const HOW_IT_WORKS = [
    "**Como funciona**",
    "• Clica num botão para **receber** o cargo",
    "• Clica outra vez para o **remover**",
].join("\n");

export function legacyRolePanels(): ReactionRolePanel[] {
    return [
        {
            id: "epa-jogos",
            name: "Jogos",
            channel_id: LEGACY_ROLES_CHANNEL,
            message_id: null,
            title: "🎮 Cargos de Jogos",
            description: [
                "**Pega nos cargos dos jogos que jogas!**",
                "Assim encontras outras pessoas para jogar contigo.",
                "",
                HOW_IT_WORKS,
                "• Podes ter quantos quiseres!",
            ].join("\n"),
            mode: "buttons",
            max_roles: 0,
            roles: [
                role("983713090795347988", "🎰", "Gacha"),
                role("984076131277893634", "🔫", "CSGO"),
                role("984075603655397416", "🎯", "Valorant"),
                role("984079929576673290", "🛡️", "Overwatch"),
                role("984079118155022346", "⚔️", "League of Legends"),
                role("1085243051800285255", "🎌", "Anime"),
                role("984077973621719050", "🦖", "Ark"),
                role("984079324514750494", "🃏", "Runeterra"),
                role("984078259794874408", "🚗", "GTA V RP"),
                role("984078450891558923", "🚀", "Rocket League"),
                role("1318275263263412294", "🦸", "Marvel Rivals"),
                role("984077127349571594", "⛏️", "Minecraft"),
                role("984080200109273148", "🔪", "Dead by Daylight"),
                role("984076759211343872", "🪂", "Fortnite"),
                role("1155146697350074408", "🎨", "Roblox"),
            ],
        },
        {
            id: "epa-plataformas",
            name: "Plataformas",
            channel_id: LEGACY_ROLES_CHANNEL,
            message_id: null,
            title: "💻 Cargos de Plataformas",
            description: [
                "**Indica em que plataformas jogas!**",
                "Ajuda a encontrar pessoas na mesma plataforma.",
                "",
                HOW_IT_WORKS,
                "• Podes ter várias plataformas!",
            ].join("\n"),
            mode: "buttons",
            max_roles: 0,
            roles: [
                role("869999110181249064", "🎮", "PlayStation"),
                role("869999804556664862", "🕹️", "Xbox"),
                role("869999923452604476", "💻", "PC"),
                role("869999970894368818", "📱", "Mobile"),
            ],
        },
        {
            id: "epa-dm",
            name: "Preferências de DM",
            channel_id: LEGACY_ROLES_CHANNEL,
            message_id: null,
            title: "💬 Preferências de DM",
            description: [
                "**Define se te podem mandar mensagens privadas!**",
                "Assim os outros membros sabem se te podem mandar DM.",
                "",
                "**Escolhe UMA opção** (escolher outra troca a anterior):",
                "• ✅ **Podem enviar DM** — aceitas DMs de qualquer membro",
                "• 📩 **Perguntar antes** — pede primeiro antes de enviar",
                "• ❌ **Não enviar DM** — não aceitas DMs",
            ].join("\n"),
            mode: "buttons",
            // 1 = escolha única: carregar numa opção tira as outras.
            max_roles: 1,
            roles: [
                role("870000429788971009", "✅", "Podem enviar DM"),
                role("870000027962048632", "📩", "Perguntar antes"),
                role("870000122510049311", "❌", "Não enviar DM"),
            ],
        },
    ];
}

/** Junta os painéis do bot antigo aos que já existem (sem duplicar nem apagar nenhum). */
export function mergeLegacyRolePanels(existing: ReactionRolePanel[], maxPanels = 10): ReactionRolePanel[] {
    const missing = legacyRolePanels().filter((preset) => !existing.some((panel) => panel.id === preset.id));
    return [...existing, ...missing].slice(0, maxPanels);
}
