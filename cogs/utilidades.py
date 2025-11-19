import discord
from discord.ext import commands
from discord import app_commands
import asyncio
from datetime import datetime, timedelta
import re
from typing import Optional


class UtilidadesCog(commands.Cog):
    """Cog para comandos de utilidades"""
    
    def __init__(self, bot):
        self.bot = bot
        self.lembretes_ativos = {}  # Armazenar lembretes ativos

    @app_commands.command(name="avatar", description="Mostra o avatar de um utilizador")
    @app_commands.describe(utilizador="Utilizador para ver o avatar (padrão: você)")
    async def avatar(self, interaction: discord.Interaction, utilizador: Optional[discord.Member] = None):
        """Mostra o avatar de um utilizador"""
        target = utilizador or interaction.user
        
        embed = discord.Embed(
            title=f"🖼️ Avatar de {target.display_name}",
            color=target.color if target.color != discord.Color.default() else discord.Color.blue(),
            timestamp=datetime.utcnow()
        )
        
        # Avatar principal
        embed.set_image(url=target.display_avatar.url)
        
        # Links para diferentes tamanhos
        avatar_url = str(target.display_avatar.url)
        links = []
        for size in [128, 256, 512, 1024]:
            size_url = avatar_url.replace("?size=1024", f"?size={size}")
            links.append(f"[{size}x{size}]({size_url})")
        
        embed.add_field(
            name="🔗 Downloads",
            value=" • ".join(links),
            inline=False
        )
        
        embed.set_footer(text=f"Solicitado por {interaction.user.display_name}")
        await interaction.response.send_message(embed=embed)


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(UtilidadesCog(bot))
