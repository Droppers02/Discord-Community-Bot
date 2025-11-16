import discord
from discord.ext import commands
from discord import app_commands
import json
import os
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
        self.data_file = "data/social_data.json"
        self.welcome_file = "data/welcome_config.json"
        self.db = None  # Será inicializado em cog_load
        self.ensure_data_files()
        self.load_data()
        self.load_welcome_config()
        
        # Cooldowns para XP e reputação
        self.xp_cooldowns = {}
        self.rep_cooldowns = {}
    
    async def cog_load(self):
        """Carregado quando o cog é inicializado"""
        try:
            self.db = await get_database()
        except Exception as e:
            self.bot.logger.error(f"Erro ao carregar database no social: {e}")

    def ensure_data_files(self):
        """Garantir que os arquivos de dados existem"""
        os.makedirs("data", exist_ok=True)
        
        if not os.path.exists(self.data_file):
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump({"users": {}, "guilds": {}}, f, indent=2)
        
        if not os.path.exists(self.welcome_file):
            with open(self.welcome_file, 'w', encoding='utf-8') as f:
                json.dump({"guilds": {}}, f, indent=2)

    def load_data(self):
        """Carregar dados sociais"""
        try:
            with open(self.data_file, 'r', encoding='utf-8') as f:
                self.social_data = json.load(f)
        except:
            self.social_data = {"users": {}, "guilds": {}}

    def save_data(self):
        """Salvar dados sociais com tratamento de erros"""
        try:
            # Criar backup antes de salvar
            if os.path.exists(self.data_file):
                backup_file = f"{self.data_file}.backup"
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    backup_data = f.read()
                with open(backup_file, 'w', encoding='utf-8') as f:
                    f.write(backup_data)
            
            # Salvar dados
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(self.social_data, f, indent=2, ensure_ascii=False)
                
        except Exception as e:
            self.bot.logger.error(f"Erro ao salvar dados sociais: {e}")
            # Tentar restaurar do backup se falhou
            if os.path.exists(f"{self.data_file}.backup"):
                try:
                    with open(f"{self.data_file}.backup", 'r', encoding='utf-8') as f:
                        self.social_data = json.load(f)
                    self.bot.logger.info("Dados sociais restaurados do backup")
                except:
                    pass

    def load_welcome_config(self):
        """Carregar configurações de boas-vindas"""
        try:
            with open(self.welcome_file, 'r', encoding='utf-8') as f:
                self.welcome_config = json.load(f)
        except:
            self.welcome_config = {"guilds": {}}

    def save_welcome_config(self):
        """Salvar configurações de boas-vindas"""
        try:
            with open(self.welcome_file, 'w', encoding='utf-8') as f:
                json.dump(self.welcome_config, f, indent=2, ensure_ascii=False)
        except Exception as e:
            self.bot.logger.error(f"Erro ao salvar config de boas-vindas: {e}")

    def get_user_data(self, user_id: str, guild_id: str):
        """Obter dados de um utilizador"""
        if guild_id not in self.social_data["guilds"]:
            self.social_data["guilds"][guild_id] = {}
        
        if user_id not in self.social_data["guilds"][guild_id]:
            self.social_data["guilds"][guild_id][user_id] = {
                "xp": 0,
                "level": 1,
                "reputation": 0,
                "messages_sent": 0,
                "last_message": 0
            }
        
        return self.social_data["guilds"][guild_id][user_id]

    def calculate_level(self, xp: int) -> int:
        """Calcular nível baseado no XP"""
        return int((xp / 100) ** 0.5) + 1

    def xp_for_level(self, level: int) -> int:
        """XP necessário para um nível"""
        return ((level - 1) ** 2) * 100

    @commands.Cog.listener()
    async def on_message(self, message):
        """Sistema de XP por mensagens"""
        if message.author.bot or not message.guild:
            return
        
        user_id = str(message.author.id)
        guild_id = str(message.guild.id)
        
        # Verificar cooldown (1 XP por minuto máximo)
        cooldown_key = f"{user_id}_{guild_id}"
        now = datetime.utcnow().timestamp()
        
        if cooldown_key in self.xp_cooldowns:
            if now - self.xp_cooldowns[cooldown_key] < 60:  # 60 segundos
                return
        
        self.xp_cooldowns[cooldown_key] = now
        
        # Dar XP
        user_data = self.get_user_data(user_id, guild_id)
        old_level = user_data["level"]
        
        # XP aleatório entre 15-25
        xp_gain = random.randint(15, 25)
        user_data["xp"] += xp_gain
        user_data["messages_sent"] += 1
        user_data["last_message"] = now
        
        # Calcular novo nível
        new_level = self.calculate_level(user_data["xp"])
        user_data["level"] = new_level
        
        # Se subiu de nível, enviar mensagem
        if new_level > old_level:
            embed = EmbedBuilder.level_up(
                user=message.author,
                level=new_level,
                xp=user_data['xp']
            )
            
            try:
                await message.channel.send(embed=embed, delete_after=10)
            except:
                pass
        
        self.save_data()

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
        """Mostra o rank/nível de um utilizador"""
        await interaction.response.defer()
        
        target = utilizador or interaction.user
        user_data = self.get_user_data(str(target.id), str(interaction.guild.id))
        
        level = user_data["level"]
        current_xp = user_data["xp"]
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
            value=f"**{user_data['reputation']}**",
            inline=True
        )
        
        embed.add_field(
            name="📊 Progresso para Nível " + str(level + 1),
            value=f"{bar}\n{xp_progress:,}/{xp_needed:,} XP ({(xp_progress/xp_needed)*100:.1f}%)",
            inline=False
        )
        
        embed.add_field(
            name="💬 Mensagens Enviadas",
            value=f"**{user_data['messages_sent']:,}**",
            inline=True
        )
        
        embed.set_footer(text=f"Solicitado por {interaction.user.display_name}")
        await interaction.followup.send(embed=embed)

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
        
        # Dar reputação
        user_data = self.get_user_data(str(utilizador.id), str(interaction.guild.id))
        user_data["reputation"] += 1
        self.save_data()
        
        embed = discord.Embed(
            title="👍 Like Dado!",
            description=f"{interaction.user.mention} deu like a {utilizador.mention}!",
            color=discord.Color.green()
        )
        
        embed.add_field(
            name="✨ Nova Reputação",
            value=f"**{user_data['reputation']}** likes",
            inline=True
        )
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="leaderboard", description="Mostra o ranking do servidor")
    @app_commands.describe(tipo="Tipo de ranking (xp ou reputacao)")
    @app_commands.choices(tipo=[
        app_commands.Choice(name="XP/Nível", value="xp"),
        app_commands.Choice(name="Reputação", value="reputation")
    ])
    async def leaderboard(self, interaction: discord.Interaction, tipo: str = "xp"):
        """Mostra o ranking do servidor"""
        guild_id = str(interaction.guild.id)
        
        if guild_id not in self.social_data["guilds"]:
            await interaction.response.send_message("❌ Ainda não há dados de ranking neste servidor!", ephemeral=True)
            return
        
        users_data = self.social_data["guilds"][guild_id]
        
        # Ordenar utilizadores
        if tipo == "xp":
            sorted_users = sorted(users_data.items(), key=lambda x: x[1]["xp"], reverse=True)
            title = "🏆 Ranking por XP/Nível"
            icon = "✨"
        else:
            sorted_users = sorted(users_data.items(), key=lambda x: x[1]["reputation"], reverse=True)
            title = "👍 Ranking por Reputação"
            icon = "💖"
        
        embed = discord.Embed(
            title=title,
            color=discord.Color.gold(),
            timestamp=datetime.utcnow()
        )
        
        # Top 10
        leaderboard_text = ""
        for i, (user_id, data) in enumerate(sorted_users[:10], 1):
            try:
                user = interaction.guild.get_member(int(user_id))
                if not user:
                    continue
                
                if tipo == "xp":
                    value = f"Nível {data['level']} ({data['xp']:,} XP)"
                else:
                    value = f"{data['reputation']} likes"
                
                medal = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"**{i}.**"
                leaderboard_text += f"{medal} {user.display_name}: {value}\n"
                
            except:
                continue
        
        if not leaderboard_text:
            leaderboard_text = "Nenhum dado encontrado!"
        
        embed.description = leaderboard_text
        embed.set_footer(text=f"Solicitado por {interaction.user.display_name}")
        
        await interaction.response.send_message(embed=embed)

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
        
        self.save_welcome_config()
        
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


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(SocialCog(bot))
