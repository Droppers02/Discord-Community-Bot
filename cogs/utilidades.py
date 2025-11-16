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

    @app_commands.command(name="lembrete", description="Cria um lembrete pessoal")
    @app_commands.describe(
        mensagem="Mensagem do lembrete",
        tempo="Tempo para o lembrete (ex: 10m, 1h, 2d)"
    )
    async def lembrete(self, interaction: discord.Interaction, mensagem: str, tempo: str):
        """Cria um lembrete pessoal"""
        # Converter tempo para segundos
        time_regex = re.compile(r"(\d+)([smhd])")
        matches = time_regex.findall(tempo.lower())
        
        if not matches:
            await interaction.response.send_message(
                "❌ Formato de tempo inválido! Use: `10s`, `5m`, `2h`, `1d`", 
                ephemeral=True
            )
            return
        
        total_seconds = 0
        time_units = {"s": 1, "m": 60, "h": 3600, "d": 86400}
        
        for amount, unit in matches:
            total_seconds += int(amount) * time_units[unit]
        
        if total_seconds < 10:  # Mínimo 10 segundos
            await interaction.response.send_message(
                "❌ Tempo mínimo é 10 segundos!", 
                ephemeral=True
            )
            return
        
        if total_seconds > 7 * 24 * 3600:  # Máximo 7 dias
            await interaction.response.send_message(
                "❌ Tempo máximo é 7 dias!", 
                ephemeral=True
            )
            return
        
        # Criar embed de confirmação
        remind_time = datetime.utcnow() + timedelta(seconds=total_seconds)
        
        embed = discord.Embed(
            title="⏰ Lembrete Criado",
            description=f"**Mensagem:** {mensagem}",
            color=discord.Color.green(),
            timestamp=remind_time
        )
        
        embed.add_field(
            name="📅 Será enviado em",
            value=f"{self._format_time_duration(total_seconds)}",
            inline=False
        )
        
        embed.set_footer(text="Lembrete será enviado por DM")
        
        await interaction.response.send_message(embed=embed, ephemeral=True)
        
        # Agendar lembrete
        user_id = interaction.user.id
        reminder_id = f"{user_id}_{datetime.utcnow().timestamp()}"
        
        self.lembretes_ativos[reminder_id] = {
            "user": interaction.user,
            "message": mensagem,
            "time": remind_time
        }
        
        # Executar lembrete após o tempo
        await asyncio.sleep(total_seconds)
        
        if reminder_id in self.lembretes_ativos:
            user = self.lembretes_ativos[reminder_id]["user"]
            message = self.lembretes_ativos[reminder_id]["message"]
            
            # Criar embed do lembrete
            remind_embed = discord.Embed(
                title="⏰ Lembrete!",
                description=f"**Mensagem:** {message}",
                color=discord.Color.orange(),
                timestamp=datetime.utcnow()
            )
            
            remind_embed.set_footer(text="Lembrete criado por ti")
            
            try:
                await user.send(embed=remind_embed)
            except discord.Forbidden:
                # Se não conseguir enviar DM, tentar no canal
                try:
                    channel = interaction.channel
                    await channel.send(f"{user.mention}", embed=remind_embed)
                except:
                    pass  # Se falhar, ignorar
            
            # Remover lembrete da lista
            del self.lembretes_ativos[reminder_id]

    def _format_time_duration(self, seconds: int) -> str:
        """Formatar duração em texto legível"""
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        
        parts = []
        if days > 0:
            parts.append(f"{days} dia{'s' if days != 1 else ''}")
        if hours > 0:
            parts.append(f"{hours} hora{'s' if hours != 1 else ''}")
        if minutes > 0:
            parts.append(f"{minutes} minuto{'s' if minutes != 1 else ''}")
        if secs > 0 and not parts:  # Só mostrar segundos se for menos de 1 minuto
            parts.append(f"{secs} segundo{'s' if secs != 1 else ''}")
        
        return " e ".join(parts) if parts else "agora"


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(UtilidadesCog(bot))
