import discord
from discord.ext import commands
from discord import app_commands
import aiosqlite
import random
import asyncio
from datetime import datetime, timedelta
from typing import Optional
import logging

from utils.embeds import EmbedBuilder
from utils.database import get_database


class SocialCog(commands.Cog):
    """Cog para funcionalidades sociais e interação"""
    
    def __init__(self, bot):
        self.bot = bot
        self.db = None  # Será inicializado em cog_load
        self.welcome_config = {"guilds": {}}
        
        # Cooldowns para XP e reputação
        self.xp_cooldowns = {}
        self.rep_cooldowns = {}
        self.levelup_notified = {}  # Evitar notificações duplicadas de level up
    
    async def cog_load(self):
        """Carregado quando o cog é inicializado"""
        try:
            self.db = await get_database()
            self.welcome_config = await self.db.load_welcome_configs()
        except Exception as e:
            self.bot.logger.error(f"Erro ao carregar database no social: {e}")

    async def save_welcome_config(self, guild_id: str):
        """Guardar configurações de boas-vindas na base de dados."""
        if not self.db:
            return

        try:
            config = self.welcome_config["guilds"].get(guild_id, {})
            await self.db.save_welcome_config(guild_id, config)
        except Exception as e:
            self.bot.logger.error(f"Erro ao salvar config de boas-vindas: {e}")

    def calculate_level(self, xp: int) -> int:
        """Calcular nível baseado no XP"""
        return int((xp / 100) ** 0.5) + 1

    def xp_for_level(self, level: int) -> int:
        """XP necessário para um nível"""
        return ((level - 1) ** 2) * 100

    def cleanup_runtime_state(self, now: float):
        """Limpa cooldowns expirados para evitar crescimento indefinido em memória."""
        self.xp_cooldowns = {
            key: timestamp
            for key, timestamp in self.xp_cooldowns.items()
            if now - timestamp < 60
        }
        self.rep_cooldowns = {
            key: timestamp
            for key, timestamp in self.rep_cooldowns.items()
            if now - timestamp < 3600
        }
        self.levelup_notified = {
            key: timestamp
            for key, timestamp in self.levelup_notified.items()
            if now - timestamp < 300
        }

    @commands.Cog.listener()
    async def on_message(self, message):
        """Sistema de XP por mensagens - agora com base de dados e achievements"""
        if message.author.bot or not message.guild or not self.db:
            return
        
        user_id = str(message.author.id)
        guild_id = str(message.guild.id)
        
        # Verificar cooldown (1 XP por minuto máximo)
        cooldown_key = f"{user_id}_{guild_id}"
        now = datetime.utcnow().timestamp()
        self.cleanup_runtime_state(now)
        
        if cooldown_key in self.xp_cooldowns:
            if now - self.xp_cooldowns[cooldown_key] < 60:  # 60 segundos
                return
        
        self.xp_cooldowns[cooldown_key] = now
        
        try:
            # Buscar XP/level atual da base de dados
            level_data = await self.db.get_user_level(user_id, guild_id)
            old_level = level_data["level"]
            old_xp = level_data["xp"]
            
            # XP aleatório entre 15-25
            xp_gain = random.randint(15, 25)
            new_xp = old_xp + xp_gain
            
            # Calcular novo nível
            new_level = self.calculate_level(new_xp)
            
            # Debug log
            self.bot.logger.debug(f"XP Update - User {user_id}: old_level={old_level}, old_xp={old_xp}, xp_gain={xp_gain}, new_xp={new_xp}, new_level={new_level}")
            
            # Atualizar na base de dados
            await self.db.update_user_level(user_id, guild_id, new_xp, new_level)
            
            # Atualizar streak de mensagens (1 dia de streak)
            await self.db.update_streak(user_id, guild_id, "messages", 1)
            
            # Registrar estatísticas diárias para gráficos
            today = datetime.utcnow().date().isoformat()
            async with aiosqlite.connect(self.db.db_path) as db:
                await db.execute(
                    """INSERT INTO message_stats (user_id, guild_id, date, message_count, xp_gained)
                       VALUES (?, ?, ?, 1, ?)
                       ON CONFLICT(user_id, guild_id, date)
                       DO UPDATE SET
                           message_count = message_stats.message_count + EXCLUDED.message_count,
                           xp_gained = message_stats.xp_gained + EXCLUDED.xp_gained""",
                    (user_id, guild_id, today, xp_gain)
                )
                await db.commit()
            
            # Verificar e dar achievements
            await self.check_and_award_achievements(user_id, guild_id)
            
            # Se subiu de nível, enviar notificação
            if new_level > old_level:
                # Verificar se já notificamos este level up (evitar duplicados)
                # Usar timestamp para garantir que só notifica uma vez mesmo após restart
                levelup_key = f"{user_id}_{guild_id}_{new_level}"
                
                # Verificar se notificamos nos últimos 5 minutos
                if levelup_key in self.levelup_notified:
                    time_since_notify = now - self.levelup_notified[levelup_key]
                    if time_since_notify < 300:  # 5 minutos
                        self.bot.logger.debug(f"Skipping duplicate level up notification for {user_id} to level {new_level}")
                        return
                
                self.levelup_notified[levelup_key] = now
                self.bot.logger.info(f"User {user_id} leveled up: {old_level} -> {new_level} (XP: {old_xp} -> {new_xp})")
                
                embed = EmbedBuilder.level_up(
                    user=message.author,
                    level=new_level,
                    xp=new_xp
                )
                
                try:
                    await message.channel.send(embed=embed, delete_after=10)
                except discord.HTTPException as error:
                    self.bot.logger.debug(f"Falha ao enviar notificação de level up para {user_id}: {error}")
                
                # Dar badge por marco de nível
                if new_level == 10:
                    await self.db.add_badge(user_id, guild_id, "level_10", "Nível 10", "🔟", "Atingiu nível 10")
                elif new_level == 25:
                    await self.db.add_badge(user_id, guild_id, "level_25", "Nível 25", "🎖️", "Atingiu nível 25")
                elif new_level == 50:
                    await self.db.add_badge(user_id, guild_id, "level_50", "Nível 50", "⭐", "Atingiu nível 50")
                elif new_level == 100:
                    await self.db.add_badge(user_id, guild_id, "level_100", "Nível 100", "👑", "Atingiu nível 100!")
                
                # Log de atividade
                await self.db.log_activity(user_id, guild_id, "level_up", f"Subiu para nível {new_level}")
            
            self.cleanup_runtime_state(now)
        
        except Exception as e:
            self.bot.logger.error(f"Erro ao processar XP: {e}")

    @commands.Cog.listener()
    async def on_member_join(self, member):
        """Mensagem de boas-vindas"""
        guild_id = str(member.guild.id)
        
        if guild_id not in self.welcome_config["guilds"]:
            return
        
        config = self.welcome_config["guilds"][guild_id]
        
        if not config.get("welcome_enabled", False):
            return
        
        channel_id = config.get("welcome_channel")
        if not channel_id:
            return
        
        channel = member.guild.get_channel(int(channel_id))
        if not channel:
            return
        
        # Mensagem personalizada ou padrão
        message = config.get("welcome_message", 
            "🎉 Bem-vindo ao servidor **{server}**, {user}! Esperamos que te diviertas!")
        
        message = message.format(
            user=member.mention,
            server=member.guild.name,
            username=member.name,
            display_name=member.display_name
        )
        
        embed = discord.Embed(
            title="👋 Novo Membro!",
            description=message,
            color=discord.Color.green(),
            timestamp=datetime.utcnow()
        )
        
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"Membro #{member.guild.member_count}")
        
        try:
            await channel.send(embed=embed)
        except Exception as e:
            self.bot.logger.error(f"Erro ao enviar boas-vindas: {e}")

    @commands.Cog.listener()
    async def on_member_remove(self, member):
        """Mensagem de despedida"""
        guild_id = str(member.guild.id)
        
        if guild_id not in self.welcome_config["guilds"]:
            return
        
        config = self.welcome_config["guilds"][guild_id]
        
        if not config.get("goodbye_enabled", False):
            return
        
        channel_id = config.get("goodbye_channel")
        if not channel_id:
            return
        
        channel = member.guild.get_channel(int(channel_id))
        if not channel:
            return
        
        # Mensagem personalizada ou padrão
        message = config.get("goodbye_message", 
            "😢 **{username}** saiu do servidor. Até à próxima!")
        
        message = message.format(
            username=member.name,
            display_name=member.display_name,
            server=member.guild.name
        )
        
        embed = discord.Embed(
            title="👋 Membro Saiu",
            description=message,
            color=discord.Color.red(),
            timestamp=datetime.utcnow()
        )
        
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"Restam {member.guild.member_count} membros")
        
        try:
            await channel.send(embed=embed)
        except Exception as e:
            self.bot.logger.error(f"Erro ao enviar despedida: {e}")

    @app_commands.command(name="rank", description="Mostra o teu nível e XP")
    @app_commands.describe(utilizador="Utilizador para ver o rank (padrão: você)")
    async def rank(self, interaction: discord.Interaction, utilizador: Optional[discord.Member] = None):
        """Mostra o rank/nível de um utilizador - agora com base de dados"""
        await interaction.response.defer()
        
        target = utilizador or interaction.user
        user_id = str(target.id)
        guild_id = str(interaction.guild.id)
        
        if not self.db:
            await interaction.followup.send("❌ Base de dados não disponível!", ephemeral=True)
            return
        
        try:
            # Buscar dados da base de dados
            level_data = await self.db.get_user_level(user_id, guild_id)
            
            level = level_data["level"]
            current_xp = level_data["xp"]
            xp_for_current = self.xp_for_level(level)
            xp_for_next = self.xp_for_level(level + 1)
            xp_progress = current_xp - xp_for_current
            xp_needed = xp_for_next - xp_for_current
            
            # Garantir que os valores são positivos
            if xp_progress < 0:
                xp_progress = 0
            if xp_needed <= 0:
                xp_needed = 1
            
            # Barra de progresso
            progress_bar_length = 20
            filled = int((xp_progress / xp_needed) * progress_bar_length)
            bar = "█" * filled + "░" * (progress_bar_length - filled)
            
            embed = discord.Embed(
                title=f"📊 Rank de {target.display_name}",
                color=target.color if target.color != discord.Color.default() else discord.Color.blue()
            )
            
            embed.set_thumbnail(url=target.display_avatar.url)
            
            embed.add_field(
                name="🏆 Nível",
                value=f"**{level}**",
                inline=True
            )
            
            embed.add_field(
                name="✨ XP Total",
                value=f"**{current_xp:,}**",
                inline=True
            )
            
            embed.add_field(
                name="📈 Reputação",
                value=f"**{level_data.get('reputation', 0)}**",
                inline=True
            )
            
            embed.add_field(
                name="📊 Progresso para Nível" + str(level + 1),
                value=f"{bar}\n{xp_progress:,}/{xp_needed:,} XP ({(xp_progress/xp_needed)*100:.1f}%)",
                inline=False
            )
            
            embed.add_field(
                name="💬 Mensagens Enviadas",
                value=f"**{level_data.get('messages', 0):,}**",
                inline=True
            )
            
            embed.set_footer(text=f"Solicitado por {interaction.user.display_name}")
            await interaction.followup.send(embed=embed)
        
        except Exception as e:
            self.bot.logger.error(f"Erro ao buscar rank: {e}")
            await interaction.followup.send("❌ Erro ao buscar rank!", ephemeral=True)

    @app_commands.command(name="like", description="Dá um like/reputação a um utilizador")
    @app_commands.describe(utilizador="Utilizador para dar like")
    async def like(self, interaction: discord.Interaction, utilizador: discord.Member):
        """Sistema de reputação/likes"""
        if utilizador.id == interaction.user.id:
            await interaction.response.send_message("❌ Não podes dar like a ti próprio!", ephemeral=True)
            return
        
        if utilizador.bot:
            await interaction.response.send_message("❌ Não podes dar like a bots!", ephemeral=True)
            return
        
        # Verificar cooldown (1 like por hora por pessoa)
        cooldown_key = f"{interaction.user.id}_{utilizador.id}"
        now = datetime.utcnow().timestamp()
        self.cleanup_runtime_state(now)
        
        if cooldown_key in self.rep_cooldowns:
            time_left = 3600 - (now - self.rep_cooldowns[cooldown_key])  # 1 hora
            if time_left > 0:
                minutes = int(time_left // 60)
                seconds = int(time_left % 60)
                await interaction.response.send_message(
                    f"❌ Tens de esperar **{minutes}m {seconds}s** para dar like a {utilizador.display_name} novamente!", 
                    ephemeral=True
                )
                return
        
        self.rep_cooldowns[cooldown_key] = now
        
        # Dar reputação (via base de dados)
        if not self.db:
            await interaction.response.send_message("❌ Base de dados não disponível!", ephemeral=True)
            return
        
        try:
            # Incrementar reputação
            await self.db.execute(
                """INSERT INTO user_levels (user_id, guild_id, reputation, xp, level)
                   VALUES (?, ?, 1, 0, 1)
                   ON CONFLICT(user_id, guild_id) 
                   DO UPDATE SET reputation = user_levels.reputation + 1""",
                (str(utilizador.id), str(interaction.guild.id))
            )
            await self.db.commit()
            
            # Buscar nova reputação
            level_data = await self.db.get_user_level(str(utilizador.id), str(interaction.guild.id))
            reputation = level_data.get("reputation", 1)
            
            embed = discord.Embed(
                title="👍 Like Dado!",
                description=f"{interaction.user.mention} deu like a {utilizador.mention}!",
                color=discord.Color.green()
            )
            
            embed.add_field(
                name="✨ Nova Reputação",
                value=f"**{reputation}** likes",
                inline=True
            )
            
            await interaction.response.send_message(embed=embed)
        except Exception as e:
            self.bot.logger.error(f"Erro ao dar like: {e}")
            await interaction.response.send_message("❌ Erro ao dar like!", ephemeral=True)

    @app_commands.command(name="leaderboard", description="Mostra o ranking do servidor")
    @app_commands.describe(categoria="Categoria de ranking")
    @app_commands.choices(categoria=[
        app_commands.Choice(name="🏆 XP/Nível", value="xp"),
        app_commands.Choice(name="👍 Reputação", value="reputation"),
        app_commands.Choice(name="💰 Economia (Dinheiro)", value="money"),
        app_commands.Choice(name="🎮 Jogos (Vitórias)", value="games"),
        app_commands.Choice(name="📨 Mensagens Enviadas", value="messages"),
        app_commands.Choice(name="🔥 Streaks Ativos", value="streaks")
    ])
    async def leaderboard(self, interaction: discord.Interaction, categoria: str = "xp"):
        """Mostra o ranking do servidor - agora com múltiplas categorias"""
        await interaction.response.defer()
        
        guild_id = str(interaction.guild.id)
        
        if not self.db:
            await interaction.followup.send("❌ Base de dados não disponível!", ephemeral=True)
            return
        
        try:
            # Buscar dados baseado na categoria
            rows = []
            if categoria == "xp":
                query = """SELECT user_id, xp, level 
                          FROM user_levels 
                          WHERE guild_id = ? 
                          ORDER BY xp DESC 
                          LIMIT 10"""
                title = "🏆 Ranking por XP/Nível"
                format_func = lambda row: f"Nível {row[2]} ({row[1]:,} XP)"
                async with aiosqlite.connect(self.db.db_path) as db:
                    async with db.execute(query, (guild_id,)) as cursor:
                        rows = await cursor.fetchall()
                
            elif categoria == "reputation":
                query = """SELECT user_id, reputation, level 
                          FROM user_levels 
                          WHERE guild_id = ? AND reputation > 0
                          ORDER BY reputation DESC 
                          LIMIT 10"""
                title = "👍 Ranking por Reputação"
                format_func = lambda row: f"{row[1]} likes"
                async with aiosqlite.connect(self.db.db_path) as db:
                    async with db.execute(query, (guild_id,)) as cursor:
                        rows = await cursor.fetchall()
                
            elif categoria == "money":
                title = "💰 Ranking por Dinheiro"
                format_func = lambda row: f"${row[1]:,}"
                richest_users = await self.db.get_top_richest(limit=100)
                for entry in richest_users:
                    member = interaction.guild.get_member(int(entry["user_id"]))
                    if member:
                        rows.append((entry["user_id"], entry["balance"]))
                    if len(rows) == 10:
                        break
                
            elif categoria == "games":
                title = "🎮 Ranking por Vitórias em Jogos"
                format_func = lambda row: f"{row[1]} vitórias"
                top_games = await self.db.get_game_leaderboard(limit=100)
                for entry in top_games:
                    member = interaction.guild.get_member(int(entry["user_id"]))
                    if member:
                        rows.append((entry["user_id"], entry["wins"]))
                    if len(rows) == 10:
                        break
                
            elif categoria == "messages":
                query = """SELECT user_id, messages_sent 
                          FROM user_levels 
                          WHERE guild_id = ? AND messages_sent > 0
                          ORDER BY messages_sent DESC 
                          LIMIT 10"""
                title = "📨 Ranking por Mensagens Enviadas"
                format_func = lambda row: f"{row[1]:,} mensagens"
                async with aiosqlite.connect(self.db.db_path) as db:
                    async with db.execute(query, (guild_id,)) as cursor:
                        rows = await cursor.fetchall()
                
            elif categoria == "streaks":
                query = """SELECT user_id, daily_streak 
                          FROM user_levels 
                          WHERE guild_id = ? AND daily_streak > 0
                          ORDER BY daily_streak DESC 
                          LIMIT 10"""
                title = "🔥 Ranking por Streak Diário"
                format_func = lambda row: f"{row[1]} dias"
                async with aiosqlite.connect(self.db.db_path) as db:
                    async with db.execute(query, (guild_id,)) as cursor:
                        rows = await cursor.fetchall()
            
            embed = discord.Embed(
                title=title,
                color=discord.Color.gold(),
                timestamp=datetime.utcnow()
            )
            
            # Top 10
            leaderboard_text = ""
            for i, row in enumerate(rows, 1):
                try:
                    user_id = row[0]
                    user = interaction.guild.get_member(int(user_id))
                    if not user:
                        continue
                    
                    value = format_func(row)
                    medal = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"**{i}.**"
                    leaderboard_text += f"{medal} {user.display_name}: {value}\n"
                    
                except (TypeError, ValueError):
                    continue
            
            if not leaderboard_text:
                leaderboard_text = "Nenhum dado encontrado!"
            
            embed.description = leaderboard_text
            embed.set_footer(text=f"Solicitado por {interaction.user.display_name}")
            
            await interaction.followup.send(embed=embed)
        
        except Exception as e:
            self.bot.logger.error(f"Erro ao buscar leaderboard: {e}")
            await interaction.followup.send("❌ Erro ao buscar ranking!", ephemeral=True)

    @app_commands.command(name="welcome_config", description="[ADMIN] Configura mensagens de boas-vindas")
    @app_commands.describe(
        acao="Ação a realizar",
        canal="Canal para mensagens (boas-vindas ou despedidas)",
        mensagem="Mensagem personalizada"
    )
    @app_commands.choices(acao=[
        app_commands.Choice(name="Ativar Boas-vindas", value="enable_welcome"),
        app_commands.Choice(name="Desativar Boas-vindas", value="disable_welcome"),
        app_commands.Choice(name="Ativar Despedidas", value="enable_goodbye"),
        app_commands.Choice(name="Desativar Despedidas", value="disable_goodbye"),
        app_commands.Choice(name="Definir Canal Boas-vindas", value="set_welcome_channel"),
        app_commands.Choice(name="Definir Canal Despedidas", value="set_goodbye_channel"),
        app_commands.Choice(name="Definir Mensagem Boas-vindas", value="set_welcome_message"),
        app_commands.Choice(name="Definir Mensagem Despedidas", value="set_goodbye_message")
    ])
    async def welcome_config(self, interaction: discord.Interaction, acao: str, 
                           canal: Optional[discord.TextChannel] = None, 
                           mensagem: Optional[str] = None):
        """Configurar sistema de boas-vindas (apenas admin)"""
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
            return
        
        guild_id = str(interaction.guild.id)
        
        if guild_id not in self.welcome_config["guilds"]:
            self.welcome_config["guilds"][guild_id] = {}
        
        config = self.welcome_config["guilds"][guild_id]
        
        if acao == "enable_welcome":
            config["welcome_enabled"] = True
            message = "✅ Mensagens de boas-vindas ativadas!"
        
        elif acao == "disable_welcome":
            config["welcome_enabled"] = False
            message = "❌ Mensagens de boas-vindas desativadas!"
        
        elif acao == "enable_goodbye":
            config["goodbye_enabled"] = True
            message = "✅ Mensagens de despedida ativadas!"
        
        elif acao == "disable_goodbye":
            config["goodbye_enabled"] = False
            message = "❌ Mensagens de despedida desativadas!"
        
        elif acao == "set_welcome_channel":
            if not canal:
                await interaction.response.send_message("❌ Precisa especificar um canal!", ephemeral=True)
                return
            config["welcome_channel"] = canal.id
            message = f"✅ Canal de boas-vindas definido para {canal.mention}!"
        
        elif acao == "set_goodbye_channel":
            if not canal:
                await interaction.response.send_message("❌ Precisa especificar um canal!", ephemeral=True)
                return
            config["goodbye_channel"] = canal.id
            message = f"✅ Canal de despedidas definido para {canal.mention}!"
        
        elif acao == "set_welcome_message":
            if not mensagem:
                await interaction.response.send_message("❌ Precisa especificar uma mensagem!", ephemeral=True)
                return
            config["welcome_message"] = mensagem
            message = "✅ Mensagem de boas-vindas definida!"
        
        elif acao == "set_goodbye_message":
            if not mensagem:
                await interaction.response.send_message("❌ Precisa especificar uma mensagem!", ephemeral=True)
                return
            config["goodbye_message"] = mensagem
            message = "✅ Mensagem de despedida definida!"
        
        await self.save_welcome_config(guild_id)
        
        embed = discord.Embed(
            title="⚙️ Configuração Atualizada",
            description=message,
            color=discord.Color.green()
        )
        
        # Mostrar configuração atual
        status_text = ""
        if config.get("welcome_enabled", False):
            channel = interaction.guild.get_channel(config.get("welcome_channel"))
            status_text += f"✅ Boas-vindas: {channel.mention if channel else 'Canal não definido'}\n"
        else:
            status_text += "❌ Boas-vindas: Desativadas\n"
        
        if config.get("goodbye_enabled", False):
            channel = interaction.guild.get_channel(config.get("goodbye_channel"))
            status_text += f"✅ Despedidas: {channel.mention if channel else 'Canal não definido'}\n"
        else:
            status_text += "❌ Despedidas: Desativadas\n"
        
        embed.add_field(name="Status Atual", value=status_text, inline=False)
        
        await interaction.response.send_message(embed=embed)
    
    # ===== SISTEMA DE PERFIS CUSTOMIZÁVEIS =====
    
    @app_commands.command(name="perfil", description="Ver perfil de um utilizador")
    @app_commands.describe(utilizador="Utilizador para ver perfil (opcional)")
    async def profile(self, interaction: discord.Interaction, utilizador: Optional[discord.Member] = None):
        """Ver perfil completo de utilizador"""
        target = utilizador or interaction.user
        user_id = str(target.id)
        guild_id = str(interaction.guild.id)
        
        await interaction.response.defer()
        
        if not self.db:
            await interaction.followup.send("❌ Base de dados não disponível!", ephemeral=True)
            return
        
        # Dados de XP/Level da base de dados
        level_data = await self.db.get_user_level(user_id, guild_id)
        
        # Dados do perfil customizado
        profile = await self.db.get_profile(user_id, guild_id)
        
        # Badges
        badges = await self.db.get_user_badges(user_id, guild_id)
        
        # Marriage
        marriage = await self.db.get_marriage(guild_id, user_id)
        
        # Criar embed
        color = int(profile["color"].replace("#", ""), 16) if profile and profile.get("color") else 0x5865F2
        embed = discord.Embed(
            title=f"👤 Perfil de {target.display_name}",
            color=discord.Color(color)
        )
        
        # Banner
        if profile and profile.get("banner_url"):
            embed.set_image(url=profile["banner_url"])
        
        embed.set_thumbnail(url=target.display_avatar.url)
        
        # Bio
        if profile and profile.get("bio"):
            embed.description = f"*{profile['bio']}*"
        
        # Stats básicos (usando base de dados)
        embed.add_field(
            name="📊 Estatísticas",
            value=f"**Level:** {level_data['level']}\n"
                  f"**XP:** {level_data['xp']}\n"
                  f"**Reputação:** {level_data.get('reputation', 0)}\n"
                  f"**Mensagens:** {level_data.get('messages', 0)}",
            inline=True
        )
        
        # Info adicional
        info_text = ""
        if profile:
            if profile.get("pronouns"):
                info_text += f"**Pronomes:** {profile['pronouns']}\n"
            if profile.get("birthday"):
                info_text += f"**Aniversário:** {profile['birthday']}\n"
            if profile.get("favorite_game"):
                info_text += f"**Jogo Favorito:** {profile['favorite_game']}\n"
        
        if marriage:
            partner = interaction.guild.get_member(int(marriage["partner_id"]))
            if partner:
                ring_emoji = "💎" if marriage.get("ring_tier") == 3 else "💍"
                info_text += f"{ring_emoji} **Casado(a) com:** {partner.mention}\n"
        
        if info_text:
            embed.add_field(name="ℹ️ Informações", value=info_text, inline=True)
        
        # Badges
        if badges:
            badge_text = " ".join([f"{b['emoji']} {b['name']}" for b in badges[:5]])
            if len(badges) > 5:
                badge_text += f" +{len(badges)-5}"
            embed.add_field(name=f"🏅 Badges ({len(badges)})", value=badge_text, inline=False)
        
        # Campos customizados
        if profile:
            if profile.get("custom_field_1") and profile["custom_field_1"]["name"]:
                embed.add_field(
                    name=profile["custom_field_1"]["name"],
                    value=profile["custom_field_1"]["value"],
                    inline=True
                )
            if profile.get("custom_field_2") and profile["custom_field_2"]["name"]:
                embed.add_field(
                    name=profile["custom_field_2"]["name"],
                    value=profile["custom_field_2"]["value"],
                    inline=True
                )
        
        embed.set_footer(text=f"Membro desde {target.joined_at.strftime('%d/%m/%Y')}")
        
        await interaction.followup.send(embed=embed)
    
    @app_commands.command(name="editarperfil", description="Editar o teu perfil")
    async def edit_profile(self, interaction: discord.Interaction):
        """Editar perfil usando modal"""
        
        class ProfileModal(discord.ui.Modal, title="Editar Perfil"):
            bio = discord.ui.TextInput(
                label="Bio",
                placeholder="Escreve algo sobre ti...",
                style=discord.TextStyle.paragraph,
                required=False,
                max_length=200
            )
            
            pronouns = discord.ui.TextInput(
                label="Pronomes",
                placeholder="ele/dele, ela/dela, etc.",
                required=False,
                max_length=30
            )
            
            birthday = discord.ui.TextInput(
                label="Aniversário",
                placeholder="DD/MM",
                required=False,
                max_length=5
            )
            
            favorite_game = discord.ui.TextInput(
                label="Jogo Favorito",
                placeholder="Qual é o teu jogo favorito?",
                required=False,
                max_length=50
            )
            
            async def on_submit(modal_self, interaction: discord.Interaction):
                user_id = str(interaction.user.id)
                guild_id = str(interaction.guild.id)
                
                db = await get_database()
                await db.update_profile(
                    user_id, guild_id,
                    bio=modal_self.bio.value,
                    pronouns=modal_self.pronouns.value,
                    birthday=modal_self.birthday.value,
                    favorite_game=modal_self.favorite_game.value
                )
                
                await interaction.response.send_message(
                    "✅ Perfil atualizado com sucesso!",
                    ephemeral=True
                )
        
        await interaction.response.send_modal(ProfileModal())
    
    @app_commands.command(name="badges", description="Ver badges de um utilizador")
    @app_commands.describe(utilizador="Utilizador para ver badges (opcional)")
    async def view_badges(self, interaction: discord.Interaction, utilizador: Optional[discord.Member] = None):
        """Ver todas as badges de um utilizador"""
        target = utilizador or interaction.user
        user_id = str(target.id)
        guild_id = str(interaction.guild.id)
        
        if not self.db:
            await interaction.response.send_message("❌ Database não disponível!", ephemeral=True)
            return
        
        badges = await self.db.get_user_badges(user_id, guild_id)
        
        if not badges:
            await interaction.response.send_message(
                f"{'Tu não tens' if target == interaction.user else f'{target.display_name} não tem'} badges ainda!",
                ephemeral=True
            )
            return
        
        embed = discord.Embed(
            title=f"🏅 Badges de {target.display_name}",
            description=f"Total: {len(badges)} badge(s)",
            color=discord.Color.gold()
        )
        
        embed.set_thumbnail(url=target.display_avatar.url)
        
        for badge in badges:
            date = datetime.fromisoformat(badge["earned_at"]).strftime("%d/%m/%Y")
            embed.add_field(
                name=f"{badge['emoji']} {badge['name']}",
                value=f"{badge['description']}\n*Obtida em: {date}*",
                inline=False
            )
        
        await interaction.response.send_message(embed=embed)
    @commands.Cog.listener()
    async def on_message_streak_reward(self, user_id: str, guild_id: str, streak_count: int):
        """Sistema automático de recompensas por streaks"""
        if not self.db:
            return
        
        try:
            # Recompensas baseadas em milestones de streak
            rewards = {
                7: {"badge": "🔥 Semana de Fogo", "money": 1000, "xp": 500},
                30: {"badge": "⭐ Dedicação Mensal", "money": 5000, "xp": 2500},
                90: {"badge": "💎 Trimestre Diamante", "money": 20000, "xp": 10000},
                180: {"badge": "👑 Semestre Real", "money": 50000, "xp": 25000},
                365: {"badge": "🏆 Ano Épico", "money": 100000, "xp": 50000}
            }
            
            if streak_count in rewards:
                reward = rewards[streak_count]
                
                # Adicionar badge
                if "badge" in reward:
                    badge_name = reward["badge"]
                    await self.db.add_badge(
                        user_id, 
                        guild_id,
                        f"streak_reward_{streak_count}",
                        badge_name,
                        "🔥",
                        f"Obtida por {streak_count} dias de streak consecutivo!"
                    )
                
                # Adicionar dinheiro (se o sistema de economia existir)
                if "money" in reward:
                    await self.db.add_money(
                        user_id,
                        reward["money"],
                        transaction_type="streak_reward",
                        description=f"Recompensa de streak de {streak_count} dias"
                    )
                
                # Adicionar XP bonus
                if "xp" in reward:
                    await self.db.update_user_xp(user_id, guild_id, reward["xp"])
                
                # Notificar utilizador (via DM ou canal)
                self.bot.logger.info(f"Streak reward given to {user_id}: {streak_count} days")
                
        except Exception as e:
            self.bot.logger.error(f"Erro ao dar recompensa de streak: {e}")
    
    @app_commands.command(name="amigos", description="Gerenciar a tua lista de amigos")
    @app_commands.describe(acao="Ação a realizar", utilizador="Utilizador alvo")
    @app_commands.choices(acao=[
        app_commands.Choice(name="📋 Ver lista de amigos", value="list"),
        app_commands.Choice(name="➕ Adicionar amigo", value="add"),
        app_commands.Choice(name="➖ Remover amigo", value="remove"),
        app_commands.Choice(name="📬 Pedidos pendentes", value="pending")
    ])
    async def friends(
        self, 
        interaction: discord.Interaction, 
        acao: str,
        utilizador: Optional[discord.Member] = None
    ):
        """Sistema de amizades/friend list"""
        if not self.db:
            await interaction.response.send_message("❌ Database não disponível!", ephemeral=True)
            return
        
        user_id = str(interaction.user.id)
        guild_id = str(interaction.guild.id)
        
        try:
            if acao == "list":
                # Ver lista de amigos
                async with self.db.execute(
                    """SELECT friend_id, created_at FROM friendships 
                       WHERE user_id = ? AND guild_id = ? AND status = 'accepted'""",
                    (user_id, guild_id)
                ) as cursor:
                    friends = await cursor.fetchall()
                
                if not friends:
                    await interaction.response.send_message(
                        "😢 Ainda não tens amigos adicionados! Usa `/amigos add @utilizador` para adicionar.",
                        ephemeral=True
                    )
                    return
                
                embed = discord.Embed(
                    title=f"👥 Amigos de {interaction.user.display_name}",
                    description=f"Total: {len(friends)} amigo(s)",
                    color=discord.Color.blue()
                )
                
                for friend_id, created_at in friends:
                    member = interaction.guild.get_member(int(friend_id))
                    if member:
                        date = datetime.fromisoformat(created_at).strftime("%d/%m/%Y")
                        embed.add_field(
                            name=member.display_name,
                            value=f"Amigos desde: {date}",
                            inline=False
                        )
                
                await interaction.response.send_message(embed=embed)
            
            elif acao == "add":
                if not utilizador:
                    await interaction.response.send_message(
                        "❌ Precisas especificar um utilizador!",
                        ephemeral=True
                    )
                    return
                
                if utilizador == interaction.user:
                    await interaction.response.send_message(
                        "❌ Não podes adicionar-te a ti mesmo!",
                        ephemeral=True
                    )
                    return
                
                friend_id = str(utilizador.id)
                
                # Verificar se já são amigos ou se já existe pedido
                async with self.db.execute(
                    """SELECT status FROM friendships 
                       WHERE user_id = ? AND friend_id = ? AND guild_id = ?""",
                    (user_id, friend_id, guild_id)
                ) as cursor:
                    existing = await cursor.fetchone()
                
                if existing:
                    if existing[0] == "accepted":
                        await interaction.response.send_message(
                            f"❌ Já és amigo de {utilizador.display_name}!",
                            ephemeral=True
                        )
                    else:
                        await interaction.response.send_message(
                            f"⏳ Já enviaste um pedido de amizade para {utilizador.display_name}!",
                            ephemeral=True
                        )
                    return
                
                # Criar pedido de amizade
                await self.db.execute(
                    """INSERT OR IGNORE INTO friendships (user_id, friend_id, guild_id, status, created_at)
                       VALUES (?, ?, ?, 'pending', ?)""",
                    (user_id, friend_id, guild_id, datetime.utcnow().isoformat())
                )
                await self.db.commit()
                
                # Tentar notificar o utilizador
                try:
                    await utilizador.send(
                        f"👋 **{interaction.user.display_name}** enviou-te um pedido de amizade em **{interaction.guild.name}**!\n"
                        f"Usa `/amigos pending` para aceitar ou rejeitar."
                    )
                except discord.HTTPException as error:
                    self.bot.logger.debug(f"Falha ao enviar DM de amizade para {friend_id}: {error}")
                
                await interaction.response.send_message(
                    f"✅ Pedido de amizade enviado para {utilizador.display_name}!",
                    ephemeral=True
                )
            
            elif acao == "remove":
                if not utilizador:
                    await interaction.response.send_message(
                        "❌ Precisas especificar um utilizador!",
                        ephemeral=True
                    )
                    return
                
                friend_id = str(utilizador.id)
                
                # Remover amizade (ambas as direções)
                await self.db.execute(
                    """DELETE FROM friendships 
                       WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
                       AND guild_id = ?""",
                    (user_id, friend_id, friend_id, user_id, guild_id)
                )
                await self.db.commit()
                
                await interaction.response.send_message(
                    f"✅ {utilizador.display_name} foi removido da tua lista de amigos.",
                    ephemeral=True
                )
            
            elif acao == "pending":
                # Ver pedidos pendentes
                async with self.db.execute(
                    """SELECT user_id, created_at FROM friendships 
                       WHERE friend_id = ? AND guild_id = ? AND status = 'pending'""",
                    (user_id, guild_id)
                ) as cursor:
                    requests = await cursor.fetchall()
                
                if not requests:
                    await interaction.response.send_message(
                        "📭 Não tens pedidos de amizade pendentes!",
                        ephemeral=True
                    )
                    return
                
                embed = discord.Embed(
                    title="📬 Pedidos de Amizade Pendentes",
                    description=f"Tens {len(requests)} pedido(s) pendente(s)",
                    color=discord.Color.orange()
                )
                
                for requester_id, created_at in requests:
                    member = interaction.guild.get_member(int(requester_id))
                    if member:
                        date = datetime.fromisoformat(created_at).strftime("%d/%m/%Y %H:%M")
                        embed.add_field(
                            name=member.display_name,
                            value=f"Recebido em: {date}\nID: {requester_id}",
                            inline=False
                        )
                
                embed.set_footer(text="Usa /amigos_aceitar ou /amigos_rejeitar para responder")
                await interaction.response.send_message(embed=embed)
                
        except Exception as e:
            self.bot.logger.error(f"Erro no sistema de amigos: {e}")
            await interaction.response.send_message("❌ Erro ao processar pedido!", ephemeral=True)
    
    @app_commands.command(name="amigos_aceitar", description="Aceitar um pedido de amizade")
    @app_commands.describe(utilizador="Utilizador que enviou o pedido")
    async def accept_friend(self, interaction: discord.Interaction, utilizador: discord.Member):
        """Aceitar pedido de amizade"""
        if not self.db:
            await interaction.response.send_message("❌ Database não disponível!", ephemeral=True)
            return
        
        user_id = str(interaction.user.id)
        friend_id = str(utilizador.id)
        guild_id = str(interaction.guild.id)
        
        try:
            # Verificar se existe pedido pendente
            async with self.db.execute(
                """SELECT 1 FROM friendships 
                   WHERE user_id = ? AND friend_id = ? AND guild_id = ? AND status = 'pending'""",
                (friend_id, user_id, guild_id)
            ) as cursor:
                exists = await cursor.fetchone()
            
            if not exists:
                await interaction.response.send_message(
                    "❌ Não tens nenhum pedido pendente deste utilizador!",
                    ephemeral=True
                )
                return
            
            # Atualizar status para accepted
            await self.db.execute(
                """UPDATE friendships SET status = 'accepted' 
                   WHERE user_id = ? AND friend_id = ? AND guild_id = ?""",
                (friend_id, user_id, guild_id)
            )
            
            # Criar relação reversa (ambos são amigos)
            await self.db.execute(
                """INSERT OR IGNORE INTO friendships (user_id, friend_id, guild_id, status, created_at)
                   VALUES (?, ?, ?, 'accepted', ?)""",
                (user_id, friend_id, guild_id, datetime.utcnow().isoformat())
            )
            
            await self.db.commit()
            
            # Notificar o outro utilizador
            try:
                await utilizador.send(
                    f"🎉 **{interaction.user.display_name}** aceitou o teu pedido de amizade em **{interaction.guild.name}**!"
                )
            except discord.HTTPException as error:
                self.bot.logger.debug(f"Falha ao notificar aceitação de amizade para {friend_id}: {error}")
            
            await interaction.response.send_message(
                f"✅ Agora és amigo de {utilizador.display_name}! 🎉",
                ephemeral=True
            )
            
        except Exception as e:
            self.bot.logger.error(f"Erro ao aceitar amizade: {e}")
            await interaction.response.send_message("❌ Erro ao aceitar pedido!", ephemeral=True)
    
    @app_commands.command(name="amigos_rejeitar", description="Rejeitar um pedido de amizade")
    @app_commands.describe(utilizador="Utilizador que enviou o pedido")
    async def reject_friend(self, interaction: discord.Interaction, utilizador: discord.Member):
        """Rejeitar pedido de amizade"""
        if not self.db:
            await interaction.response.send_message("❌ Database não disponível!", ephemeral=True)
            return
        
        user_id = str(interaction.user.id)
        friend_id = str(utilizador.id)
        guild_id = str(interaction.guild.id)
        
        try:
            # Deletar pedido
            await self.db.execute(
                """DELETE FROM friendships 
                   WHERE user_id = ? AND friend_id = ? AND guild_id = ? AND status = 'pending'""",
                (friend_id, user_id, guild_id)
            )
            await self.db.commit()
            
            await interaction.response.send_message(
                f"✅ Pedido de {utilizador.display_name} foi rejeitado.",
                ephemeral=True
            )
            
        except Exception as e:
            self.bot.logger.error(f"Erro ao rejeitar amizade: {e}")
            await interaction.response.send_message("❌ Erro ao rejeitar pedido!", ephemeral=True)
    
    async def check_and_award_achievements(self, user_id: str, guild_id: str):
        """Sistema automático de badges por achievements"""
        if not self.db:
            return
        
        try:
            # Buscar estatísticas do utilizador
            async with self.db.execute(
                """SELECT xp, level, reputation, messages_sent, daily_streak 
                   FROM user_levels WHERE user_id = ? AND guild_id = ?""",
                (user_id, guild_id)
            ) as cursor:
                user_data = await cursor.fetchone()
            
            if not user_data:
                return
            
            xp, level, reputation, messages_sent, daily_streak = user_data
            
            # Lista de achievements a verificar
            achievements = [
                # Level milestones
                (level >= 10, "level_10", "⭐ Nível 10", "Alcançou o nível 10!", "⭐"),
                (level >= 25, "level_25", "🌟 Nível 25", "Alcançou o nível 25!", "🌟"),
                (level >= 50, "level_50", "💫 Nível 50", "Alcançou o nível 50!", "💫"),
                (level >= 100, "level_100", "✨ Nível 100", "Alcançou o nível 100 - Lendário!", "✨"),
                
                # Reputation milestones
                (reputation >= 10, "rep_10", "👍 Popular", "Recebeu 10 likes!", "👍"),
                (reputation >= 50, "rep_50", "❤️ Adorado", "Recebeu 50 likes!", "❤️"),
                (reputation >= 100, "rep_100", "💖 Amado", "Recebeu 100 likes!", "💖"),
                
                # Message milestones
                (messages_sent >= 100, "msg_100", "💬 Conversador", "Enviou 100 mensagens!", "💬"),
                (messages_sent >= 1000, "msg_1000", "🗣️ Orador", "Enviou 1000 mensagens!", "🗣️"),
                (messages_sent >= 10000, "msg_10000", "📢 Megafone", "Enviou 10000 mensagens!", "📢"),
                
                # Streak milestones
                (daily_streak >= 7, "streak_7", "🔥 Semana de Fogo", "7 dias de streak!", "🔥"),
                (daily_streak >= 30, "streak_30", "⭐ Dedicação Mensal", "30 dias de streak!", "⭐"),
                (daily_streak >= 90, "streak_90", "💎 Trimestre Diamante", "90 dias de streak!", "💎"),
            ]
            
            # Verificar e adicionar badges
            for condition, badge_id, name, description, emoji in achievements:
                if condition:
                    # Verificar se já tem a badge
                    async with self.db.execute(
                        """SELECT 1 FROM user_badges 
                           WHERE user_id = ? AND guild_id = ? AND badge_id = ?""",
                        (user_id, guild_id, badge_id)
                    ) as cursor:
                        has_badge = await cursor.fetchone()
                    
                    if not has_badge:
                        # Adicionar badge
                        await self.db.execute(
                            """INSERT INTO user_badges 
                               (user_id, guild_id, badge_id, badge_name, badge_description, badge_emoji)
                               VALUES (?, ?, ?, ?, ?, ?)""",
                            (user_id, guild_id, badge_id, name, description, emoji)
                        )
                        await self.db.commit()
                        self.bot.logger.info(f"Badge '{name}' awarded to user {user_id}")
        
        except Exception as e:
            self.bot.logger.error(f"Erro ao verificar achievements: {e}")
    
    @app_commands.command(name="casamento_upgrade", description="Fazer upgrade do anel de casamento")
    @app_commands.describe(tier="Nível do anel desejado (1-5)")
    @app_commands.choices(tier=[
        app_commands.Choice(name="🥉 Bronze (Tier 1) - Grátis", value=1),
        app_commands.Choice(name="🥈 Prata (Tier 2) - $50,000", value=2),
        app_commands.Choice(name="🥇 Ouro (Tier 3) - $150,000", value=3),
        app_commands.Choice(name="💎 Diamante (Tier 4) - $500,000", value=4),
        app_commands.Choice(name="👑 Platina (Tier 5) - $1,000,000", value=5),
    ])
    async def marriage_upgrade(self, interaction: discord.Interaction, tier: int):
        """Sistema de ring tier upgrades"""
        if not self.db:
            await interaction.response.send_message("❌ Database não disponível!", ephemeral=True)
            return
        
        user_id = str(interaction.user.id)
        guild_id = str(interaction.guild.id)
        
        # Preços dos tiers
        tier_prices = {
            1: 0,
            2: 50000,
            3: 150000,
            4: 500000,
            5: 1000000
        }
        
        tier_names = {
            1: "🥉 Bronze",
            2: "🥈 Prata",
            3: "🥇 Ouro",
            4: "💎 Diamante",
            5: "👑 Platina"
        }
        
        try:
            # Verificar se está casado
            async with self.db.execute(
                """SELECT id, ring_tier, user1_id, user2_id 
                   FROM marriages 
                   WHERE guild_id = ? AND (user1_id = ? OR user2_id = ?) AND status = 'active'""",
                (guild_id, user_id, user_id)
            ) as cursor:
                marriage = await cursor.fetchone()
            
            if not marriage:
                await interaction.response.send_message(
                    "❌ Precisas estar casado para fazer upgrade do anel!",
                    ephemeral=True
                )
                return
            
            marriage_id, current_tier, user1_id, user2_id = marriage
            partner_id = user2_id if user1_id == user_id else user1_id
            
            if tier <= current_tier:
                await interaction.response.send_message(
                    f"❌ O teu anel já é {tier_names[current_tier]} ou superior!",
                    ephemeral=True
                )
                return
            
            price = tier_prices[tier]
            
            # Verificar se tem dinheiro
            balance = await self.db.get_user_balance(user_id)

            if balance < price:
                await interaction.response.send_message(
                    f"❌ Precisas de **${price:,}** para fazer upgrade para {tier_names[tier]}!\n"
                    f"Tens apenas **${balance:,}** disponíveis.",
                    ephemeral=True
                )
                return
            
            # Fazer upgrade
            await self.db.execute(
                "UPDATE marriages SET ring_tier = ? WHERE id = ?",
                (tier, marriage_id)
            )
            
            # Deduzir dinheiro
            removed = await self.db.remove_money(
                user_id,
                price,
                transaction_type="marriage_upgrade",
                description=f"Upgrade de anel para {tier_names[tier]}"
            )

            if not removed:
                await interaction.response.send_message(
                    "❌ Não foi possível debitar o valor do upgrade. Tenta novamente.",
                    ephemeral=True
                )
                return
            
            await self.db.commit()
            
            partner = interaction.guild.get_member(int(partner_id))
            partner_mention = partner.mention if partner else "o teu parceiro"
            
            embed = discord.Embed(
                title="💍 Upgrade de Anel Realizado!",
                description=f"{interaction.user.mention} fez upgrade do anel de casamento com {partner_mention}!",
                color=discord.Color.gold()
            )
            
            embed.add_field(name="Tier Anterior", value=tier_names[current_tier], inline=True)
            embed.add_field(name="Novo Tier", value=tier_names[tier], inline=True)
            embed.add_field(name="Custo", value=f"${price:,}", inline=True)
            
            await interaction.response.send_message(embed=embed)
            
            # Notificar parceiro
            if partner:
                try:
                    await partner.send(
                        f"💍 {interaction.user.display_name} fez upgrade do vosso anel de casamento para {tier_names[tier]}!"
                    )
                except discord.HTTPException as error:
                    self.bot.logger.debug(f"Falha ao notificar parceiro {partner_id} sobre upgrade de casamento: {error}")
        
        except Exception as e:
            self.bot.logger.error(f"Erro no upgrade de casamento: {e}")
            await interaction.response.send_message("❌ Erro ao fazer upgrade!", ephemeral=True)
    
    @commands.Cog.listener()
    async def on_marriage_anniversary(self):
        """Verificar aniversários de casamento diariamente"""
        if not self.db:
            return
        
        try:
            # Buscar todos os casamentos ativos
            async with self.db.execute(
                """SELECT id, guild_id, user1_id, user2_id, married_at, anniversary_count 
                   FROM marriages WHERE status = 'active'"""
            ) as cursor:
                marriages = await cursor.fetchall()
            
            today = datetime.utcnow().date()
            
            for marriage_id, guild_id, user1_id, user2_id, married_at, anniversary_count in marriages:
                married_date = datetime.fromisoformat(married_at).date()
                
                # Verificar se é aniversário (mesmo dia e mês)
                if married_date.day == today.day and married_date.month == today.month:
                    years = today.year - married_date.year
                    
                    if years > anniversary_count:
                        # É um novo aniversário!
                        await self.db.execute(
                            "UPDATE marriages SET anniversary_count = ? WHERE id = ?",
                            (years, marriage_id)
                        )
                        
                        # Dar recompensas
                        reward_money = years * 10000  # $10k por ano
                        reward_xp = years * 1000
                        
                        for user_id in [user1_id, user2_id]:
                            await self.db.add_money(
                                user_id,
                                reward_money,
                                transaction_type="anniversary_reward",
                                description=f"Recompensa de {years}º aniversário"
                            )
                            await self.db.update_user_xp(user_id, guild_id, reward_xp)
                            
                            # Adicionar badge de aniversário
                            badge_name = f"💕 {years}º Aniversário"
                            await self.db.execute(
                                """INSERT OR IGNORE INTO user_badges 
                                   (user_id, guild_id, badge_id, badge_name, badge_description, badge_emoji)
                                   VALUES (?, ?, ?, ?, ?, ?)""",
                                (user_id, guild_id, f"anniversary_{years}", badge_name, 
                                 f"Celebrou {years} ano(s) de casamento!", "💕")
                            )
                        
                        await self.db.commit()
                        
                        # Notificar o casal
                        guild = self.bot.get_guild(int(guild_id))
                        if guild:
                            user1 = guild.get_member(int(user1_id))
                            user2 = guild.get_member(int(user2_id))
                            
                            message = (
                                f"🎉 **Feliz {years}º Aniversário de Casamento!** 🎉\n\n"
                                f"{user1.mention if user1 else 'Utilizador 1'} ❤️ {user2.mention if user2 else 'Utilizador 2'}\n\n"
                                f"**Recompensas:**\n"
                                f"💰 ${reward_money:,} cada\n"
                                f"⭐ {reward_xp:,} XP cada\n"
                                f"🏅 Badge '{badge_name}'"
                            )
                            
                            # Tentar enviar DMs
                            for user in [user1, user2]:
                                if user:
                                    try:
                                        await user.send(message)
                                    except discord.HTTPException as error:
                                        self.bot.logger.debug(f"Falha ao enviar DM de aniversário de casamento: {error}")
        
        except Exception as e:
            self.bot.logger.error(f"Erro ao verificar aniversários: {e}")
    
    @app_commands.command(name="atividade", description="Ver gráfico de atividade (mensagens/XP)")
    @app_commands.describe(
        utilizador="Utilizador para ver atividade (opcional)",
        periodo="Período de tempo"
    )
    @app_commands.choices(periodo=[
        app_commands.Choice(name="📅 Última Semana (7 dias)", value="7"),
        app_commands.Choice(name="📆 Último Mês (30 dias)", value="30"),
        app_commands.Choice(name="📊 Últimos 3 Meses (90 dias)", value="90"),
    ])
    async def activity_chart(
        self,
        interaction: discord.Interaction,
        periodo: str = "7",
        utilizador: Optional[discord.Member] = None
    ):
        """Ver gráficos de atividade (texto simples - ASCII art)"""
        if not self.db:
            await interaction.response.send_message("❌ Database não disponível!", ephemeral=True)
            return
        
        await interaction.response.defer()
        
        target = utilizador or interaction.user
        user_id = str(target.id)
        guild_id = str(interaction.guild.id)
        days = int(periodo)
        
        try:
            # Buscar dados de atividade
            async with aiosqlite.connect(self.db.db_path) as db:
                async with db.execute(
                          """SELECT date, message_count, xp_gained
                              FROM message_stats
                              WHERE user_id = ? AND guild_id = ?
                       AND date >= CURRENT_DATE - CAST(? AS INTEGER)
                       ORDER BY date ASC""",
                    (user_id, guild_id, days)
                ) as cursor:
                    stats = await cursor.fetchall()
            
            if not stats:
                await interaction.followup.send(
                    f"📊 {target.display_name} não tem dados de atividade no período selecionado.",
                    ephemeral=True
                )
                return
            
            # Criar gráfico ASCII
            max_messages = max(row[1] for row in stats) if stats else 1
            max_xp = max(row[2] for row in stats) if stats else 1
            
            embed = discord.Embed(
                title=f"📊 Atividade de {target.display_name}",
                description=f"Últimos {days} dias",
                color=discord.Color.blue()
            )
            
            embed.set_thumbnail(url=target.display_avatar.url)
            
            # Gráfico de mensagens (ASCII bar chart)
            messages_chart = ""
            for date, msg_count, xp in stats[-7:]:  # Últimos 7 dias para não ficar muito grande
                bar_length = int((msg_count / max_messages) * 20) if max_messages > 0 else 0
                bar = "█" * bar_length
                messages_chart += f"`{date}` {bar} **{msg_count}** msgs\n"
            
            if messages_chart:
                embed.add_field(
                    name="📨 Mensagens por Dia",
                    value=messages_chart or "Sem dados",
                    inline=False
                )
            
            # Estatísticas totais
            total_messages = sum(row[1] for row in stats)
            total_xp = sum(row[2] for row in stats)
            avg_messages = total_messages // len(stats) if stats else 0
            
            embed.add_field(name="Total de Mensagens", value=f"**{total_messages:,}**", inline=True)
            embed.add_field(name="Total de XP Ganho", value=f"**{total_xp:,}**", inline=True)
            embed.add_field(name="Média/Dia", value=f"**{avg_messages}** msgs", inline=True)
            
            embed.set_footer(text=f"Período: {days} dias")
            
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            self.bot.logger.error(f"Erro ao gerar gráfico de atividade: {e}")
            await interaction.followup.send("❌ Erro ao gerar gráfico!", ephemeral=True)


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(SocialCog(bot))

