import discord
from discord.ext import commands

class HelpPagination(discord.ui.View):
    """View para paginação do help"""
    
    def __init__(self, embeds, timeout=180):
        super().__init__(timeout=timeout)
        self.embeds = embeds
        self.current_page = 0
        self.max_pages = len(embeds)
        self.update_buttons()
    
    def update_buttons(self):
        """Atualiza estado dos botões"""
        self.first_page.disabled = self.current_page == 0
        self.prev_page.disabled = self.current_page == 0
        self.next_page.disabled = self.current_page == self.max_pages - 1
        self.last_page.disabled = self.current_page == self.max_pages - 1
    
    @discord.ui.button(label="⏮️", style=discord.ButtonStyle.secondary, custom_id="first")
    async def first_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page = 0
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @discord.ui.button(label="◀️", style=discord.ButtonStyle.primary, custom_id="prev")
    async def prev_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page -= 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @discord.ui.button(label="▶️", style=discord.ButtonStyle.primary, custom_id="next")
    async def next_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page += 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @discord.ui.button(label="⏭️", style=discord.ButtonStyle.secondary, custom_id="last")
    async def last_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page = self.max_pages - 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    async def on_timeout(self):
        """Desabilita botões após timeout"""
        for item in self.children:
            item.disabled = True

class HelpCog(commands.Cog):
    """Cog para o comando de ajuda"""
    
    def __init__(self, bot):
        self.bot = bot

    @discord.app_commands.command(name="help", description="Mostra todos os comandos disponíveis")
    async def help_command(self, interaction: discord.Interaction):
        """Comando de ajuda com paginação"""
        
        await interaction.response.defer()
        
        embeds = []
        
        # ===== PÁGINA 1: Introdução e Jogos =====
        embed1 = discord.Embed(
            title="🤖 EPA Bot - Jogos & Diversão",
            description="Use os botões abaixo para navegar entre as categorias.\n"
                       "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed1.set_thumbnail(url=self.bot.user.avatar.url)
        
        game_commands = [
            "• `/jogodogalo [oponente]` - Jogo do galo",
            "• `/4emlinha [oponente]` - 4 em linha",
            "• `/quiz` - Quiz de perguntas",
            "• `/forca` - Jogo da forca melhorado",
            "• `/blackjack <aposta>` - Blackjack"
        ]
        embed1.add_field(name="🎮 **Jogos Principais**", value="\n".join(game_commands), inline=False)
        
        game_mini = [
            "• `/reacao` - Reação rápida",
            "• `/matematica` - Desafio matemático",
            "• `/memoria` - Jogo de memória"
        ]
        embed1.add_field(name="⚡ **Mini-Jogos**", value="\n".join(game_mini), inline=False)
        
        game_stats = [
            "• `/gamestats [jogo] [user]` - Ver stats",
            "• `/gameleaderboard <jogo>` - Top 10"
        ]
        embed1.add_field(name="📊 **Estatísticas**", value="\n".join(game_stats), inline=False)
        
        fun_commands = [
            "• `/teste` - Testar bot",
            "• `/dado <lados>` - Lançar dado",
            "• `/ship <user1> <user2>` - Compatibilidade"
        ]
        embed1.add_field(name="🎉 **Diversão**", value="\n".join(fun_commands), inline=False)
        
        embed1.set_footer(text="Página 1/5 • Use os botões para navegar")
        embeds.append(embed1)
        
        # ===== PÁGINA 2: Economia =====
        embed2 = discord.Embed(
            title="🤖 EPA Bot - Economia",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed2.set_thumbnail(url=self.bot.user.avatar.url)
        
        economy_commands = [
            "• `/saldo [@user]` - Ver saldo",
            "• `/daily` - Recompensa diária (streak bonus)",
            "• `/trabalho` - Trabalhar (cooldown 1h)",
            "• `/crime` - Crime arriscado (cooldown 2h)",
            "• `/loja` - Loja de itens",
            "• `/comprar <item>` - Comprar item",
            "• `/inventario [@user]` - Ver inventário",
            "• `/doar <user> <valor>` - Doar coins",
            "• `/leaderboard` - Top utilizadores",
            "• `/perfil [@user]` - Perfil económico"
        ]
        embed2.add_field(name="💰 **Economia Básica**", value="\n".join(economy_commands), inline=False)
        
        economy_advanced = [
            "• `/comprar_role <nome> <cor>` - Custom Role (50k)",
            "• `/editar_role [nome] [cor]` - Editar role",
            "• `/remover_role` - Remover role",
            "• `/propor_trade <@user> <coins> <pede>` - Trocar",
            "• `/trades_pendentes` - Ver trades",
            "• `/conquistas [@user]` - Ver achievements",
            "• `/criar_leilao <item> <desc> <lance>` - Leilão",
            "• `/leiloes` - Ver leilões ativos",
            "• `/dar_lance <id> <valor>` - Licitar"
        ]
        embed2.add_field(name="💎 **Economia Avançada**", value="\n".join(economy_advanced), inline=False)
        
        events_commands = [
            "• `/criar_evento <tipo> <horas>` - [ADMIN]",
            "• `/eventos_ativos` - Ver eventos"
        ]
        embed2.add_field(name="🎊 **Eventos Especiais**", value="\n".join(events_commands), inline=False)
        
        social_commands = [
            "• `/rank [user]` - Ver nível, XP e progresso",
            "• `/like <user>` - Dar reputação (1h cooldown)",
            "• `/leaderboard [tipo]` - Rankings (XP/Reputação)",
            "• `/perfil [user]` - Ver perfil completo",
            "• `/editarperfil` - Customizar perfil",
            "• `/badges [user]` - Ver badges conquistados",
            "• `/casar <user>` - Pedir em casamento",
            "• `/divorcio` - Divorciar-se",
            "• `/historico [user]` - Ver atividades",
            "• `/streaks` - Ver streaks (Daily/Mensagens/Jogos)"
        ]
        embed2.add_field(name="⭐ **Social Avançado**", value="\n".join(social_commands), inline=False)
        
        embed2.set_footer(text="Página 2/5 • Use os botões para navegar")
        embeds.append(embed2)
        
        # ===== PÁGINA 3: Música & Utilidades =====
        embed3 = discord.Embed(
            title="🤖 EPA Bot - Música & Utilidades",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed3.set_thumbnail(url=self.bot.user.avatar.url)
        
        music_commands = [
            "• `/play <música>` - Tocar música",
            "• `/pause` - Pausar",
            "• `/resume` - Retomar",
            "• `/skip` - Próxima música",
            "• `/stop` - Parar e limpar fila",
            "• `/queue` - Ver fila",
            "• `/nowplaying` - Música atual"
        ]
        embed3.add_field(name="🎵 **Música**", value="\n".join(music_commands), inline=False)
        
        utility_commands = [
            "• `/avatar [user]` - Ver avatar",
            "• `/userinfo [user]` - Info de utilizador",
            "• `/serverinfo` - Info do servidor",
            "• `/botinfo` - Info do bot",
            "• `/lembrete` - Criar lembrete",
            "• `/poll` - Criar votação",
            "• `/anuncio` - [ADMIN] Agendar anúncio"
        ]
        embed3.add_field(name="🔧 **Utilidades**", value="\n".join(utility_commands), inline=False)
        
        embed3.set_footer(text="Página 3/5 • Use os botões para navegar")
        embeds.append(embed3)
        
        # ===== PÁGINA 4: Moderação =====
        embed4 = discord.Embed(
            title="🤖 EPA Bot - Moderação",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed4.set_thumbnail(url=self.bot.user.avatar.url)
        
        moderation_commands = [
            "• `/kick <user> [razão]` - Expulsar",
            "• `/ban <user> [razão]` - Banir",
            "• `/unban <user_id>` - Desbanir",
            "• `/timeout <user> <preset>` - Timeout",
            "• `/untimeout <user>` - Remover timeout",
            "• `/warn <user> <razão>` - Avisar",
            "• `/warnings <user>` - Ver avisos",
            "• `/clear <quantidade>` - Limpar mensagens"
        ]
        embed4.add_field(name="🛡️ **Moderação Básica**", value="\n".join(moderation_commands), inline=False)
        
        moderation_advanced = [
            "• `/setup_modlogs <canal>` - Logs de moderação",
            "• `/setup_wordfilter` - Filtro de palavras",
            "• `/setup_quarantine` - Sistema de quarentena",
            "• `/setup_appeals` - Sistema de appeals"
        ]
        embed4.add_field(name="🔧 **Moderação Avançada**", value="\n".join(moderation_advanced), inline=False)
        
        embed4.set_footer(text="Página 4/5 • Use os botões para navegar")
        embeds.append(embed4)
        
        # ===== PÁGINA 5: Tickets & Admin =====
        embed5 = discord.Embed(
            title="🤖 EPA Bot - Tickets & Admin",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed5.set_thumbnail(url=self.bot.user.avatar.url)
        
        tickets_commands = [
            "• `/setup_tickets` - [ADMIN] Configurar painel",
            "• `/rename <nome>` - [STAFF] Renomear ticket"
        ]
        embed5.add_field(name="🎫 **Tickets**", value="\n".join(tickets_commands), inline=False)
        
        admin_commands = [
            "• `/setup_autoroles` - Configurar auto-roles",
            "• `/setup_verificacao` - Sistema 2FA",
            "• `/reload <cog>` - Recarregar módulo",
            "• `/sync` - Sincronizar comandos",
            "• `/status` - Status do bot",
            "• `/ping` - Latência"
        ]
        embed5.add_field(name="👑 **Admin**", value="\n".join(admin_commands), inline=False)
        
        info = [
            "🔹 **Jogos:** 9 jogos com stats e leaderboards",
            "🔹 **Economia:** Sistema completo de moedas",
            "🔹 **Social:** Níveis, XP e reputação",
            "🔹 **Tickets:** 5 categorias disponíveis",
            "🔹 **Autor:** Droppers 🇵🇹"
        ]
        embed5.add_field(name="ℹ️ **Info**", value="\n".join(info), inline=False)
        
        total_commands = len([cmd for cmd in self.bot.tree.get_commands()])
        embed5.set_footer(
            text=f"Página 5/5 • {total_commands} Comandos • {len(self.bot.guilds)} Servidor(es)",
            icon_url=self.bot.user.avatar.url if self.bot.user.avatar else None
        )
        embeds.append(embed5)
        
        # Criar view de paginação e enviar
        view = HelpPagination(embeds)
        await interaction.followup.send(embed=embeds[0], view=view)


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(HelpCog(bot))
