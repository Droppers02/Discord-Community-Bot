import discord
from discord.ext import commands

class HelpPagination(discord.ui.View):
    """View for help pagination"""
    
    def __init__(self, embeds, timeout=180):
        super().__init__(timeout=timeout)
        self.embeds = embeds
        self.current_page = 0
        self.max_pages = len(embeds)
        self.update_buttons()
    
    def update_buttons(self):
        """Update button states"""
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
        """Disable buttons after timeout"""
        for item in self.children:
            item.disabled = True

class HelpCog(commands.Cog):
    """Cog for help command"""
    
    def __init__(self, bot):
        self.bot = bot

    @discord.app_commands.command(name="help", description="Shows all available commands")
    async def help_command(self, interaction: discord.Interaction):
        """Help command with pagination"""
        
        await interaction.response.defer()
        
        embeds = []
        
        # ===== PAGE 1: Introduction and Games =====
        embed1 = discord.Embed(
            title="🤖 EPA Bot - Games & Fun",
            description="Use the buttons below to navigate between categories.\n"
                       "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed1.set_thumbnail(url=self.bot.user.avatar.url)
        
        game_commands = [
            "• `/jogodogalo [opponent]` - Tic-tac-toe",
            "• `/4emlinha [opponent]` - Connect 4",
            "• `/quiz` - Quiz game",
            "• `/forca` - Hangman (improved)",
            "• `/blackjack <bet>` - Blackjack"
        ]
        embed1.add_field(name="🎮 **Main Games**", value="\n".join(game_commands), inline=False)
        
        game_mini = [
            "• `/reacao` - Quick reaction",
            "• `/matematica` - Math challenge",
            "• `/memoria` - Memory game"
        ]
        embed1.add_field(name="⚡ **Mini-Games**", value="\n".join(game_mini), inline=False)
        
        game_stats = [
            "• `/gamestats [game] [user]` - View stats",
            "• `/gameleaderboard <game>` - Top 10"
        ]
        embed1.add_field(name="📊 **Statistics**", value="\n".join(game_stats), inline=False)
        
        fun_commands = [
            "• `/teste` - Test bot",
            "• `/dado <sides>` - Roll dice",
            "• `/ship <user1> <user2>` - Compatibility"
        ]
        embed1.add_field(name="🎉 **Fun**", value="\n".join(fun_commands), inline=False)
        
        embed1.set_footer(text="Page 1/5 • Use buttons to navigate")
        embeds.append(embed1)
        
        # ===== PAGE 2: Economy =====
        embed2 = discord.Embed(
            title="🤖 EPA Bot - Economy",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed2.set_thumbnail(url=self.bot.user.avatar.url)
        
        economy_commands = [
            "• `/saldo [@user]` - View balance",
            "• `/daily` - Daily reward (streak bonus)",
            "• `/trabalho` - Work (cooldown 1h)",
            "• `/crime` - Risky crime (cooldown 2h)",
            "• `/loja` - Item shop",
            "• `/comprar <item>` - Buy item",
            "• `/inventario [@user]` - View inventory",
            "• `/doar <user> <amount>` - Donate coins",
            "• `/leaderboard` - Top users",
            "• `/perfil_economico [@user]` - Economic profile"
        ]
        embed2.add_field(name="💰 **Basic Economy**", value="\n".join(economy_commands), inline=False)
        
        economy_advanced = [
            "• `/comprar_role <name> <color>` - Custom Role (50k)",
            "• `/editar_role [name] [color]` - Edit role",
            "• `/remover_role` - Remove role",
            "• `/propor_trade <@user> <coins> <asks>` - Trade",
            "• `/trades_pendentes` - View pending trades",
            "• `/conquistas [@user]` - View achievements",
            "• `/criar_leilao <item> <desc> <bid>` - Auction",
            "• `/leiloes` - View active auctions",
            "• `/dar_lance <id> <amount>` - Bid"
        ]
        embed2.add_field(name="💎 **Advanced Economy**", value="\n".join(economy_advanced), inline=False)
        
        events_commands = [
            "• `/criar_evento <type> <hours>` - [ADMIN]",
            "• `/eventos_ativos` - View events"
        ]
        embed2.add_field(name="🎊 **Special Events**", value="\n".join(events_commands), inline=False)
        
        social_commands = [
<<<<<<< HEAD
            "• `/rank [user]` - View level, XP and progress",
            "• `/like <user>` - Give reputation (1h cooldown)",
            "• `/leaderboard <category>` - Rankings (XP/Rep/Money/Games/Msgs/Streaks)",
            "• `/perfil [user]` - View complete profile",
            "• `/editarperfil` - Customize profile",
            "• `/badges [user]` - View earned badges",
            "• `/casar <user>` - Propose marriage",
            "• `/divorcio` - Divorce",
            "• `/historico [user]` - View activities",
            "• `/streaks` - View streaks (Daily/Messages/Games)"
=======
            "• `/rank [user]` - Ver nível, XP e progresso",
            "• `/like <user>` - Dar reputação (1h cooldown)",
            "• `/leaderboard <categoria>` - Rankings (XP/Rep/Dinheiro/Jogos/Msgs/Streaks)",
            "• `/perfil [user]` - Ver perfil completo",
            "• `/editarperfil` - Customizar perfil",
            "• `/badges [user]` - Ver badges conquistados",
            "• `/casar <user>` - Pedir em casamento",
            "• `/divorcio` - Divorciar-se",
            "• `/historico [user]` - Ver atividades",
            "• `/streaks` - Ver streaks (Daily/Mensagens/Jogos)"
>>>>>>> main
        ]
        embed2.add_field(name="⭐ **Advanced Social**", value="\n".join(social_commands), inline=False)
        
        social_new = [
<<<<<<< HEAD
            "• `/amigos <action> [user]` - Friends system",
            "• `/amigos_aceitar <user>` - Accept request",
            "• `/amigos_rejeitar <user>` - Reject request",
            "• `/casamento_upgrade <tier>` - Upgrade ring (1-5)",
            "• `/atividade [period] [user]` - Activity graphs"
        ]
        embed2.add_field(name="👥 **New Features**", value="\n".join(social_new), inline=False)
        
        embed2.set_footer(text="Page 2/5 • Use buttons to navigate")
=======
            "• `/amigos <acao> [user]` - Sistema de amizades",
            "• `/amigos_aceitar <user>` - Aceitar pedido",
            "• `/amigos_rejeitar <user>` - Rejeitar pedido",
            "• `/casamento_upgrade <tier>` - Upgrade anel (1-5)",
            "• `/atividade [periodo] [user]` - Gráficos de atividade"
        ]
        embed2.add_field(name="👥 **Funcionalidades Novas**", value="\n".join(social_new), inline=False)
        
        embed2.set_footer(text="Página 2/5 • Use os botões para navegar")
>>>>>>> main
        embeds.append(embed2)
        
        # ===== PAGE 3: Music & Utilities =====
        embed3 = discord.Embed(
            title="🤖 EPA Bot - Music & Utilities",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed3.set_thumbnail(url=self.bot.user.avatar.url)
        
        music_commands = [
<<<<<<< HEAD
            "• `/play <song>` - Play music",
            "• `/pause` - Pause",
            "• `/resume` - Resume",
            "• `/skip` - Next song",
            "• `/stop` - Stop and clear queue",
            "• `/queue` - View queue",
            "• `/nowplaying` - Current song",
            "• `/voteskip` - Vote to skip song",
            "• `/letra` - Show song lyrics",
            "• `/playlist_create <name>` - Create playlist",
            "• `/playlist_add <name> <url>` - Add to playlist",
            "• `/playlist_play <name>` - Play playlist",
            "• `/playlist_list` - List playlists"
=======
            "• `/play <música>` - Tocar música",
            "• `/pause` - Pausar",
            "• `/resume` - Retomar",
            "• `/skip` - Próxima música",
            "• `/stop` - Parar e limpar fila",
            "• `/queue` - Ver fila",
            "• `/nowplaying` - Música atual",
            "• `/voteskip` - Votar para pular música",
            "• `/letra` - Mostrar letra da música",
            "• `/playlist create <nome>` - Criar playlist",
            "• `/playlist add <nome> <url>` - Adicionar à playlist",
            "• `/playlist play <nome>` - Tocar playlist",
            "• `/playlist list` - Listar playlists"
>>>>>>> main
        ]
        embed3.add_field(name="🎵 **Music**", value="\n".join(music_commands), inline=False)
        
        utility_commands = [
<<<<<<< HEAD
            "• `/avatar [user]` - View avatar",
            "• `/emoji <emoji>` - Enlarge custom emoji",
            "• `/emojiinfo <emoji>` - Emoji technical info",
            "• `/userinfo [user]` - User info",
            "• `/serverinfo` - Server info",
            "• `/botinfo` - Bot info",
            "• `/lembrete` - Create reminder",
            "• `/poll` - Create poll",
            "• `/anuncio` - [ADMIN] Schedule announcement",
            "• `/suggest <text>` - Create suggestion",
            "• `/approve_suggestion <id> [note]` - [MOD] Approve suggestion",
            "• `/deny_suggestion <id> <reason>` - [MOD] Deny suggestion",
            "• `/setup_suggestions <channel>` - [ADMIN] Setup suggestions system",
            "• `/giveaway <duration> <winners> <prize>` - [MOD] Create giveaway",
            "• `/timestamp <datetime> [style]` - Generate Discord timestamp",
            "• `/note_add <title> <content> [tags]` - Add note",
            "• `/notes [tag]` - List personal notes",
            "• `/note_view <id>` - View full note",
            "• `/note_delete <id>` - Delete note",
            "• `/voicestats [member]` - Voice time statistics",
            "• `/voiceleaderboard` - Top 10 voice time",
            "• `/setup_starboard <channel> [threshold] [emoji] [self_star]` - [ADMIN] Setup Starboard",
            "• `/afk [reason]` - Set AFK status"
=======
            "• `/avatar [user]` - Ver avatar",
            "• `/emoji <emoji>` - Ampliar emoji customizado",
            "• `/emojiinfo <emoji>` - Info técnica de emoji",
            "• `/userinfo [user]` - Info de utilizador",
            "• `/serverinfo` - Info do servidor",
            "• `/botinfo` - Info do bot",
            "• `/lembrete` - Criar lembrete",
            "• `/poll` - Criar votação",
            "• `/anuncio` - [ADMIN] Agendar anúncio",
            "• `/sugestao enviar <texto>` - Criar sugestão",
            "• `/sugestao aprovar <id> [nota]` - [MOD] Aprovar sugestão",
            "• `/sugestao negar <id> <razão>` - [MOD] Recusar sugestão",
            "• `/setup_suggestions <canal>` - [ADMIN] Configurar sistema de sugestões",
            "• `/giveaway <duração> <vencedores> <prêmio>` - [MOD] Criar giveaway",
            "• `/timestamp <data_hora> [estilo]` - Gerar timestamp do Discord",
            "• `/nota add <título> <conteúdo> [tags]` - Adicionar nota",
            "• `/nota list [tag]` - Listar notas pessoais",
            "• `/nota view <id>` - Ver nota completa",
            "• `/nota delete <id>` - Apagar nota",
            "• `/voz stats [membro]` - Estatísticas de tempo em voz",
            "• `/voz leaderboard` - Top 10 tempo em voz",
            "• `/setup_starboard <canal> [threshold] [emoji] [self_star]` - [ADMIN] Configurar Starboard",
            "• `/afk [razão]` - Definir status AFK"
>>>>>>> main
        ]
        embed3.add_field(name="🔧 **Utilities**", value="\n".join(utility_commands), inline=False)
        
        embed3.set_footer(text="Page 3/5 • Use buttons to navigate")
        embeds.append(embed3)
        
        # ===== PAGE 4: Moderation =====
        embed4 = discord.Embed(
            title="🤖 EPA Bot - Moderation",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed4.set_thumbnail(url=self.bot.user.avatar.url)
        
        moderation_commands = [
            "• `/kick <user> [reason]` - Kick",
            "• `/ban <user> [reason]` - Ban",
            "• `/unban <user_id>` - Unban",
            "• `/timeout <user> <preset>` - Timeout",
<<<<<<< HEAD
            "• `/untimeout <user>` - Remove timeout",
            "• `/warn <user> <reason>` - Warn",
            "• `/warnings <user>` - View warnings"
=======
            "• `/untimeout <user>` - Remover timeout",
            "• `/warn <user> <razão>` - Avisar",
            "• `/warnings <user>` - Ver avisos"
>>>>>>> main
        ]
        embed4.add_field(name="🛡️ **Basic Moderation**", value="\n".join(moderation_commands), inline=False)
        
        clear_commands = [
            "• `/clear quantidade <number>` - Clear N messages",
            "• `/clear apartir <msg_id> [limit]` - From message",
            "• `/clear intervalo <msg1> <msg2>` - Between two messages"
        ]
        embed4.add_field(name="🗑️ **Message Cleanup**", value="\n".join(clear_commands), inline=False)
        
        clear_commands = [
            "• `/clear quantidade <número>` - Limpar N mensagens",
            "• `/clear apartir <msg_id> [limite]` - A partir de mensagem",
            "• `/clear intervalo <msg1> <msg2>` - Entre duas mensagens"
        ]
        embed4.add_field(name="🗑️ **Limpeza de Mensagens**", value="\n".join(clear_commands), inline=False)
        
        moderation_advanced = [
<<<<<<< HEAD
            "• `/setup_modlogs <channel>` - Moderation logs",
            "• `/setup_wordfilter` - Word filter",
            "• `/setup_quarantine` - Quarantine system",
            "• `/setup_antispam` - Anti-spam with whitelist",
            "• `/setup_antiraid` - Anti-raid protection",
            "• `/setup_nsfw` - NSFW detection",
            "• `/setup_appeals` - Appeals system",
            "• `/setup_linkfilter` - Malicious link filter",
            "• `/setup_strikes` - Setup strikes system",
            "• `/setup_mentionspam` - Mention spam protection",
            "• `/setup_slowmode` - Auto-slowmode",
            "• `/setup_rolebackup` - Role backup/restore",
            "• `/strike <member> <reason>` - Add strike",
            "• `/strikes [member]` - View strikes",
            "• `/clearstrikes <member>` - Clear strikes"
=======
            "• `/setup_modlogs <canal>` - Logs de moderação",
            "• `/setup_wordfilter` - Filtro de palavras",
            "• `/setup_quarantine` - Sistema de quarentena",
            "• `/setup_antispam` - Anti-spam com whitelist",
            "• `/setup_antiraid` - Proteção anti-raid",
            "• `/setup_nsfw` - Detecção de NSFW",
            "• `/setup_appeals` - Sistema de appeals",
            "• `/setup_linkfilter` - Filtro de links maliciosos",
            "• `/setup_strikes` - Configurar sistema de strikes",
            "• `/setup_mentionspam` - Proteção contra mention spam",
            "• `/setup_slowmode` - Auto-slowmode",
            "• `/setup_rolebackup` - Backup/restauro de roles",
            "• `/strike <membro> <motivo>` - Adicionar strike",
            "• `/strikes [membro]` - Ver strikes",
            "• `/clearstrikes <membro>` - Limpar strikes"
>>>>>>> main
        ]
        embed4.add_field(name="🔧 **Advanced Moderation**", value="\n".join(moderation_advanced), inline=False)
        
        embed4.set_footer(text="Page 4/5 • Use buttons to navigate")
        embeds.append(embed4)
        
        # ===== PAGE 5: Tickets & Admin =====
        embed5 = discord.Embed(
            title="🤖 EPA Bot - Tickets & Admin",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed5.set_thumbnail(url=self.bot.user.avatar.url)
        
        tickets_commands = [
            "• `/setup_tickets` - [ADMIN] Setup panel",
            "• `/rename <name>` - [STAFF] Rename ticket"
        ]
        embed5.add_field(name="🎫 **Tickets**", value="\n".join(tickets_commands), inline=False)
        
        admin_commands = [
            "• `/setup_autoroles` - Setup auto-roles",
            "• `/setup_verificacao` - 2FA system",
            "• `/reload <cog>` - Reload module",
            "• `/sync` - Sync commands",
            "• `/status` - Bot status",
            "• `/ping` - Latency"
        ]
        embed5.add_field(name="👑 **Admin**", value="\n".join(admin_commands), inline=False)
        
        info = [
            "🔹 **Games:** 9 games with stats and leaderboards",
            "🔹 **Economy:** Complete coin system",
            "🔹 **Social:** Levels, XP and reputation",
            "🔹 **Tickets:** 5 categories available",
            "🔹 **Author:** Droppers 🇵🇹"
        ]
        embed5.add_field(name="ℹ️ **Info**", value="\n".join(info), inline=False)
        
        total_commands = len([cmd for cmd in self.bot.tree.get_commands()])
        embed5.set_footer(
            text=f"Page 5/5 • {total_commands} Commands • {len(self.bot.guilds)} Server(s)",
            icon_url=self.bot.user.avatar.url if self.bot.user.avatar else None
        )
        embeds.append(embed5)
        
        # Criar view de paginação e enviar
        view = HelpPagination(embeds)
        await interaction.followup.send(embed=embeds[0], view=view)


async def setup(bot):
    """Function to load the cog"""
    await bot.add_cog(HelpCog(bot))
