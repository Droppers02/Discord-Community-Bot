"""
Sistema de Monitorização e Status para EPA BOT
Fornece informações sobre saúde e desempenho do bot
"""

import discord
from discord.ext import commands
from discord import app_commands
import psutil
import platform
from datetime import datetime, timedelta
import time

from utils.embeds import EmbedBuilder


class MonitoringCog(commands.Cog):
    """Sistema de monitorização e estatísticas"""
    
    def __init__(self, bot):
        self.bot = bot
        self.start_time = datetime.utcnow()
        self.logger = bot.logger
        self.command_usage = {}  # Contador de uso de comandos
    
    @commands.Cog.listener()
    async def on_app_command_completion(self, interaction: discord.Interaction, command):
        """Rastreia uso de comandos"""
        command_name = command.name
        if command_name not in self.command_usage:
            self.command_usage[command_name] = 0
        self.command_usage[command_name] += 1
    
    @app_commands.command(name="status", description="Mostra o status e estatísticas do bot")
    async def status(self, interaction: discord.Interaction):
        """Mostra informações de status do bot"""
        
        await interaction.response.defer()
        
        # Calcular uptime
        uptime = datetime.utcnow() - self.start_time
        uptime_str = self._format_uptime(uptime)
        
        # Informações do sistema
        process = psutil.Process()
        memory_usage = process.memory_info().rss / 1024 / 1024  # MB
        cpu_usage = process.cpu_percent(interval=1)
        
        # Latência
        latency = round(self.bot.latency * 1000)
        
        # Estatísticas do Discord
        total_guilds = len(self.bot.guilds)
        total_users = len(set(self.bot.get_all_members()))
        total_channels = sum(len(guild.channels) for guild in self.bot.guilds)
        
        # Criar embed
        embed = EmbedBuilder.info(
            title="📊 Status do Bot",
            description=f"**{self.bot.user.name}** está online e operacional!"
        )
        embed.set_thumbnail(url=self.bot.user.display_avatar.url)
        
        # Sistema
        embed.add_field(
            name="⚙️ Sistema",
            value=f"**OS:** {platform.system()} {platform.release()}\n"
                  f"**Python:** {platform.python_version()}\n"
                  f"**discord.py:** {discord.__version__}",
            inline=True
        )
        
        # Performance
        latency_emoji = "🟢" if latency < 100 else "🟡" if latency < 200 else "🔴"
        embed.add_field(
            name="⚡ Performance",
            value=f"**Latência:** {latency_emoji} {latency}ms\n"
                  f"**CPU:** {cpu_usage:.1f}%\n"
                  f"**RAM:** {memory_usage:.1f} MB",
            inline=True
        )
        
        # Uptime
        embed.add_field(
            name="🕐 Uptime",
            value=f"**Online há:** {uptime_str}\n"
                  f"**Iniciado:** <t:{int(self.start_time.timestamp())}:R>",
            inline=True
        )
        
        # Estatísticas
        embed.add_field(
            name="📈 Estatísticas",
            value=f"**Servidores:** {total_guilds}\n"
                  f"**Utilizadores:** {total_users:,}\n"
                  f"**Canais:** {total_channels:,}",
            inline=True
        )
        
        # Comandos
        total_commands = sum(self.command_usage.values())
        top_command = max(self.command_usage.items(), key=lambda x: x[1]) if self.command_usage else ("Nenhum", 0)
        
        embed.add_field(
            name="🎯 Comandos",
            value=f"**Total executado:** {total_commands:,}\n"
                  f"**Mais usado:** /{top_command[0]} ({top_command[1]}x)\n"
                  f"**Disponíveis:** {len(self.bot.tree.get_commands())}",
            inline=True
        )
        
        # Cogs carregados
        cogs_loaded = len(self.bot.cogs)
        embed.add_field(
            name="🔌 Módulos",
            value=f"**Carregados:** {cogs_loaded}\n"
                  f"**Ativos:** {cogs_loaded}",
            inline=True
        )
        
        embed.set_footer(text=f"Bot criado por {self.bot.application.owner}")
        
        await interaction.followup.send(embed=embed)
    
    @app_commands.command(name="ping", description="Verifica a latência do bot")
    async def ping(self, interaction: discord.Interaction):
        """Mostra a latência do bot"""
        
        # Medir tempo de resposta
        start = time.time()
        await interaction.response.defer(ephemeral=True)
        end = time.time()
        
        api_latency = round((end - start) * 1000)
        ws_latency = round(self.bot.latency * 1000)
        
        # Determinar emoji baseado na latência
        if ws_latency < 100:
            emoji = "🟢"
            status = "Excelente"
        elif ws_latency < 200:
            emoji = "🟡"
            status = "Bom"
        elif ws_latency < 300:
            emoji = "🟠"
            status = "Médio"
        else:
            emoji = "🔴"
            status = "Lento"
        
        embed = EmbedBuilder.info(
            title=f"{emoji} Pong!",
            description=f"Status da conexão: **{status}**"
        )
        
        embed.add_field(
            name="🌐 Latência WebSocket",
            value=f"```{ws_latency} ms```",
            inline=True
        )
        
        embed.add_field(
            name="⚡ Latência API",
            value=f"```{api_latency} ms```",
            inline=True
        )
        
        await interaction.followup.send(embed=embed, ephemeral=True)
    
    @app_commands.command(name="serverinfo", description="Mostra informações sobre o servidor")
    async def serverinfo(self, interaction: discord.Interaction):
        """Mostra informações detalhadas do servidor"""
        
        guild = interaction.guild
        
        # Contar membros
        total_members = guild.member_count
        humans = len([m for m in guild.members if not m.bot])
        bots = len([m for m in guild.members if m.bot])
        online = len([m for m in guild.members if m.status != discord.Status.offline])
        
        # Contar canais
        text_channels = len(guild.text_channels)
        voice_channels = len(guild.voice_channels)
        categories = len(guild.categories)
        
        # Criar embed
        embed = EmbedBuilder.info(
            title=f"ℹ️ Informações de {guild.name}",
            description=f"**ID:** `{guild.id}`"
        )
        
        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)
        
        # Informações gerais
        embed.add_field(
            name="👑 Proprietário",
            value=guild.owner.mention if guild.owner else "Desconhecido",
            inline=True
        )
        
        embed.add_field(
            name="📅 Criado em",
            value=f"<t:{int(guild.created_at.timestamp())}:D>\n(<t:{int(guild.created_at.timestamp())}:R>)",
            inline=True
        )
        
        embed.add_field(
            name="📊 Nível de verificação",
            value=str(guild.verification_level).replace('_', ' ').title(),
            inline=True
        )
        
        # Membros
        embed.add_field(
            name=f"👥 Membros ({total_members})",
            value=f"👤 Humanos: **{humans}**\n"
                  f"🤖 Bots: **{bots}**\n"
                  f"🟢 Online: **{online}**",
            inline=True
        )
        
        # Canais
        embed.add_field(
            name=f"📝 Canais ({text_channels + voice_channels})",
            value=f"💬 Texto: **{text_channels}**\n"
                  f"🔊 Voz: **{voice_channels}**\n"
                  f"📁 Categorias: **{categories}**",
            inline=True
        )
        
        # Outros
        embed.add_field(
            name="🎭 Outros",
            value=f"🎨 Emojis: **{len(guild.emojis)}**\n"
                  f"🏷️ Roles: **{len(guild.roles)}**\n"
                  f"🚀 Boosts: **{guild.premium_subscription_count}**",
            inline=True
        )
        
        # Features
        features = []
        feature_map = {
            "COMMUNITY": "💬 Comunidade",
            "VERIFIED": "✅ Verificado",
            "PARTNERED": "🤝 Parceiro",
            "VANITY_URL": "🔗 URL Personalizado",
            "ANIMATED_ICON": "✨ Ícone Animado",
            "BANNER": "🖼️ Banner",
        }
        
        for feature in guild.features:
            if feature in feature_map:
                features.append(feature_map[feature])
        
        if features:
            embed.add_field(
                name="⭐ Características",
                value="\n".join(features[:6]),
                inline=False
            )
        
        if guild.banner:
            embed.set_image(url=guild.banner.url)
        
        await interaction.response.send_message(embed=embed)
    
    @app_commands.command(name="userinfo", description="Mostra informações sobre um utilizador")
    @app_commands.describe(membro="O membro para ver informações (deixar vazio para ver o seu perfil)")
    async def userinfo(self, interaction: discord.Interaction, membro: discord.Member = None):
        """Mostra informações de um utilizador"""
        
        member = membro or interaction.user
        
        # Criar embed
        embed = EmbedBuilder.info(
            title=f"👤 Informações de {member.display_name}",
            description=f"**Tag:** {member}\n**ID:** `{member.id}`"
        )
        embed.set_thumbnail(url=member.display_avatar.url)
        
        # Status
        status_emoji = {
            discord.Status.online: "🟢 Online",
            discord.Status.idle: "🟡 Ausente",
            discord.Status.dnd: "🔴 Não Perturbar",
            discord.Status.offline: "⚫ Offline"
        }
        
        embed.add_field(
            name="📊 Status",
            value=status_emoji.get(member.status, "⚫ Offline"),
            inline=True
        )
        
        # Tipo
        embed.add_field(
            name="🤖 Tipo",
            value="Bot" if member.bot else "Humano",
            inline=True
        )
        
        # Boost
        if member.premium_since:
            embed.add_field(
                name="🚀 Booster",
                value=f"Desde <t:{int(member.premium_since.timestamp())}:R>",
                inline=True
            )
        
        # Datas
        embed.add_field(
            name="📅 Conta criada",
            value=f"<t:{int(member.created_at.timestamp())}:D>\n<t:{int(member.created_at.timestamp())}:R>",
            inline=True
        )
        
        embed.add_field(
            name="📥 Entrou no servidor",
            value=f"<t:{int(member.joined_at.timestamp())}:D>\n<t:{int(member.joined_at.timestamp())}:R>",
            inline=True
        )
        
        # Cargo mais alto
        top_role = member.top_role
        if top_role != interaction.guild.default_role:
            embed.add_field(
                name="🎨 Cargo mais alto",
                value=top_role.mention,
                inline=True
            )
        
        # Roles
        roles = [role.mention for role in member.roles if role != interaction.guild.default_role]
        if roles:
            roles_text = ", ".join(roles[:10])
            if len(roles) > 10:
                roles_text += f" *e mais {len(roles) - 10}...*"
            embed.add_field(
                name=f"🏷️ Cargos ({len(roles)})",
                value=roles_text,
                inline=False
            )
        
        # Permissões principais
        perms = member.guild_permissions
        key_perms = []
        if perms.administrator:
            key_perms.append("👑 Administrador")
        if perms.manage_guild:
            key_perms.append("⚙️ Gerir Servidor")
        if perms.manage_channels:
            key_perms.append("📝 Gerir Canais")
        if perms.manage_roles:
            key_perms.append("🎭 Gerir Cargos")
        if perms.kick_members:
            key_perms.append("👢 Expulsar Membros")
        if perms.ban_members:
            key_perms.append("🔨 Banir Membros")
        
        if key_perms:
            embed.add_field(
                name="🔑 Permissões Principais",
                value="\n".join(key_perms[:6]),
                inline=False
            )
        
        await interaction.response.send_message(embed=embed)
    
    def _format_uptime(self, td: timedelta) -> str:
        """Formata um timedelta para string legível"""
        days = td.days
        hours, remainder = divmod(td.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        if seconds > 0 or not parts:
            parts.append(f"{seconds}s")
        
        return " ".join(parts)


async def setup(bot):
    await bot.add_cog(MonitoringCog(bot))
