import discord
from discord.ext import commands
from discord import app_commands
from typing import Optional
from datetime import datetime
import json

from utils.database import get_database


class SocialAdvancedCog(commands.Cog):
    """Comandos sociais avançados: casamento, histórico, streaks"""
    
    def __init__(self, bot):
        self.bot = bot
        self.db = None
        self.marriage_proposals = {}  # {user_id: {partner_id, timestamp}}
    
    async def cog_load(self):
        """Carregado quando o cog é inicializado"""
        self.db = await get_database()
    
    # ===== SISTEMA DE CASAMENTO =====
    
    @app_commands.command(name="casar", description="Pedir em casamento outro utilizador")
    @app_commands.describe(utilizador="Utilizador para pedir em casamento")
    async def marry(self, interaction: discord.Interaction, utilizador: discord.Member):
        """Pedir em casamento"""
        if utilizador == interaction.user:
            await interaction.response.send_message("❌ Não podes casar contigo próprio!", ephemeral=True)
            return
        
        if utilizador.bot:
            await interaction.response.send_message("❌ Não podes casar com bots!", ephemeral=True)
            return
        
        user_id = str(interaction.user.id)
        partner_id = str(utilizador.id)
        guild_id = str(interaction.guild.id)
        
        # Verificar se já está casado
        user_marriage = await self.db.get_marriage(guild_id, user_id)
        partner_marriage = await self.db.get_marriage(guild_id, partner_id)
        
        if user_marriage:
            await interaction.response.send_message("❌ Já estás casado(a)!", ephemeral=True)
            return
        
        if partner_marriage:
            await interaction.response.send_message(f"❌ {utilizador.display_name} já está casado(a)!", ephemeral=True)
            return
        
        # Criar proposta
        class MarriageView(discord.ui.View):
            def __init__(self, proposer, partner):
                super().__init__(timeout=300)
                self.proposer = proposer
                self.partner = partner
                self.answered = False
            
            @discord.ui.button(label="💍 Aceitar", style=discord.ButtonStyle.success)
            async def accept(self, interaction: discord.Interaction, button: discord.ui.Button):
                if interaction.user.id != self.partner.id:
                    await interaction.response.send_message("❌ Não é para ti!", ephemeral=True)
                    return
                
                if self.answered:
                    return
                
                self.answered = True
                
                # Criar casamento
                db = await get_database()
                success = await db.create_marriage(
                    str(interaction.guild.id),
                    str(self.proposer.id),
                    str(self.partner.id)
                )
                
                if success:
                    # Dar badges
                    await db.add_badge(
                        str(self.proposer.id), str(interaction.guild.id),
                        "married", "Casado(a)", "💍", "Casou-se no servidor"
                    )
                    await db.add_badge(
                        str(self.partner.id), str(interaction.guild.id),
                        "married", "Casado(a)", "💍", "Casou-se no servidor"
                    )
                    
                    # Log de atividade
                    await db.log_activity(str(self.proposer.id), str(interaction.guild.id), 
                                         "marriage", f"Casou com {self.partner.display_name}")
                    await db.log_activity(str(self.partner.id), str(interaction.guild.id),
                                         "marriage", f"Casou com {self.proposer.display_name}")
                    
                    embed = discord.Embed(
                        title="💐 Casamento!",
                        description=f"🎉 {self.proposer.mention} e {self.partner.mention} agora estão casados!\n\n"
                                   f"*Que tenham uma vida feliz juntos!* 💕",
                        color=discord.Color.from_rgb(255, 182, 193)
                    )
                    embed.set_footer(text=f"Casaram-se em {datetime.now().strftime('%d/%m/%Y às %H:%M')}")
                    
                    for item in self.children:
                        item.disabled = True
                    
                    await interaction.response.edit_message(embed=embed, view=self)
                else:
                    await interaction.response.send_message("❌ Erro ao criar casamento!", ephemeral=True)
            
            @discord.ui.button(label="❌ Recusar", style=discord.ButtonStyle.danger)
            async def decline(self, interaction: discord.Interaction, button: discord.ui.Button):
                if interaction.user.id != self.partner.id:
                    await interaction.response.send_message("❌ Não é para ti!", ephemeral=True)
                    return
                
                if self.answered:
                    return
                
                self.answered = True
                
                embed = discord.Embed(
                    title="💔 Pedido Recusado",
                    description=f"{self.partner.mention} recusou o pedido de {self.proposer.mention}...",
                    color=discord.Color.red()
                )
                
                for item in self.children:
                    item.disabled = True
                
                await interaction.response.edit_message(embed=embed, view=self)
        
        # Enviar proposta
        embed = discord.Embed(
            title="💍 Pedido de Casamento!",
            description=f"{interaction.user.mention} pediu {utilizador.mention} em casamento!\n\n"
                       f"*{utilizador.mention}, aceitas?*",
            color=discord.Color.from_rgb(255, 182, 193)
        )
        embed.set_thumbnail(url=interaction.user.display_avatar.url)
        
        view = MarriageView(interaction.user, utilizador)
        await interaction.response.send_message(embed=embed, view=view)
    
    @app_commands.command(name="divorcio", description="Divorciar-se do parceiro")
    async def divorce(self, interaction: discord.Interaction):
        """Divorciar-se"""
        user_id = str(interaction.user.id)
        guild_id = str(interaction.guild.id)
        
        marriage = await self.db.get_marriage(guild_id, user_id)
        
        if not marriage:
            await interaction.response.send_message("❌ Não estás casado(a)!", ephemeral=True)
            return
        
        partner = interaction.guild.get_member(int(marriage["partner_id"]))
        
        # Confirmação
        class DivorceView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=60)
                self.confirmed = False
            
            @discord.ui.button(label="✅ Confirmar Divórcio", style=discord.ButtonStyle.danger)
            async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
                self.confirmed = True
                
                db = await get_database()
                await db.divorce(str(interaction.guild.id), str(interaction.user.id))
                
                # Log
                await db.log_activity(str(interaction.user.id), str(interaction.guild.id),
                                     "divorce", f"Divorciou-se de {partner.display_name if partner else 'parceiro'}")
                
                embed = discord.Embed(
                    title="💔 Divórcio",
                    description=f"{interaction.user.mention} divorciou-se...",
                    color=discord.Color.dark_gray()
                )
                
                for item in self.children:
                    item.disabled = True
                
                await interaction.response.edit_message(embed=embed, view=self)
            
            @discord.ui.button(label="❌ Cancelar", style=discord.ButtonStyle.secondary)
            async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
                await interaction.response.edit_message(
                    content="Cancelado.",
                    embed=None,
                    view=None
                )
        
        embed = discord.Embed(
            title="⚠️ Confirmar Divórcio",
            description=f"Tens a certeza que queres divorciar-te de {partner.mention if partner else 'o teu parceiro'}?",
            color=discord.Color.orange()
        )
        
        await interaction.response.send_message(embed=embed, view=DivorceView(), ephemeral=True)
    
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
