import discord
from discord.ext import commands

class HelpCog(commands.Cog):
    """Cog para o comando de ajuda"""
    
    def __init__(self, bot):
        self.bot = bot

    @discord.app_commands.command(name="help", description="Mostra todos os comandos disponíveis")
    async def help_command(self, interaction: discord.Interaction):
        """Comando de ajuda que mostra todos os comandos disponíveis"""
        
        # Criar embed principal
        embed = discord.Embed(
            title="🤖 EPA Bot - Central de Comandos",
            description="Olá! Sou o **EPA Bot**, o teu assistente virtual do servidor EPA! 🎯\n"
                       "Aqui tens todos os comandos disponíveis organizados por categoria:\n"
                       "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            color=0x5865F2  # Discord Blurple
        )
        
        # Adicionar thumbnail (logo do bot)
        if self.bot.user.avatar:
            embed.set_thumbnail(url=self.bot.user.avatar.url)
        
        # Comandos de Diversão
        fun_commands = [
            "• `/teste` - Verifica se o bot está a funcionar",
            "• `/dado <lados>` - Lança um dado (padrão: 6 lados)",
            "• `/ship <utilizador1> <utilizador2>` - Calcula compatibilidade romântica"
        ]
        embed.add_field(
            name="🎉 **Diversão**",
            value="\n".join(fun_commands),
            inline=False
        )
        
        # Comandos de Jogos
        game_commands = [
            "• `/jogodogalo [oponente]` - Jogo do galo (contra bot ou utilizador)",
            "• `/coinflip [escolha]` - Cara ou coroa (com escolha opcional)",
            "• `/quiz` - Jogo de perguntas e respostas",
            "• `/forca` - Jogo da forca",
            "• `/blackjack <aposta>` - Jogo de Blackjack",
            "• `/memes` - Envia um meme aleatório"
        ]
        embed.add_field(
            name="🎮 **Jogos**",
            value="\n".join(game_commands),
            inline=False
        )
        
        # Comandos de Música
        music_commands = [
            "• `/play <música>` - Toca música ou adiciona à fila",
            "• `/playurl <url>` - Toca música direto de URL (YouTube, etc.)",
            "• `/skip` - Passa à próxima música",
            "• `/pause` - Pausa a música atual",
            "• `/resume` - Retoma a música pausada",
            "• `/stop` - Para a música e limpa a fila",
            "• `/queue [página]` - Mostra a fila de reprodução",
            "• `/remove <posição>` - Remove música da fila por posição",
            "• `/shuffle` - Baralha a fila de reprodução",
            "• `/nowplaying` - Mostra informações da música atual",
            "• `/music_status` - Diagnóstico da conexão de música",
            "• `/voteskip` - Vota para pular a música atual",
            "• `/letra` - Mostra a letra da música atual",
            "• `/playlist_create <nome>` - Cria uma playlist pessoal",
            "• `/playlist_add <playlist> <música>` - Adiciona música à playlist",
            "• `/playlist_play <nome>` - Toca uma playlist completa",
            "• `/playlist_list` - Lista as tuas playlists pessoais"
        ]
        embed.add_field(
            name="🎵 **Música**",
            value="\n".join(music_commands),
            inline=False
        )
        
        # Comandos de Economia
        economy_commands = [
            "• `/saldo [utilizador]` - Vê o teu saldo ou de outro utilizador",
            "• `/daily` - Recebe a tua recompensa diária (streak system)",
            "• `/apostar <jogo> <quantia>` - Aposta em jogos (moeda/dados/slots)",
            "• `/apostar_pvp <utilizador> <quantia>` - Aposta contra outro jogador",
            "• `/transferir <utilizador> <quantia>` - Transfere dinheiro",
            "• `/top` - Ranking dos utilizadores mais ricos",
            "• `/loja` - Vê a loja de itens especiais",
            "• `/comprar <item>` - Compra itens da loja",
            "• `/criar_role <nome> [cor]` - Cria Custom Role personalizada",
            "• `/perfil [utilizador]` - Vê o perfil económico completo",
            "• `/loteria` - Participa na loteria semanal"
        ]
        embed.add_field(
            name="💰 **Economia**",
            value="\n".join(economy_commands),
            inline=False
        )
        
        # Comandos de Utilidades & Monitorização
        utility_commands = [
            "• `/status` - Status e estatísticas do bot",
            "• `/ping` - Verificar latência do bot",
            "• `/userinfo [utilizador]` - Informações detalhadas de utilizador",
            "• `/serverinfo` - Informações do servidor",
            "• `/avatar [utilizador]` - Mostra avatar de utilizador",
            "• `/lembrete <tempo> <mensagem>` - Criar lembrete (5m, 2h, 1d)",
            "• `/meus_lembretes` - Ver lembretes ativos",
            "• `/poll <pergunta> <opcoes>` - Criar votação interativa"
        ]
        embed.add_field(
            name="🔧 **Utilidades & Info**",
            value="\n".join(utility_commands),
            inline=False
        )
        
        # Comandos Sociais
        social_commands = [
            "• `/rank [utilizador]` - Mostra nível e XP",
            "• `/like <utilizador>` - Dá reputação a alguém",
            "• `/leaderboard [tipo]` - Ranking do servidor"
        ]
        embed.add_field(
            name="👥 **Social**",
            value="\n".join(social_commands),
            inline=False
        )
        
        # Comandos de Moderação
        moderation_commands = [
            "• `/kick <membro> [motivo]` - Expulsar membro do servidor",
            "• `/ban <membro> [motivo]` - Banir membro do servidor",
            "• `/unban <user_id> [motivo]` - Remover ban de utilizador",
            "• `/timeout <membro> <minutos> [motivo]` - Colocar membro em timeout",
            "• `/untimeout <membro>` - Remover timeout de membro",
            "• `/warn <membro> <motivo>` - Avisar membro",
            "• `/warnings <membro>` - Ver avisos de membro",
            "• `/clear <quantidade>` - Apagar mensagens em massa (1-100)"
        ]
        embed.add_field(
            name="🛡️ **Moderação** (Requer Permissões)",
            value="\n".join(moderation_commands),
            inline=False
        )
        
        # Comandos Administrativos
        admin_commands = [
            "• `/setup_tickets` - Configura o painel de tickets com categorias",
            "• `/rename <novo_nome>` - Renomeia um ticket (apenas staff)",
            "• `/setup_autoroles` - Configura 3 painéis de auto-roles (Jogos, Plataformas, DM)",
            "• `/setup_verificacao` - Configura sistema de verificação 2FA (matemática + código DM)",
            "• `/anuncio <canal> <mensagem> <tempo>` - Agendar anúncios",
            "• `/eco_add <utilizador> <quantia>` - Adiciona EPA Coins",
            "• `/eco_remove <utilizador> <quantia>` - Remove EPA Coins",
            "• `/eco_reset <utilizador>` - Reset económico completo",
            "• `/reload_commands` - Recarrega todos os comandos do bot",
            "• `/welcome_config` - Configura mensagens de boas-vindas",
            "• `/evento_especial` - Criar evento especial de economia",
            "• `/music_update` - Atualiza yt-dlp para resolver problemas",
            "• `/music_retry <url>` - Força retry de URL que falhou",
            "• `/music_cache` - Estatísticas do cache de música",
            "• `/test_url <url>` - Testa extração de URL (Debug)",
            "• `/voice_debug` - Diagnóstico detalhado da conexão de voz",
            "• `/test_ffmpeg <url>` - Testa FFmpeg com URL específico"
        ]
        embed.add_field(
            name="👑 **Administração**",
            value="\n".join(admin_commands),
            inline=False
        )
        
        # Informações adicionais
        embed.add_field(
            name="ℹ️ **Informações Úteis**",
            value="🔹 **Prefixo:** Este bot usa comandos slash (`/`)\n"
                  "🔹 **Economia:** Sistema completo com EPA Coins <:epacoin2:1407389417290727434>\n"
                  "🔹 **Jogos:** Quiz, Forca, Blackjack, Apostas PvP e muito mais!\n"
                  "🔹 **Social:** Sistema de níveis, XP e reputação automático\n"
                  "🔹 **Música:** Playlists personalizadas e votação para skip\n"
                  "🔹 **Tickets:** 5 categorias, 1 ticket/user, formato 🎫┃user-0001\n"
                  "🔹 **Utilidades:** Lembretes, Polls, Anúncios, Auto-roles (3 painéis), 2FA\n"
                  "🔹 **Verificação:** Sistema 2FA (matemática + código DM de 8 dígitos)\n"
                  "🔹 **Moderação:** Sistema completo com logs e avisos\n"
                  "🔹 **Monitorização:** Status, latência e estatísticas em tempo real\n"
                  "🔹 **Backup:** Sistema automático de backup (24h)\n"
                  "🔹 **Base de Dados:** SQLite com migração automática\n"
                  "🔹 **Custom Roles:** Cria roles personalizadas na loja!\n"
                  "🔹 **Autor:** Droppers 🇵🇹",
            inline=False
        )
        
        # Rodapé com informações do bot
        total_commands = len([cmd for cmd in self.bot.tree.get_commands()])
        embed.set_footer(
            text=f"EPA Bot • {total_commands} Comandos Disponíveis • Online em {len(self.bot.guilds)} servidor(es)",
            icon_url=self.bot.user.avatar.url if self.bot.user.avatar else None
        )
        
        # Timestamp
        embed.timestamp = discord.utils.utcnow()
        
        await interaction.response.send_message(embed=embed, ephemeral=False)

    @discord.app_commands.command(name="reload_commands", description="[ADMIN] Recarrega todos os comandos do bot")
    async def reload_commands(self, interaction: discord.Interaction):
        """Recarrega todos os cogs/extensões e sincroniza comandos (apenas admin)"""
        # Verificar permissões de administrador
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
            return
        
        await interaction.response.defer(ephemeral=True)
        
        bot = self.bot
        try:
            # Recarregar todos os cogs
            reloaded = []
            failed = []
            
            for ext in bot.initial_extensions:
                try:
                    await bot.reload_extension(ext)
                    reloaded.append(ext)
                except Exception as e:
                    failed.append(f"{ext}: {str(e)[:50]}")
            
            # Sincronizar comandos
            synced = await bot.tree.sync()
            
            embed = discord.Embed(
                title="🔄 Comandos Recarregados!",
                color=discord.Color.green()
            )
            
            if reloaded:
                embed.add_field(
                    name="✅ Recarregados",
                    value="\n".join([f"• {ext}" for ext in reloaded]),
                    inline=False
                )
            
            if failed:
                embed.add_field(
                    name="❌ Falharam",
                    value="\n".join([f"• {fail}" for fail in failed]),
                    inline=False
                )
            
            embed.add_field(
                name="📊 Sincronização",
                value=f"{len(synced)} comandos sincronizados",
                inline=False
            )
            
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            await interaction.followup.send(f"❌ Erro ao recarregar comandos: {e}")


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(HelpCog(bot))
