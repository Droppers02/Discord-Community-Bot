import { StringSelectMenuBuilder } from "discord.js";
import type { ContainerPlusBuilder } from "@magicyan/discord";
import { COLORS } from "../../lib/branding.js";
import { buildContainer, row } from "../../lib/containers.js";
import { e, ei } from "../../lib/emojis.js";
import { buildCustomId } from "../../lib/ids.js";
import { t, tk } from "../../lib/i18n.js";

// /ajuda — os comandos por secção, num menu.

export const HELP_SECTIONS = ["geral", "jogos", "economia", "tickets", "staff", "admin"] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];

const SECTIONS: Record<HelpSection, { label: string; icon: string; description: string; commands: Array<[string, string]> }> = {
    geral: {
        label: tk("Comunidade"),
        icon: "users",
        description: tk("Perfil, níveis, rankings e utilidades."),
        commands: [
            ["/perfil", tk("O teu perfil: nível, moedas, reputação, voz e jogos")],
            ["/nivel", tk("Nível e XP (ganha-se a escrever e em voz)")],
            ["/ranking", tk("Rankings de XP, moedas, jogos, reputação, voz e mensagens")],
            ["/rep", tk("Dá um ponto de reputação a alguém (de 12 em 12 horas)")],
            ["/sugerir", tk("Envia uma sugestão para o servidor")],
            ["/sondagem", tk("Cria uma sondagem no canal")],
            ["/convites", tk("Quem trouxe mais gente para o servidor")],
            ["/info", tk("Servidor, membro, avatar ou estado do bot")],
        ],
    },
    jogos: {
        label: tk("Mini-jogos"),
        icon: "gamepad",
        description: tk("Jogos contra amigos, contra o bot e para o canal inteiro."),
        commands: [
            ["/jogos", tk("Catálogo, estatísticas e ranking por jogo")],
            ["/galo", tk("Jogo do Galo (amigo ou bot)")],
            ["/4emlinha", tk("4 em Linha (amigo ou bot)")],
            ["/ppt", tk("Pedra, Papel, Tesoura")],
            ["/forca", tk("Forca — sozinho ou com o canal")],
            ["/quiz", tk("Quiz para o canal inteiro")],
            ["/termo", tk("A palavra do dia em 6 tentativas")],
            ["/blackjack", tk("Blackjack contra o dealer")],
            ["/minas", tk("Abre casas sem rebentar")],
            ["/apostar", tk("Moeda, dados, slots e roleta")],
            ["/ship", tk("Compatibilidade entre dois membros")],
        ],
    },
    economia: {
        label: tk("Economia"),
        icon: "coin",
        description: tk("EPA Coins: ganha, junta e gasta."),
        commands: [
            ["/saldo", tk("A tua carteira")],
            ["/diario", tk("Recompensa diária com sequência")],
            ["/trabalhar", tk("Ganha moedas (de hora a hora)")],
            ["/transferir", tk("Envia moedas a alguém")],
            ["/loja", tk("Compra cargos")],
            ["/extrato", tk("Os teus últimos movimentos")],
        ],
    },
    tickets: {
        label: tk("Tickets e voz"),
        icon: "ticket",
        description: tk("Falar com a equipa e salas privadas."),
        commands: [
            ["/voz", tk("Sala de voz privada do teu ticket")],
            [tk("Painel de tickets"), tk("Carrega no botão do painel para abrir um ticket")],
            [tk("Mensagem privada ao bot"), tk("Se o modmail estiver ligado, abre um ticket por DM")],
        ],
    },
    staff: {
        label: tk("Equipa"),
        icon: "shield",
        description: tk("Moderação e gestão do dia a dia."),
        commands: [
            ["/mod", tk("Avisar, castigar, expulsar, banir e limpar mensagens")],
            ["/cargotemp", tk("Cargos com prazo (caem sozinhos)")],
            ["/blacklist", tk("Impedir alguém de abrir tickets")],
            ["/dashboard-staff", tk("Métricas dos tickets")],
            ["/sorteio", tk("Criar e gerir sorteios")],
        ],
    },
    admin: {
        label: tk("Administração"),
        icon: "settings",
        description: tk("Configuração do bot."),
        commands: [
            ["/config", tk("Painel de configuração de todos os sistemas")],
            ["/painel", tk("Publica um painel de tickets")],
            ["/xp", tk("Ajustar o XP dos membros")],
            ["/moedas", tk("Ajustar as moedas dos membros")],
        ],
    },
};

export function isHelpSection(value: string): value is HelpSection {
    return (HELP_SECTIONS as readonly string[]).includes(value);
}

export function buildHelp(section: HelpSection): ContainerPlusBuilder {
    const current = SECTIONS[section];
    return buildContainer({
        color: COLORS.primary,
        title: `${e(current.icon)} ${t("Ajuda — {section}", { section: t(current.label) })}`,
        description: [
            `-# ${t(current.description)}`,
            "",
            ...current.commands.map(([command, text]) => `**${t(command)}** — ${t(text)}`),
        ].join("\n"),
        footerText: t("EPA BOTCHI · escolhe outra secção no menu"),
        rows: [row(new StringSelectMenuBuilder()
            .setCustomId(buildCustomId("help", "section"))
            .setPlaceholder(t("Outra secção…"))
            .addOptions(HELP_SECTIONS.map((key) => ({ label: t(SECTIONS[key].label), value: key, description: t(SECTIONS[key].description).slice(0, 100), emoji: ei(SECTIONS[key].icon), default: key === section }))))],
    });
}
