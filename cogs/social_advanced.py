import discord
from discord.ext import commands
from discord import app_commands
from typing import Optional
from datetime import datetime
import json

from utils.database import get_database


class SocialAdvancedCog(commands.Cog):
    """Comandos sociais avançados: histórico e streaks"""
    
    def __init__(self, bot):
        self.bot = bot
        self.db = None
    
    async def cog_load(self):
        """Carregado quando o cog é inicializado"""
        self.db = await get_database()
    
    # ===== HISTÓRICO DE ATIVIDADE =====
    
    @app_commands.command(name="historico", description="Ver histórico de atividade")
    @app_commands.describe(utilizador="Utilizador para ver histórico (opcional)")
    async def activity_history(self, interaction: discord.Interaction, utilizador: Optional[discord.Member] = None):
        """Ver histórico de atividade"""
        target = utilizador or interaction.user
        user_id = str(target.id)
        guild_id = str(interaction.guild.id)
        
        await interaction.response.defer()
        
        history = await self.db.get_activity_history(user_id, guild_id, limit=20)
        
        if not history:
            await interaction.followup.send(
                f"{'Não tens' if target == interaction.user else f'{target.display_name} não tem'} histórico de atividade!",
                ephemeral=True
            )
            return
        
        embed = discord.Embed(
            title=f"📜 Histórico de {target.display_name}",
            description=f"Últimas {len(history)} atividades",
            color=discord.Color.blue()
        )
        
        embed.set_thumbnail(url=target.display_avatar.url)
        
        # Agrupar por tipo
        activity_emojis = {
            "marriage": "💍",
            "divorce": "💔",
            "level_up": "⬆️",
            "badge_earned": "🏅",
            "achievement": "🏆",
            "game_win": "🎮",
            "daily_streak": "🔥"
        }
        
        for activity in history[:10]:  # Mostrar apenas 10
            emoji = activity_emojis.get(activity["type"], "📌")
            date = datetime.fromisoformat(activity["timestamp"]).strftime("%d/%m %H:%M")
            
            value = activity["data"] or activity["type"].replace("_", " ").title()
            embed.add_field(
                name=f"{emoji} {date}",
                value=value,
                inline=False
            )
        
        await interaction.followup.send(embed=embed)
    
    # ===== SISTEMA DE STREAKS =====
    
    @app_commands.command(name="streaks", description="Ver as tuas streaks")
    async def view_streaks(self, interaction: discord.Interaction):
        """Ver streaks atuais"""
        user_id = str(interaction.user.id)
        guild_id = str(interaction.guild.id)
        
        # Buscar vários tipos de streaks
        daily_streak = await self.db.get_streak(user_id, guild_id, "daily")
        message_streak = await self.db.get_streak(user_id, guild_id, "messages")
        game_streak = await self.db.get_streak(user_id, guild_id, "games")
        
        embed = discord.Embed(
            title=f"🔥 Streaks de {interaction.user.display_name}",
            color=discord.Color.orange()
        )
        
        embed.add_field(
            name="📅 Daily Streak",
            value=f"**Atual:** {daily_streak['current']} dias\n"
                  f"**Melhor:** {daily_streak['best']} dias",
            inline=True
        )
        
        embed.add_field(
            name="💬 Mensagens Streak",
            value=f"**Atual:** {message_streak['current']} dias\n"
                  f"**Melhor:** {message_streak['best']} dias",
            inline=True
        )
        
        embed.add_field(
            name="🎮 Jogos Streak",
            value=f"**Atual:** {game_streak['current']} vitórias\n"
                  f"**Melhor:** {game_streak['best']} vitórias",
            inline=True
        )
        
        total_rewards = daily_streak['total_rewards'] + message_streak['total_rewards'] + game_streak['total_rewards']
        
        embed.set_footer(text=f"Total de recompensas ganhas: {total_rewards} EPA Coins")
        
        await interaction.response.send_message(embed=embed)
    
    # ===== TOP UTILIZADORES POR CATEGORIA =====
    
    # TEMPORARIAMENTE DESATIVADO - USE /leaderboard <categoria>
    # @app_commands.command(name="top_categoria", description="Top utilizadores por categoria")
    # @app_commands.describe(
    #     categoria="Categoria para ver ranking"
    # )
    # @app_commands.choices(categoria=[
    #     app_commands.Choice(name="🏆 Level mais alto", value="level"),
    #     app_commands.Choice(name="💬 Mais mensagens", value="messages"),
    #     app_commands.Choice(name="⭐ Mais reputação", value="reputation"),
    #     app_commands.Choice(name="🏅 Mais badges", value="badges"),
    #     app_commands.Choice(name="🔥 Melhor streak diário", value="streak")
    # ])
    async def top_category_disabled(self, interaction: discord.Interaction, categoria: str):
        """Ver top utilizadores por categoria"""
        await interaction.response.defer()
        
        embed = discord.Embed(
            title=f"🏆 Top Utilizadores - {categoria.title()}",
            color=discord.Color.gold()
        )
        
        # Aqui você implementaria queries específicas para cada categoria
        # Por simplicidade, vou mostrar um exemplo básico
        
        if categoria == "badges":
            # Contar badges por utilizador (exemplo simplificado)
            description = "Top 10 utilizadores com mais badges"
        elif categoria == "level":
            description = "Top 10 utilizadores com maior nível"
        else:
            description = f"Top 10 utilizadores em {categoria}"
        
        embed.description = description
        embed.set_footer(text="Sistema de rankings em desenvolvimento")
        
        await interaction.followup.send(embed=embed)


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(SocialAdvancedCog(bot))
