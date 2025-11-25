"""
Sistema de Moderação Completo para EPA BOT
Inclui kick, ban, timeout, warn, logs, filtro de palavras, quarentena e appeals
"""

import discord
from discord.ext import commands, tasks
from discord import app_commands
from datetime import datetime, timedelta
from typing import Optional
import asyncio
import json
import os
import re

from utils.embeds import EmbedBuilder
from utils.database import get_database
from utils.logger import bot_logger


class Moderation(commands.Cog):
    """Sistema de moderação avançado"""
    
    def __init__(self, bot):
        self.bot = bot
        self.logger = bot.logger
        self.config_file = "config/moderation_config.json"
        self.quarantine_users = {}  # {user_id: timestamp}
        self.load_config()
    
    def load_config(self):
        """Carregar configuração de moderação"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                self.config = json.load(f)
            bot_logger.info("✅ Configuração de moderação carregada")
        except FileNotFoundError:
            bot_logger.error(f"❌ Arquivo {self.config_file} não encontrado!")
            self.config = {
                "logs": {"channel_id": 0},
                "quarantine": {"enabled": False, "role_id": 0, "duration_minutes": 10},
                "word_filter": {"enabled": False, "words": [], "action": "warn"},
                "timeout_presets": {},
                "appeals": {"enabled": False, "channel_id": 0}
            }
        except json.JSONDecodeError as e:
            bot_logger.error(f"❌ Erro ao ler {self.config_file}: {e}")
            self.config = {
                "logs": {"channel_id": 0},
                "quarantine": {"enabled": False, "role_id": 0, "duration_minutes": 10},
                "word_filter": {"enabled": False, "words": [], "action": "warn"},
                "timeout_presets": {},
                "appeals": {"enabled": False, "channel_id": 0}
            }
    
    async def cog_load(self):
        """Carregado quando o cog é inicializado"""
        self.db = await get_database()
        self.check_quarantine.start()
        bot_logger.info("Sistema de moderação avançado carregado")
    
    def cog_unload(self):
        """Parar tasks ao descarregar"""
        self.check_quarantine.cancel()
    
    async def send_mod_log(self, embed: discord.Embed, guild: discord.Guild):
        """Enviar log para canal de moderação"""
        channel_id = self.config.get("logs", {}).get("channel_id", 0)
        if channel_id == 0:
            return
        
        channel = guild.get_channel(channel_id)
        if channel and isinstance(channel, discord.TextChannel):
            try:
                await channel.send(embed=embed)
            except Exception as e:
                bot_logger.error(f"Erro ao enviar log de moderação: {e}")
    
    @tasks.loop(minutes=1)
    async def check_quarantine(self):
        """Verificar e remover quarentena expirada"""
        if not self.config.get("quarantine", {}).get("enabled", False):
            return
        
        current_time = datetime.now().timestamp()
        duration = self.config.get("quarantine", {}).get("duration_minutes", 10) * 60
        role_id = self.config.get("quarantine", {}).get("role_id", 0)
        
        if role_id == 0:
            return
        
        expired_users = []
        for user_id, join_time in self.quarantine_users.items():
            if current_time - join_time >= duration:
                expired_users.append(user_id)
        
        for user_id in expired_users:
            for guild in self.bot.guilds:
                member = guild.get_member(user_id)
                if member:
                    role = guild.get_role(role_id)
                    if role and role in member.roles:
                        try:
                            await member.remove_roles(role, reason="Quarentena expirada")
                            bot_logger.info(f"Quarentena removida de {member}")
                        except Exception as e:
                            bot_logger.error(f"Erro ao remover quarentena de {member}: {e}")
            
            del self.quarantine_users[user_id]
    
    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        """Aplicar quarentena a novos membros"""
        if not self.config.get("quarantine", {}).get("enabled", False):
            return
        
        role_id = self.config.get("quarantine", {}).get("role_id", 0)
        if role_id == 0:
            return
        
        role = member.guild.get_role(role_id)
        if not role:
            return
        
        try:
            await member.add_roles(role, reason="Quarentena automática para novo membro")
            self.quarantine_users[member.id] = datetime.now().timestamp()
            
            duration_min = self.config.get("quarantine", {}).get("duration_minutes", 10)
            
            # Log
            embed = discord.Embed(
                title="🔒 Quarentena Aplicada",
                description=f"{member.mention} entrou no servidor",
                color=discord.Color.orange(),
                timestamp=datetime.now()
            )
            embed.add_field(name="Usuário", value=f"{member} ({member.id})", inline=True)
            embed.add_field(name="Duração", value=f"{duration_min} minutos", inline=True)
            embed.set_thumbnail(url=member.display_avatar.url)
            
            await self.send_mod_log(embed, member.guild)
            bot_logger.info(f"Quarentena aplicada a {member} por {duration_min} minutos")
            
        except Exception as e:
            bot_logger.error(f"Erro ao aplicar quarentena a {member}: {e}")
    
    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        """Filtrar palavras proibidas"""
        if message.author.bot:
            return
        
        if not self.config.get("word_filter", {}).get("enabled", False):
            return
        
        if not isinstance(message.channel, discord.TextChannel):
            return
        
        # Verificar se tem permissões de moderador (bypass)
        if message.author.guild_permissions.manage_messages:
            return
        
        words = self.config.get("word_filter", {}).get("words", [])
        if not words:
            return
        
        content_lower = message.content.lower()
        
        for word in words:
            pattern = r'\b' + re.escape(word.lower()) + r'\b'
            if re.search(pattern, content_lower):
                # Palavra proibida detectada!
                try:
                    await message.delete()
                except:
                    pass
                
                action = self.config.get("word_filter", {}).get("action", "warn")
                
                # Log
                log_embed = discord.Embed(
                    title="🚫 Palavra Proibida Detectada",
                    description=f"Mensagem de {message.author.mention} apagada",
                    color=discord.Color.red(),
                    timestamp=datetime.now()
                )
                log_embed.add_field(name="Usuário", value=f"{message.author} ({message.author.id})", inline=True)
                log_embed.add_field(name="Canal", value=message.channel.mention, inline=True)
                log_embed.add_field(name="Palavra", value=f"||{word}||", inline=True)
                log_embed.add_field(name="Ação", value=action.capitalize(), inline=True)
                log_embed.set_thumbnail(url=message.author.display_avatar.url)
                
                await self.send_mod_log(log_embed, message.guild)
                
                # Aplicar ação
                if action == "warn":
                    try:
                        dm_embed = discord.Embed(
                            title="⚠️ Aviso de Moderação",
                            description=f"A tua mensagem em **{message.guild.name}** continha uma palavra proibida e foi removida.",
                            color=discord.Color.orange()
                        )
                        dm_embed.add_field(name="Canal", value=message.channel.mention, inline=True)
                        await message.author.send(embed=dm_embed)
                    except:
                        pass
                
                elif action == "timeout":
                    try:
                        duration = timedelta(minutes=10)
                        await message.author.timeout(duration, reason=f"Palavra proibida: {word}")
                        bot_logger.info(f"{message.author} recebeu timeout por palavra proibida: {word}")
                    except:
                        pass
                
                elif action == "kick":
                    try:
                        await message.author.kick(reason=f"Palavra proibida: {word}")
                        bot_logger.info(f"{message.author} foi expulso por palavra proibida: {word}")
                    except:
                        pass
                
                elif action == "ban":
                    try:
                        await message.author.ban(reason=f"Palavra proibida: {word}", delete_message_days=1)
                        bot_logger.info(f"{message.author} foi banido por palavra proibida: {word}")
                    except:
                        pass
                
                break  # Só processar a primeira palavra encontrada
    
    def has_mod_permissions():
        """Decorador para verificar permissões de moderador"""
        async def predicate(interaction: discord.Interaction) -> bool:
            # Verificar se tem permissão de moderador ou a role específica
            if interaction.user.guild_permissions.moderate_members:
                return True
            
            mod_role_id = interaction.client.config.mod_role_id
            if mod_role_id and discord.utils.get(interaction.user.roles, id=mod_role_id):
                return True
            
            await interaction.response.send_message(
                "❌ Não tens permissão para usar este comando!",
                ephemeral=True
            )
            return False
        
        return app_commands.check(predicate)
    
    @app_commands.command(name="kick", description="Expulsa um membro do servidor")
    @app_commands.describe(
        membro="O membro a expulsar",
        motivo="Motivo da expulsão"
    )
    @app_commands.checks.has_permissions(kick_members=True)
    @app_commands.checks.bot_has_permissions(kick_members=True)
    async def kick(
        self,
        interaction: discord.Interaction,
        membro: discord.Member,
        motivo: str = "Não especificado"
    ):
        """Expulsa um membro do servidor"""
        
        # Verificações de segurança
        if membro.id == interaction.user.id:
            await interaction.response.send_message("❌ Não podes expulsar-te a ti mesmo!", ephemeral=True)
            return
        
        if membro.id == self.bot.user.id:
            await interaction.response.send_message("❌ Não me posso expulsar a mim mesmo!", ephemeral=True)
            return
        
        if membro.top_role >= interaction.user.top_role:
            await interaction.response.send_message("❌ Não podes expulsar alguém com cargo igual ou superior!", ephemeral=True)
            return
        
        if membro.top_role >= interaction.guild.me.top_role:
            await interaction.response.send_message("❌ Não posso expulsar alguém com cargo igual ou superior ao meu!", ephemeral=True)
            return
        
        try:
            # Tentar enviar DM ao utilizador
            try:
                dm_embed = EmbedBuilder.moderation(
                    title="Foste expulso",
                    description=f"Foste expulso do servidor **{interaction.guild.name}**"
                )
                dm_embed.add_field(name="Motivo", value=motivo, inline=False)
                dm_embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
                await membro.send(embed=dm_embed)
            except:
                pass  # Utilizador pode ter DMs desativadas
            
            # Expulsar membro
            await membro.kick(reason=f"{interaction.user}: {motivo}")
            
            # Registar no banco de dados
            await self.db.log_moderation(
                guild_id=str(interaction.guild.id),
                user_id=str(membro.id),
                moderator_id=str(interaction.user.id),
                action="kick",
                reason=motivo
            )
            
            # Enviar log para canal de moderação
            log_embed = discord.Embed(
                title="👢 Membro Expulso",
                description=f"{membro.mention} foi expulso do servidor",
                color=discord.Color.orange(),
                timestamp=datetime.now()
            )
            log_embed.add_field(name="Usuário", value=f"{membro} ({membro.id})", inline=True)
            log_embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            log_embed.add_field(name="Motivo", value=motivo, inline=False)
            log_embed.set_thumbnail(url=membro.display_avatar.url)
            
            await self.send_mod_log(log_embed, interaction.guild)
            
            # Confirmar ação
            embed = EmbedBuilder.moderation_log(
                action="Kick",
                user=membro,
                moderator=interaction.user,
                reason=motivo
            )
            
            await interaction.response.send_message(embed=embed)
            self.logger.info(f"{interaction.user} expulsou {membro} por: {motivo}")
            
        except discord.Forbidden:
            await interaction.response.send_message("❌ Não tenho permissões para expulsar este membro!", ephemeral=True)
        except Exception as e:
            self.logger.error(f"Erro ao expulsar membro: {e}")
            await interaction.response.send_message("❌ Erro ao expulsar membro!", ephemeral=True)
    
    @app_commands.command(name="ban", description="Bane um membro do servidor")
    @app_commands.describe(
        membro="O membro a banir",
        motivo="Motivo do banimento",
        apagar_dias="Dias de mensagens a apagar (0-7)"
    )
    @app_commands.checks.has_permissions(ban_members=True)
    @app_commands.checks.bot_has_permissions(ban_members=True)
    async def ban(
        self,
        interaction: discord.Interaction,
        membro: discord.Member,
        motivo: str = "Não especificado",
        apagar_dias: app_commands.Range[int, 0, 7] = 0
    ):
        """Bane um membro do servidor"""
        
        # Verificações de segurança
        if membro.id == interaction.user.id:
            await interaction.response.send_message("❌ Não podes banir-te a ti mesmo!", ephemeral=True)
            return
        
        if membro.id == self.bot.user.id:
            await interaction.response.send_message("❌ Não me posso banir a mim mesmo!", ephemeral=True)
            return
        
        if membro.top_role >= interaction.user.top_role:
            await interaction.response.send_message("❌ Não podes banir alguém com cargo igual ou superior!", ephemeral=True)
            return
        
        if membro.top_role >= interaction.guild.me.top_role:
            await interaction.response.send_message("❌ Não posso banir alguém com cargo igual ou superior ao meu!", ephemeral=True)
            return
        
        try:
            # Tentar enviar DM ao utilizador
            try:
                dm_embed = EmbedBuilder.moderation(
                    title="Foste banido",
                    description=f"Foste banido do servidor **{interaction.guild.name}**"
                )
                dm_embed.add_field(name="Motivo", value=motivo, inline=False)
                dm_embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
                await membro.send(embed=dm_embed)
            except:
                pass
            
            # Banir membro
            await membro.ban(
                reason=f"{interaction.user}: {motivo}",
                delete_message_days=apagar_dias
            )
            
            # Registar no banco de dados
            await self.db.log_moderation(
                guild_id=str(interaction.guild.id),
                user_id=str(membro.id),
                moderator_id=str(interaction.user.id),
                action="ban",
                reason=motivo
            )
            
            # Enviar log para canal de moderação
            log_embed = discord.Embed(
                title="🔨 Membro Banido",
                description=f"{membro.mention} foi banido do servidor",
                color=discord.Color.red(),
                timestamp=datetime.now()
            )
            log_embed.add_field(name="Usuário", value=f"{membro} ({membro.id})", inline=True)
            log_embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            log_embed.add_field(name="Motivo", value=motivo, inline=False)
            if apagar_dias > 0:
                log_embed.add_field(name="Mensagens Apagadas", value=f"{apagar_dias} dias", inline=True)
            log_embed.set_thumbnail(url=membro.display_avatar.url)
            
            await self.send_mod_log(log_embed, interaction.guild)
            
            # Confirmar ação
            embed = EmbedBuilder.moderation_log(
                action="Ban",
                user=membro,
                moderator=interaction.user,
                reason=motivo
            )
            
            if apagar_dias > 0:
                embed.add_field(name="Mensagens apagadas", value=f"Últimos {apagar_dias} dias", inline=True)
            
            await interaction.response.send_message(embed=embed)
            self.logger.info(f"{interaction.user} baniu {membro} por: {motivo}")
            
        except discord.Forbidden:
            await interaction.response.send_message("❌ Não tenho permissões para banir este membro!", ephemeral=True)
        except Exception as e:
            self.logger.error(f"Erro ao banir membro: {e}")
            await interaction.response.send_message("❌ Erro ao banir membro!", ephemeral=True)
    
    @app_commands.command(name="unban", description="Remove o ban de um utilizador")
    @app_commands.describe(
        user_id="ID do utilizador a desbanir",
        motivo="Motivo do desbanimento"
    )
    @app_commands.checks.has_permissions(ban_members=True)
    @app_commands.checks.bot_has_permissions(ban_members=True)
    async def unban(
        self,
        interaction: discord.Interaction,
        user_id: str,
        motivo: str = "Não especificado"
    ):
        """Remove o ban de um utilizador"""
        
        try:
            user_id_int = int(user_id)
            user = await self.bot.fetch_user(user_id_int)
            
            # Verificar se está banido
            try:
                await interaction.guild.fetch_ban(user)
            except discord.NotFound:
                await interaction.response.send_message(f"❌ {user.mention} não está banido!", ephemeral=True)
                return
            
            # Remover ban
            await interaction.guild.unban(user, reason=f"{interaction.user}: {motivo}")
            
            # Registar no banco de dados
            await self.db.log_moderation(
                guild_id=str(interaction.guild.id),
                user_id=str(user.id),
                moderator_id=str(interaction.user.id),
                action="unban",
                reason=motivo
            )
            
            embed = EmbedBuilder.success(
                title="✅ Utilizador desbanido",
                description=f"**{user}** foi desbanido com sucesso!"
            )
            embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            embed.add_field(name="Motivo", value=motivo, inline=True)
            
            await interaction.response.send_message(embed=embed)
            self.logger.info(f"{interaction.user} desbaniu {user} por: {motivo}")
            
        except ValueError:
            await interaction.response.send_message("❌ ID de utilizador inválido!", ephemeral=True)
        except Exception as e:
            self.logger.error(f"Erro ao desbanir: {e}")
            await interaction.response.send_message("❌ Erro ao desbanir utilizador!", ephemeral=True)
    
    @app_commands.command(name="timeout", description="Coloca um membro em timeout com presets")
    @app_commands.describe(
        membro="O membro a colocar em timeout",
        preset="Preset de duração",
        motivo="Motivo do timeout"
    )
    @app_commands.choices(preset=[
        app_commands.Choice(name="1 minuto", value="1m"),
        app_commands.Choice(name="5 minutos", value="5m"),
        app_commands.Choice(name="10 minutos", value="10m"),
        app_commands.Choice(name="30 minutos", value="30m"),
        app_commands.Choice(name="1 hora", value="1h"),
        app_commands.Choice(name="6 horas", value="6h"),
        app_commands.Choice(name="12 horas", value="12h"),
        app_commands.Choice(name="1 dia", value="1d"),
        app_commands.Choice(name="3 dias", value="3d"),
        app_commands.Choice(name="1 semana", value="1w"),
    ])
    @app_commands.checks.has_permissions(moderate_members=True)
    @app_commands.checks.bot_has_permissions(moderate_members=True)
    async def timeout(
        self,
        interaction: discord.Interaction,
        membro: discord.Member,
        preset: str,
        motivo: str = "Não especificado"
    ):
        """Coloca um membro em timeout"""
        
        # Verificações de segurança
        if membro.id == interaction.user.id:
            await interaction.response.send_message("❌ Não podes colocar-te em timeout!", ephemeral=True)
            return
        
        if membro.id == self.bot.user.id:
            await interaction.response.send_message("❌ Não me posso colocar em timeout!", ephemeral=True)
            return
        
        if membro.top_role >= interaction.user.top_role:
            await interaction.response.send_message("❌ Não podes colocar em timeout alguém com cargo igual ou superior!", ephemeral=True)
            return
        
        if membro.top_role >= interaction.guild.me.top_role:
            await interaction.response.send_message("❌ Não posso colocar em timeout alguém com cargo igual ou superior ao meu!", ephemeral=True)
            return
        
        try:
            # Obter duração em segundos do preset
            presets = self.config.get("timeout_presets", {
                "1m": 60, "5m": 300, "10m": 600, "30m": 1800,
                "1h": 3600, "6h": 21600, "12h": 43200,
                "1d": 86400, "3d": 259200, "1w": 604800
            })
            
            duration_seconds = presets.get(preset, 600)  # Padrão: 10 minutos
            duration_minutes = duration_seconds // 60
            
            # Calcular tempo de timeout
            timeout_until = discord.utils.utcnow() + timedelta(seconds=duration_seconds)
            
            # Aplicar timeout
            await membro.timeout(timeout_until, reason=f"{interaction.user}: {motivo}")
            
            # Registar no banco de dados
            await self.db.log_moderation(
                guild_id=str(interaction.guild.id),
                user_id=str(membro.id),
                moderator_id=str(interaction.user.id),
                action="timeout",
                reason=motivo,
                duration=duration_minutes
            )
            
            # Formatar duração
            preset_names = {
                "1m": "1 minuto", "5m": "5 minutos", "10m": "10 minutos", "30m": "30 minutos",
                "1h": "1 hora", "6h": "6 horas", "12h": "12 horas",
                "1d": "1 dia", "3d": "3 dias", "1w": "1 semana"
            }
            duration_str = preset_names.get(preset, f"{duration_minutes} minutos")
            
            # Enviar log para canal de moderação
            log_embed = discord.Embed(
                title="⏱️ Membro em Timeout",
                description=f"{membro.mention} foi colocado em timeout",
                color=discord.Color.orange(),
                timestamp=datetime.now()
            )
            log_embed.add_field(name="Usuário", value=f"{membro} ({membro.id})", inline=True)
            log_embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            log_embed.add_field(name="Duração", value=duration_str, inline=True)
            log_embed.add_field(name="Motivo", value=motivo, inline=False)
            log_embed.set_thumbnail(url=membro.display_avatar.url)
            
            await self.send_mod_log(log_embed, interaction.guild)
            
            embed = EmbedBuilder.moderation_log(
                action="Timeout",
                user=membro,
                moderator=interaction.user,
                reason=motivo,
                duration=duration_str
            )
            
            await interaction.response.send_message(embed=embed)
            self.logger.info(f"{interaction.user} colocou {membro} em timeout por {duration_str}: {motivo}")
            
        except discord.Forbidden:
            await interaction.response.send_message("❌ Não tenho permissões para colocar este membro em timeout!", ephemeral=True)
        except Exception as e:
            self.logger.error(f"Erro ao aplicar timeout: {e}")
            await interaction.response.send_message("❌ Erro ao aplicar timeout!", ephemeral=True)
    
    @app_commands.command(name="untimeout", description="Remove o timeout de um membro")
    @app_commands.describe(
        membro="O membro a remover o timeout",
        motivo="Motivo da remoção"
    )
    @app_commands.checks.has_permissions(moderate_members=True)
    @app_commands.checks.bot_has_permissions(moderate_members=True)
    async def untimeout(
        self,
        interaction: discord.Interaction,
        membro: discord.Member,
        motivo: str = "Não especificado"
    ):
        """Remove o timeout de um membro"""
        
        if not membro.is_timed_out():
            await interaction.response.send_message(f"❌ {membro.mention} não está em timeout!", ephemeral=True)
            return
        
        try:
            await membro.timeout(None, reason=f"{interaction.user}: {motivo}")
            
            embed = EmbedBuilder.success(
                title="✅ Timeout removido",
                description=f"O timeout de {membro.mention} foi removido!"
            )
            embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            embed.add_field(name="Motivo", value=motivo, inline=True)
            
            await interaction.response.send_message(embed=embed)
            self.logger.info(f"{interaction.user} removeu timeout de {membro}")
            
        except Exception as e:
            self.logger.error(f"Erro ao remover timeout: {e}")
            await interaction.response.send_message("❌ Erro ao remover timeout!", ephemeral=True)
    
    @app_commands.command(name="warn", description="Avisa um membro")
    @app_commands.describe(
        membro="O membro a avisar",
        motivo="Motivo do aviso"
    )
    @app_commands.checks.has_permissions(moderate_members=True)
    async def warn(
        self,
        interaction: discord.Interaction,
        membro: discord.Member,
        motivo: str
    ):
        """Avisa um membro"""
        
        if membro.id == interaction.user.id:
            await interaction.response.send_message("❌ Não podes avisar-te a ti mesmo!", ephemeral=True)
            return
        
        if membro.bot:
            await interaction.response.send_message("❌ Não podes avisar bots!", ephemeral=True)
            return
        
        try:
            # Adicionar aviso ao banco de dados
            await self.db.add_warning(
                guild_id=str(interaction.guild.id),
                user_id=str(membro.id),
                moderator_id=str(interaction.user.id),
                reason=motivo
            )
            
            # Obter total de avisos
            warnings = await self.db.get_warnings(str(interaction.guild.id), str(membro.id))
            total_warnings = len(warnings)
            
            # Tentar enviar DM
            try:
                dm_embed = EmbedBuilder.warning(
                    title="⚠️ Aviso recebido",
                    description=f"Recebeste um aviso no servidor **{interaction.guild.name}**"
                )
                dm_embed.add_field(name="Motivo", value=motivo, inline=False)
                dm_embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
                dm_embed.add_field(name="Total de avisos", value=f"**{total_warnings}**", inline=True)
                await membro.send(embed=dm_embed)
            except:
                pass
            
            # Confirmar
            embed = EmbedBuilder.warning(
                title="⚠️ Aviso aplicado",
                description=f"{membro.mention} recebeu um aviso!"
            )
            embed.add_field(name="Motivo", value=motivo, inline=False)
            embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            embed.add_field(name="Total de avisos", value=f"**{total_warnings}**", inline=True)
            
            await interaction.response.send_message(embed=embed)
            self.logger.info(f"{interaction.user} avisou {membro}: {motivo}")
            
        except Exception as e:
            self.logger.error(f"Erro ao avisar membro: {e}")
            await interaction.response.send_message("❌ Erro ao aplicar aviso!", ephemeral=True)
    
    @app_commands.command(name="warnings", description="Mostra os avisos de um membro")
    @app_commands.describe(membro="O membro para ver os avisos")
    async def warnings(
        self,
        interaction: discord.Interaction,
        membro: discord.Member
    ):
        """Mostra os avisos de um membro"""
        
        try:
            warnings = await self.db.get_warnings(str(interaction.guild.id), str(membro.id))
            
            if not warnings:
                embed = EmbedBuilder.info(
                    title="📋 Avisos",
                    description=f"{membro.mention} não tem avisos ativos!"
                )
                await interaction.response.send_message(embed=embed, ephemeral=True)
                return
            
            embed = EmbedBuilder.warning(
                title=f"⚠️ Avisos de {membro.display_name}",
                description=f"Total de avisos: **{len(warnings)}**"
            )
            embed.set_thumbnail(url=membro.display_avatar.url)
            
            for i, warn in enumerate(warnings[:10], 1):  # Mostrar apenas os 10 mais recentes
                moderator = interaction.guild.get_member(int(warn['moderator_id']))
                mod_name = moderator.display_name if moderator else "Moderador desconhecido"
                
                embed.add_field(
                    name=f"Aviso #{i}",
                    value=f"**Motivo:** {warn['reason']}\n**Moderador:** {mod_name}\n**Data:** {warn['created_at'][:10]}",
                    inline=False
                )
            
            if len(warnings) > 10:
                embed.set_footer(text=f"Mostrando 10 de {len(warnings)} avisos")
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
        except Exception as e:
            self.logger.error(f"Erro ao obter avisos: {e}")
            await interaction.response.send_message("❌ Erro ao obter avisos!", ephemeral=True)
    
    # Grupo de comandos /clear
    clear_group = app_commands.Group(name="clear", description="Comandos para apagar mensagens")
    
    @clear_group.command(name="quantidade", description="Apaga um número específico de mensagens")
    @app_commands.describe(quantidade="Número de mensagens a apagar (1-100)")
    @app_commands.checks.has_permissions(manage_messages=True)
    @app_commands.checks.bot_has_permissions(manage_messages=True)
    async def clear_quantidade(
        self,
        interaction: discord.Interaction,
        quantidade: app_commands.Range[int, 1, 100]
    ):
        """Apaga mensagens em massa"""
        
        try:
            await interaction.response.defer(ephemeral=True)
            
            deleted = await interaction.channel.purge(limit=quantidade)
            
            embed = EmbedBuilder.success(
                title="🗑️ Mensagens apagadas",
                description=f"**{len(deleted)}** mensagens foram apagadas!"
            )
            embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            
            await interaction.followup.send(embed=embed, ephemeral=True)
            self.logger.info(f"{interaction.user} apagou {len(deleted)} mensagens em {interaction.channel}")
            
        except discord.Forbidden:
            await interaction.followup.send("❌ Não tenho permissões para apagar mensagens!", ephemeral=True)
        except Exception as e:
            self.logger.error(f"Erro ao apagar mensagens: {e}")
            await interaction.followup.send("❌ Erro ao apagar mensagens!", ephemeral=True)
    
    @clear_group.command(name="apartir", description="Apaga mensagens a partir de uma mensagem específica")
    @app_commands.describe(
        mensagem_id="ID da mensagem a partir da qual apagar (clica direito > Copiar ID)",
        limite="Número máximo de mensagens a apagar (1-100)"
    )
    @app_commands.checks.has_permissions(manage_messages=True)
    @app_commands.checks.bot_has_permissions(manage_messages=True)
    async def clear_apartir(
        self,
        interaction: discord.Interaction,
        mensagem_id: str,
        limite: app_commands.Range[int, 1, 100] = 100
    ):
        """Apaga mensagens a partir de uma mensagem específica"""
        
        try:
            await interaction.response.defer(ephemeral=True)
            
            # Converter ID para int
            try:
                msg_id = int(mensagem_id)
            except ValueError:
                await interaction.followup.send("❌ ID de mensagem inválido!", ephemeral=True)
                return
            
            # Buscar mensagem inicial
            try:
                start_message = await interaction.channel.fetch_message(msg_id)
            except discord.NotFound:
                await interaction.followup.send("❌ Mensagem não encontrada neste canal!", ephemeral=True)
                return
            except discord.Forbidden:
                await interaction.followup.send("❌ Não tenho permissão para ver essa mensagem!", ephemeral=True)
                return
            
            # Apagar mensagens após a mensagem especificada (incluindo ela)
            deleted = await interaction.channel.purge(limit=limite, after=start_message.created_at - timedelta(seconds=1))
            
            embed = EmbedBuilder.success(
                title="🗑️ Mensagens apagadas",
                description=f"**{len(deleted)}** mensagens foram apagadas a partir da mensagem especificada!"
            )
            embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            embed.add_field(name="Mensagem inicial", value=f"ID: `{mensagem_id}`", inline=True)
            
            await interaction.followup.send(embed=embed, ephemeral=True)
            self.logger.info(f"{interaction.user} apagou {len(deleted)} mensagens a partir de {mensagem_id} em {interaction.channel}")
            
        except discord.Forbidden:
            await interaction.followup.send("❌ Não tenho permissões para apagar mensagens!", ephemeral=True)
        except Exception as e:
            self.logger.error(f"Erro ao apagar mensagens: {e}")
            await interaction.followup.send(f"❌ Erro ao apagar mensagens: {str(e)}", ephemeral=True)
    
    @clear_group.command(name="intervalo", description="Apaga mensagens entre duas mensagens específicas")
    @app_commands.describe(
        mensagem_inicio="ID da primeira mensagem do intervalo",
        mensagem_fim="ID da última mensagem do intervalo"
    )
    @app_commands.checks.has_permissions(manage_messages=True)
    @app_commands.checks.bot_has_permissions(manage_messages=True)
    async def clear_intervalo(
        self,
        interaction: discord.Interaction,
        mensagem_inicio: str,
        mensagem_fim: str
    ):
        """Apaga mensagens entre duas mensagens específicas"""
        
        try:
            await interaction.response.defer(ephemeral=True)
            
            # Converter IDs para int
            try:
                msg_inicio_id = int(mensagem_inicio)
                msg_fim_id = int(mensagem_fim)
            except ValueError:
                await interaction.followup.send("❌ IDs de mensagem inválidos!", ephemeral=True)
                return
            
            # Verificar qual é a mais antiga
            if msg_inicio_id > msg_fim_id:
                msg_inicio_id, msg_fim_id = msg_fim_id, msg_inicio_id
                mensagem_inicio, mensagem_fim = mensagem_fim, mensagem_inicio
            
            # Buscar mensagens
            try:
                start_message = await interaction.channel.fetch_message(msg_inicio_id)
                end_message = await interaction.channel.fetch_message(msg_fim_id)
            except discord.NotFound:
                await interaction.followup.send("❌ Uma ou ambas mensagens não foram encontradas neste canal!", ephemeral=True)
                return
            except discord.Forbidden:
                await interaction.followup.send("❌ Não tenho permissão para ver essas mensagens!", ephemeral=True)
                return
            
            # Calcular diferença de tempo
            time_diff = (end_message.created_at - start_message.created_at).total_seconds()
            if time_diff > 14 * 24 * 3600:  # 14 dias
                await interaction.followup.send("❌ O intervalo não pode ser maior que 14 dias (limitação do Discord)!", ephemeral=True)
                return
            
            # Apagar mensagens no intervalo
            deleted = await interaction.channel.purge(
                after=start_message.created_at - timedelta(seconds=1),
                before=end_message.created_at + timedelta(seconds=1)
            )
            
            embed = EmbedBuilder.success(
                title="🗑️ Mensagens apagadas",
                description=f"**{len(deleted)}** mensagens foram apagadas no intervalo especificado!"
            )
            embed.add_field(name="Moderador", value=interaction.user.mention, inline=False)
            embed.add_field(name="Início", value=f"ID: `{mensagem_inicio}`", inline=True)
            embed.add_field(name="Fim", value=f"ID: `{mensagem_fim}`", inline=True)
            
            await interaction.followup.send(embed=embed, ephemeral=True)
            self.logger.info(f"{interaction.user} apagou {len(deleted)} mensagens entre {mensagem_inicio} e {mensagem_fim} em {interaction.channel}")
            
        except discord.Forbidden:
            await interaction.followup.send("❌ Não tenho permissões para apagar mensagens!", ephemeral=True)
        except Exception as e:
            self.logger.error(f"Erro ao apagar mensagens: {e}")
            await interaction.followup.send(f"❌ Erro ao apagar mensagens: {str(e)}", ephemeral=True)
    
    @app_commands.command(name="setup_modlogs", description="Configura o canal de logs de moderação")
    @app_commands.describe(canal="Canal para receber logs de moderação")
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_modlogs(
        self,
        interaction: discord.Interaction,
        canal: discord.TextChannel
    ):
        """Configura canal de logs de moderação"""
        try:
            self.config["logs"]["channel_id"] = canal.id
            
            # Salvar config
            os.makedirs("config", exist_ok=True)
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            embed = discord.Embed(
                title="✅ Logs Configurados",
                description=f"Canal de logs definido para {canal.mention}",
                color=discord.Color.green()
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou logs em {canal}")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_wordfilter", description="Configura o filtro de palavras proibidas")
    @app_commands.describe(
        ativar="Ativar ou desativar o filtro",
        acao="Ação ao detectar palavra: warn, timeout, kick, ban"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_wordfilter(
        self,
        interaction: discord.Interaction,
        ativar: bool,
        acao: Optional[str] = "warn"
    ):
        """Configura filtro de palavras proibidas"""
        try:
            self.config["word_filter"]["enabled"] = ativar
            if acao in ["warn", "timeout", "kick", "ban"]:
                self.config["word_filter"]["action"] = acao
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if ativar else "❌ Desativado"
            
            embed = discord.Embed(
                title="🔧 Filtro de Palavras Configurado",
                description=f"**Status:** {status}\n**Ação:** {acao}",
                color=discord.Color.green() if ativar else discord.Color.gray()
            )
            embed.add_field(
                name="ℹ️ Adicionar Palavras",
                value="Use `/addword <palavra>` para adicionar palavras proibidas",
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou filtro: {status}, ação: {acao}")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="addword", description="Adiciona uma palavra à lista de proibidas")
    @app_commands.describe(palavra="Palavra a adicionar à lista")
    @app_commands.checks.has_permissions(administrator=True)
    async def addword(
        self,
        interaction: discord.Interaction,
        palavra: str
    ):
        """Adiciona palavra proibida"""
        try:
            palavra_lower = palavra.lower().strip()
            
            if palavra_lower in self.config["word_filter"]["words"]:
                await interaction.response.send_message("⚠️ Esta palavra já está na lista!", ephemeral=True)
                return
            
            self.config["word_filter"]["words"].append(palavra_lower)
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            embed = discord.Embed(
                title="✅ Palavra Adicionada",
                description=f"A palavra ||{palavra_lower}|| foi adicionada à lista de proibidas.",
                color=discord.Color.green()
            )
            embed.add_field(
                name="Total de Palavras",
                value=str(len(self.config["word_filter"]["words"])),
                inline=True
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} adicionou palavra proibida: {palavra_lower}")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="removeword", description="Remove uma palavra da lista de proibidas")
    @app_commands.describe(palavra="Palavra a remover da lista")
    @app_commands.checks.has_permissions(administrator=True)
    async def removeword(
        self,
        interaction: discord.Interaction,
        palavra: str
    ):
        """Remove palavra proibida"""
        try:
            palavra_lower = palavra.lower().strip()
            
            if palavra_lower not in self.config["word_filter"]["words"]:
                await interaction.response.send_message("⚠️ Esta palavra não está na lista!", ephemeral=True)
                return
            
            self.config["word_filter"]["words"].remove(palavra_lower)
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            embed = discord.Embed(
                title="✅ Palavra Removida",
                description=f"A palavra ||{palavra_lower}|| foi removida da lista.",
                color=discord.Color.green()
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} removeu palavra proibida: {palavra_lower}")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="listwords", description="Lista todas as palavras proibidas")
    @app_commands.checks.has_permissions(manage_messages=True)
    async def listwords(self, interaction: discord.Interaction):
        """Lista palavras proibidas"""
        try:
            words = self.config["word_filter"]["words"]
            
            if not words:
                await interaction.response.send_message("📝 Nenhuma palavra proibida configurada.", ephemeral=True)
                return
            
            embed = discord.Embed(
                title="🚫 Palavras Proibidas",
                description=f"Total: **{len(words)}** palavras",
                color=discord.Color.red()
            )
            
            # Mostrar em chunks de 20
            words_text = "\n".join([f"• ||{word}||" for word in words[:20]])
            embed.add_field(name="Lista", value=words_text, inline=False)
            
            if len(words) > 20:
                embed.set_footer(text=f"Mostrando 20 de {len(words)} palavras")
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_quarantine", description="Configura quarentena para novos membros")
    @app_commands.describe(
        ativar="Ativar ou desativar quarentena",
        role="Role de quarentena",
        duracao_minutos="Duração em minutos (padrão: 10)"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_quarantine(
        self,
        interaction: discord.Interaction,
        ativar: bool,
        role: Optional[discord.Role] = None,
        duracao_minutos: Optional[int] = 10
    ):
        """Configura sistema de quarentena"""
        try:
            self.config["quarantine"]["enabled"] = ativar
            
            if role:
                self.config["quarantine"]["role_id"] = role.id
            
            if duracao_minutos:
                self.config["quarantine"]["duration_minutes"] = duracao_minutos
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if ativar else "❌ Desativado"
            
            embed = discord.Embed(
                title="🔒 Quarentena Configurada",
                description=f"**Status:** {status}",
                color=discord.Color.green() if ativar else discord.Color.gray()
            )
            
            if role:
                embed.add_field(name="Role", value=role.mention, inline=True)
            embed.add_field(name="Duração", value=f"{duracao_minutos} minutos", inline=True)
            embed.add_field(
                name="ℹ️ Funcionamento",
                value="Novos membros recebem a role automaticamente e ela é removida após o tempo configurado.",
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou quarentena: {status}")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="appeal", description="Fazer um pedido de unban (usar em DM)")
    @app_commands.describe(
        servidor_id="ID do servidor onde foste banido",
        motivo="Motivo do pedido de unban"
    )
    async def appeal(
        self,
        interaction: discord.Interaction,
        servidor_id: str,
        motivo: str
    ):
        """Sistema de appeals para bans"""
        try:
            # Verificar se é DM
            if interaction.guild:
                await interaction.response.send_message(
                    "❌ Este comando só pode ser usado em mensagens privadas (DM) com o bot!",
                    ephemeral=True
                )
                return
            
            # Verificar se o servidor existe
            try:
                guild_id = int(servidor_id)
            except ValueError:
                await interaction.response.send_message("❌ ID do servidor inválido!", ephemeral=True)
                return
            
            guild = self.bot.get_guild(guild_id)
            if not guild:
                await interaction.response.send_message("❌ Servidor não encontrado!", ephemeral=True)
                return
            
            # Verificar se appeals está ativado
            if not self.config.get("appeals", {}).get("enabled", False):
                await interaction.response.send_message(
                    "❌ O sistema de appeals não está ativado neste servidor!",
                    ephemeral=True
                )
                return
            
            # Canal de appeals
            appeals_channel_id = self.config.get("appeals", {}).get("channel_id", 0)
            if appeals_channel_id == 0:
                await interaction.response.send_message(
                    "❌ Canal de appeals não configurado!",
                    ephemeral=True
                )
                return
            
            appeals_channel = guild.get_channel(appeals_channel_id)
            if not appeals_channel:
                await interaction.response.send_message(
                    "❌ Canal de appeals não encontrado!",
                    ephemeral=True
                )
                return
            
            # Criar embed do appeal
            embed = discord.Embed(
                title="📨 Novo Pedido de Unban",
                description=f"**Usuário:** {interaction.user}\n**ID:** {interaction.user.id}",
                color=discord.Color.blue(),
                timestamp=datetime.now()
            )
            embed.add_field(name="Motivo do Appeal", value=motivo, inline=False)
            embed.set_thumbnail(url=interaction.user.display_avatar.url)
            embed.set_footer(text="Use /unban para processar este pedido")
            
            await appeals_channel.send(embed=embed)
            
            await interaction.response.send_message(
                "✅ O teu pedido de unban foi enviado para a equipe de moderação!\n"
                "Aguarda uma resposta. Não faças spam de pedidos.",
                ephemeral=True
            )
            
            bot_logger.info(f"{interaction.user} enviou appeal para {guild.name}")
            
        except Exception as e:
            bot_logger.error(f"Erro no appeal: {e}")
            await interaction.response.send_message(f"❌ Erro ao enviar appeal: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_appeals", description="Configura sistema de appeals")
    @app_commands.describe(
        ativar="Ativar ou desativar appeals",
        canal="Canal para receber pedidos de unban"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_appeals(
        self,
        interaction: discord.Interaction,
        ativar: bool,
        canal: Optional[discord.TextChannel] = None
    ):
        """Configura sistema de appeals"""
        try:
            self.config["appeals"]["enabled"] = ativar
            
            if canal:
                self.config["appeals"]["channel_id"] = canal.id
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if ativar else "❌ Desativado"
            
            embed = discord.Embed(
                title="📨 Appeals Configurados",
                description=f"**Status:** {status}",
                color=discord.Color.green() if ativar else discord.Color.gray()
            )
            
            if canal:
                embed.add_field(name="Canal", value=canal.mention, inline=True)
            
            embed.add_field(
                name="ℹ️ Como Usar",
                value=f"Usuários banidos podem usar `/appeal {interaction.guild.id} [motivo]` em DM com o bot",
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou appeals: {status}")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)


async def setup(bot):
    await bot.add_cog(Moderation(bot))
