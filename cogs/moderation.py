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
import aiosqlite

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
        
        # Anti-spam tracking
        self.user_messages = {}  # {user_id: [timestamps]}
        self.spam_warnings = {}  # {user_id: warning_count}
        
        # Anti-raid tracking
        self.recent_joins = []  # [(user_id, timestamp)]
        
        # Auto-slowmode tracking
        self.channel_messages = {}  # {channel_id: [timestamps]}
        self.slowmode_active = {}  # {channel_id: end_timestamp}
        
        # Phishing domains (lista básica - expandir conforme necessário)
        self.phishing_domains = [
            "discordnitro.com", "discord-nitro.com", "discordgift.com",
            "discord-app.com", "discord-give.com", "steamcommunlty.com",
            "steamcommunity.ru", "stearncommunity.com"
        ]
        
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
        bot_logger.info("✅ Sistema de moderação avançado carregado")
    
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
        """Aplicar quarentena a novos membros, monitorar raids e restaurar roles"""
        # Restaurar roles se veio de um unban
        if self.config.get("role_backup", {}).get("enabled", False) and \
           self.config.get("role_backup", {}).get("restore_on_unban", True):
            # Esperar um pouco para garantir que o membro foi totalmente adicionado
            await asyncio.sleep(2)
            restored = await self.restore_user_roles(member.id, member.guild.id)
            if restored:
                embed = discord.Embed(
                    title="♻️ Roles Restaurados",
                    description=f"Roles de {member.mention} foram restaurados após unban",
                    color=discord.Color.green(),
                    timestamp=datetime.now()
                )
                await self.send_mod_log(embed, member.guild)
        
        # Anti-raid check
        if self.config.get("anti_raid", {}).get("enabled", False):
            current_time = datetime.now().timestamp()
            time_window = self.config.get("anti_raid", {}).get("time_window", 60)
            
            # Adicionar join atual
            self.recent_joins.append((member.id, current_time))
            
            # Remover joins antigos
            self.recent_joins = [(uid, t) for uid, t in self.recent_joins 
                                 if current_time - t <= time_window]
            
            # Verificar threshold
            join_threshold = self.config.get("anti_raid", {}).get("join_threshold", 10)
            if len(self.recent_joins) >= join_threshold:
                await self.handle_raid(member.guild)
        
        # Quarentena
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
        """Filtrar palavras proibidas, spam, NSFW, links maliciosos e mention spam"""
        if message.author.bot:
            return
        
        if not isinstance(message.channel, discord.TextChannel):
            return
        
        # Auto-slowmode tracking (antes de outras verificações)
        if self.config.get("auto_slowmode", {}).get("enabled", False):
            await self.track_channel_activity(message)
        
        # Link filter check
        if self.config.get("link_filter", {}).get("enabled", False):
            whitelisted_link = self.config.get("link_filter", {}).get("whitelisted_channels", [])
            if message.channel.id not in whitelisted_link:
                if not message.author.guild_permissions.manage_messages:
                    if await self.check_links(message):
                        return  # Mensagem tratada como link malicioso
        
        # Mention spam check
        if self.config.get("mention_spam", {}).get("enabled", False):
            if not message.author.guild_permissions.manage_messages:
                if await self.check_mention_spam(message):
                    return  # Mensagem tratada como mention spam
        
        # Anti-spam check
        if self.config.get("anti_spam", {}).get("enabled", False):
            whitelisted = self.config.get("anti_spam", {}).get("whitelisted_channels", [])
            if message.channel.id not in whitelisted:
                # Bypass para moderadores
                if not message.author.guild_permissions.manage_messages:
                    if await self.check_spam(message):
                        return  # Mensagem tratada como spam
        
        # NSFW detection
        if self.config.get("nsfw_detection", {}).get("enabled", False) and message.attachments:
            whitelisted_nsfw = self.config.get("nsfw_detection", {}).get("whitelisted_channels", [])
            if message.channel.id not in whitelisted_nsfw:
                # Bypass para moderadores
                if not message.author.guild_permissions.manage_messages:
                    await self.check_nsfw(message)
        
        # Word filter
        if not self.config.get("word_filter", {}).get("enabled", False):
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
    
    async def handle_raid(self, guild: discord.Guild):
        """Lidar com raid detectado"""
        action = self.config.get("anti_raid", {}).get("action", "kick")
        
        # Log do raid
        embed = discord.Embed(
            title="🚨 RAID DETECTADO",
            description=f"**Joins suspeitos:** {len(self.recent_joins)} membros em pouco tempo",
            color=discord.Color.red(),
            timestamp=datetime.now()
        )
        
        joins_info = "\n".join([f"<@{uid}> - <t:{int(t)}:R>" for uid, t in self.recent_joins[-10:]])
        embed.add_field(name="Últimos Joins", value=joins_info or "Nenhum", inline=False)
        embed.add_field(name="Ação", value=action.upper(), inline=True)
        
        await self.send_mod_log(embed, guild)
        
        # Executar ação nos raiders
        if action == "kick":
            for user_id, _ in self.recent_joins:
                member = guild.get_member(user_id)
                if member:
                    try:
                        await member.kick(reason="Anti-raid automático")
                    except:
                        pass
        
        # Limpar lista
        self.recent_joins.clear()
        
        bot_logger.warning(f"Raid detectado em {guild.name} - Ação: {action}")
    
    async def check_spam(self, message: discord.Message) -> bool:
        """Verificar se mensagem é spam"""
        user_id = message.author.id
        current_time = datetime.now().timestamp()
        
        # Inicializar tracking
        if user_id not in self.user_messages:
            self.user_messages[user_id] = []
        
        # Adicionar mensagem atual
        self.user_messages[user_id].append({
            "time": current_time,
            "content": message.content
        })
        
        # Remover mensagens antigas
        time_window = self.config.get("anti_spam", {}).get("time_window", 5)
        self.user_messages[user_id] = [
            msg for msg in self.user_messages[user_id]
            if current_time - msg["time"] <= time_window
        ]
        
        # Verificar threshold de mensagens
        message_threshold = self.config.get("anti_spam", {}).get("message_threshold", 5)
        recent_msgs = self.user_messages[user_id]
        
        if len(recent_msgs) >= message_threshold:
            await self.handle_spam(message, "Muitas mensagens em pouco tempo")
            return True
        
        # Verificar mensagens duplicadas
        duplicate_threshold = self.config.get("anti_spam", {}).get("duplicate_threshold", 3)
        if len(recent_msgs) >= duplicate_threshold:
            last_contents = [msg["content"] for msg in recent_msgs[-duplicate_threshold:]]
            if len(set(last_contents)) == 1 and last_contents[0]:  # Todas iguais
                await self.handle_spam(message, "Spam de mensagens idênticas")
                return True
        
        return False
    
    async def handle_spam(self, message: discord.Message, reason: str):
        """Lidar com spam detectado"""
        action = self.config.get("anti_spam", {}).get("action", "timeout")
        
        # Deletar mensagens recentes do spammer
        try:
            user_id = message.author.id
            if user_id in self.user_messages:
                # Tentar deletar mensagens recentes
                async for msg in message.channel.history(limit=50):
                    if msg.author.id == user_id and (datetime.now().timestamp() - msg.created_at.timestamp()) < 10:
                        try:
                            await msg.delete()
                        except:
                            pass
                
                # Limpar tracking
                self.user_messages[user_id] = []
        except:
            pass
        
        # Executar ação
        member = message.author
        if action == "warn":
            # Inicializar warnings
            if member.id not in self.spam_warnings:
                self.spam_warnings[member.id] = 0
            
            self.spam_warnings[member.id] += 1
            
            try:
                await message.channel.send(
                    f"⚠️ {member.mention} **AVISO DE SPAM** ({self.spam_warnings[member.id]}/3)\n"
                    f"**Motivo:** {reason}\n"
                    f"Continuar resultará em timeout!",
                    delete_after=10
                )
            except:
                pass
        
        elif action == "timeout":
            duration = self.config.get("anti_spam", {}).get("timeout_duration", 300)
            try:
                await member.timeout(
                    datetime.now() + timedelta(seconds=duration),
                    reason=f"Anti-spam: {reason}"
                )
            except:
                pass
        
        elif action == "kick":
            try:
                await member.kick(reason=f"Anti-spam: {reason}")
            except:
                pass
        
        # Log
        embed = discord.Embed(
            title="🚫 Spam Detectado",
            description=f"**Usuário:** {member.mention}\n**Motivo:** {reason}",
            color=discord.Color.red(),
            timestamp=datetime.now()
        )
        embed.add_field(name="Ação", value=action.upper(), inline=True)
        embed.add_field(name="Canal", value=message.channel.mention, inline=True)
        embed.set_thumbnail(url=member.display_avatar.url)
        
        await self.send_mod_log(embed, message.guild)
        
        bot_logger.warning(f"Spam detectado: {member} em {message.channel} - {reason}")
    
    async def check_nsfw(self, message: discord.Message):
        """Verificar se imagem é NSFW usando DeepAI"""
        api_key = self.config.get("nsfw_detection", {}).get("api_key", "")
        
        if not api_key:
            return
        
        confidence_threshold = self.config.get("nsfw_detection", {}).get("confidence_threshold", 0.7)
        
        for attachment in message.attachments:
            # Verificar se é imagem
            if not any(attachment.filename.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp']):
                continue
            
            try:
                import aiohttp
                
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        'https://api.deepai.org/api/nsfw-detector',
                        data={'image': attachment.url},
                        headers={'api-key': api_key}
                    ) as resp:
                        if resp.status == 200:
                            result = await resp.json()
                            nsfw_score = result.get('output', {}).get('nsfw_score', 0)
                            
                            if nsfw_score >= confidence_threshold:
                                await self.handle_nsfw(message, nsfw_score)
                                return
            
            except Exception as e:
                bot_logger.error(f"Erro ao verificar NSFW: {e}")
    
    async def handle_nsfw(self, message: discord.Message, score: float):
        """Lidar com conteúdo NSFW detectado"""
        action = self.config.get("nsfw_detection", {}).get("action", "delete")
        
        # Deletar mensagem
        if action in ["delete", "warn", "timeout", "kick"]:
            try:
                await message.delete()
            except:
                pass
        
        member = message.author
        
        # Ações adicionais
        if action == "warn":
            try:
                await message.channel.send(
                    f"⚠️ {member.mention} Conteúdo NSFW não é permitido neste canal!",
                    delete_after=10
                )
            except:
                pass
        
        elif action == "timeout":
            try:
                await member.timeout(
                    datetime.now() + timedelta(minutes=30),
                    reason=f"Envio de conteúdo NSFW (confiança: {score:.2%})"
                )
            except:
                pass
        
        elif action == "kick":
            try:
                await member.kick(reason=f"Envio de conteúdo NSFW (confiança: {score:.2%})")
            except:
                pass
        
        # Log
        embed = discord.Embed(
            title="🔞 Conteúdo NSFW Detectado",
            description=f"**Usuário:** {member.mention}",
            color=discord.Color.red(),
            timestamp=datetime.now()
        )
        embed.add_field(name="Confiança", value=f"{score:.2%}", inline=True)
        embed.add_field(name="Canal", value=message.channel.mention, inline=True)
        embed.add_field(name="Ação", value=action.upper(), inline=True)
        embed.set_thumbnail(url=member.display_avatar.url)
        
        await self.send_mod_log(embed, message.guild)
        
        bot_logger.warning(f"NSFW detectado: {member} em {message.channel} - Score: {score:.2%}")
    
    async def check_links(self, message: discord.Message) -> bool:
        """Verificar se mensagem contém links maliciosos ou proibidos"""
        import re
        
        # Regex para detectar URLs
        url_pattern = r'https?://[^\s]+'
        urls = re.findall(url_pattern, message.content.lower())
        
        if not urls:
            return False
        
        config = self.config.get("link_filter", {})
        block_invites = config.get("block_invites", True)
        block_phishing = config.get("block_phishing", True)
        whitelist = config.get("whitelist", [])
        blacklist = config.get("blacklist", [])
        
        for url in urls:
            # Verificar whitelist primeiro
            if any(domain in url for domain in whitelist):
                continue
            
            # Verificar blacklist
            if any(domain in url for domain in blacklist):
                await self.handle_malicious_link(message, url, "Domínio na lista negra")
                return True
            
            # Verificar convites do Discord
            if block_invites and ('discord.gg/' in url or 'discord.com/invite/' in url):
                await self.handle_malicious_link(message, url, "Convite do Discord não autorizado")
                return True
            
            # Verificar domínios de phishing conhecidos
            if block_phishing:
                if any(phishing_domain in url for phishing_domain in self.phishing_domains):
                    await self.handle_malicious_link(message, url, "Domínio de phishing detectado")
                    return True
        
        return False
    
    async def handle_malicious_link(self, message: discord.Message, url: str, reason: str):
        """Lidar com links maliciosos"""
        action = self.config.get("link_filter", {}).get("action", "delete")
        
        # Deletar mensagem
        try:
            await message.delete()
        except:
            pass
        
        member = message.author
        
        # Log
        embed = discord.Embed(
            title="🔗 Link Malicioso Detectado",
            description=f"**Usuário:** {member.mention}\n**Razão:** {reason}",
            color=discord.Color.red(),
            timestamp=datetime.now()
        )
        embed.add_field(name="URL", value=f"||{url}||", inline=False)
        embed.add_field(name="Canal", value=message.channel.mention, inline=True)
        embed.add_field(name="Ação", value=action.upper(), inline=True)
        embed.set_thumbnail(url=member.display_avatar.url)
        
        await self.send_mod_log(embed, message.guild)
        
        # Aplicar ação
        if action == "warn":
            try:
                await message.channel.send(
                    f"⚠️ {member.mention} Links desse tipo não são permitidos!",
                    delete_after=10
                )
            except:
                pass
        
        elif action == "timeout":
            try:
                await member.timeout(
                    timedelta(minutes=10),
                    reason=f"Link malicioso: {reason}"
                )
            except:
                pass
        
        elif action == "kick":
            try:
                await member.kick(reason=f"Link malicioso: {reason}")
            except:
                pass
        
        # Adicionar strike se sistema estiver ativo
        if self.config.get("strikes_system", {}).get("enabled", False):
            await self.add_strike(member.id, member.guild.id, self.bot.user.id, f"Link malicioso: {reason}")
        
        bot_logger.warning(f"Link malicioso detectado: {member} em {message.channel} - {reason}")
    
    async def check_mention_spam(self, message: discord.Message) -> bool:
        """Verificar se mensagem contém spam de menções"""
        config = self.config.get("mention_spam", {})
        max_mentions = config.get("max_mentions", 5)
        max_role_mentions = config.get("max_role_mentions", 2)
        
        # Contar menções de usuários
        user_mentions = len(message.mentions)
        
        # Contar menções de roles
        role_mentions = len(message.role_mentions)
        
        # Verificar @everyone ou @here
        has_everyone = message.mention_everyone
        
        # Verificar limites
        if user_mentions > max_mentions or role_mentions > max_role_mentions or has_everyone:
            await self.handle_mention_spam(message, user_mentions, role_mentions, has_everyone)
            return True
        
        return False
    
    async def handle_mention_spam(self, message: discord.Message, user_mentions: int, role_mentions: int, has_everyone: bool):
        """Lidar com spam de menções"""
        action = self.config.get("mention_spam", {}).get("action", "timeout")
        timeout_duration = self.config.get("mention_spam", {}).get("timeout_duration", 600)
        
        # Deletar mensagem
        try:
            await message.delete()
        except:
            pass
        
        member = message.author
        
        # Construir descrição da violação
        violations = []
        if user_mentions > self.config.get("mention_spam", {}).get("max_mentions", 5):
            violations.append(f"Menções de usuários: {user_mentions}")
        if role_mentions > self.config.get("mention_spam", {}).get("max_role_mentions", 2):
            violations.append(f"Menções de roles: {role_mentions}")
        if has_everyone:
            violations.append("Uso de @everyone/@here")
        
        # Log
        embed = discord.Embed(
            title="📢 Spam de Menções Detectado",
            description=f"**Usuário:** {member.mention}\n**Violações:** {', '.join(violations)}",
            color=discord.Color.orange(),
            timestamp=datetime.now()
        )
        embed.add_field(name="Canal", value=message.channel.mention, inline=True)
        embed.add_field(name="Ação", value=action.upper(), inline=True)
        embed.set_thumbnail(url=member.display_avatar.url)
        
        await self.send_mod_log(embed, message.guild)
        
        # Aplicar ação
        if action == "warn":
            try:
                await message.channel.send(
                    f"⚠️ {member.mention} Não faças spam de menções!",
                    delete_after=10
                )
            except:
                pass
        
        elif action == "timeout":
            try:
                await member.timeout(
                    timedelta(seconds=timeout_duration),
                    reason="Spam de menções"
                )
                await message.channel.send(
                    f"🔇 {member.mention} recebeu timeout por spam de menções!",
                    delete_after=10
                )
            except:
                pass
        
        elif action == "kick":
            try:
                await member.kick(reason="Spam de menções")
            except:
                pass
        
        # Adicionar strike se sistema estiver ativo
        if self.config.get("strikes_system", {}).get("enabled", False):
            await self.add_strike(member.id, member.guild.id, self.bot.user.id, "Spam de menções")
        
        bot_logger.warning(f"Spam de menções: {member} em {message.channel}")
    
    async def track_channel_activity(self, message: discord.Message):
        """Rastrear atividade do canal para auto-slowmode"""
        channel_id = message.channel.id
        current_time = datetime.now().timestamp()
        
        # Verificar se slowmode já está ativo
        if channel_id in self.slowmode_active:
            if current_time < self.slowmode_active[channel_id]:
                return  # Slowmode ainda ativo
            else:
                # Remover slowmode expirado
                del self.slowmode_active[channel_id]
                try:
                    await message.channel.edit(slowmode_delay=0, reason="Auto-slowmode expirado")
                    bot_logger.info(f"Auto-slowmode removido de #{message.channel.name}")
                except:
                    pass
        
        # Inicializar tracking
        if channel_id not in self.channel_messages:
            self.channel_messages[channel_id] = []
        
        # Adicionar mensagem atual
        self.channel_messages[channel_id].append(current_time)
        
        # Remover mensagens antigas
        trigger_window = self.config.get("auto_slowmode", {}).get("trigger_window", 10)
        self.channel_messages[channel_id] = [
            t for t in self.channel_messages[channel_id]
            if current_time - t <= trigger_window
        ]
        
        # Verificar se deve ativar slowmode
        trigger_threshold = self.config.get("auto_slowmode", {}).get("trigger_threshold", 20)
        
        if len(self.channel_messages[channel_id]) >= trigger_threshold:
            await self.activate_slowmode(message.channel)
    
    async def activate_slowmode(self, channel: discord.TextChannel):
        """Ativar slowmode automático em um canal"""
        slowmode_duration = self.config.get("auto_slowmode", {}).get("slowmode_duration", 10)
        slowmode_time = self.config.get("auto_slowmode", {}).get("slowmode_time", 300)
        
        try:
            await channel.edit(slowmode_delay=slowmode_duration, reason="Auto-slowmode ativado devido a atividade alta")
            
            # Marcar como ativo
            self.slowmode_active[channel.id] = datetime.now().timestamp() + slowmode_time
            
            # Limpar tracking
            self.channel_messages[channel.id] = []
            
            # Notificar no canal
            embed = discord.Embed(
                title="⏱️ Slowmode Automático Ativado",
                description=f"Devido à alta atividade, slowmode de **{slowmode_duration}s** foi ativado por **{slowmode_time // 60} minutos**.",
                color=discord.Color.blue()
            )
            await channel.send(embed=embed, delete_after=30)
            
            bot_logger.info(f"Auto-slowmode ativado em #{channel.name} ({slowmode_duration}s por {slowmode_time}s)")
        except Exception as e:
            bot_logger.error(f"Erro ao ativar auto-slowmode: {e}")
    
    async def add_strike(self, user_id: int, guild_id: int, moderator_id: int, reason: str):
        """Adicionar strike a um usuário"""
        async with aiosqlite.connect(self.bot.db_path) as db:
            # Verificar strikes ativos
            async with db.execute(
                "SELECT strike_count FROM moderation_strikes WHERE user_id = ? AND guild_id = ? AND is_active = 1",
                (user_id, guild_id)
            ) as cursor:
                row = await cursor.fetchone()
                current_strikes = row[0] if row else 0
            
            new_strike_count = current_strikes + 1
            
            # Calcular data de expiração
            expiry_days = self.config.get("strikes_system", {}).get("strike_expiry_days", 30)
            expires_at = datetime.now() + timedelta(days=expiry_days)
            
            # Adicionar strike
            await db.execute(
                """INSERT INTO moderation_strikes 
                   (user_id, guild_id, moderator_id, reason, strike_count, expires_at, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, 1)""",
                (user_id, guild_id, moderator_id, reason, new_strike_count, expires_at)
            )
            await db.commit()
            
            bot_logger.info(f"Strike adicionado: User {user_id} em Guild {guild_id} - Strike {new_strike_count}/3 - Razão: {reason}")
            
            # Verificar se precisa aplicar ação automática
            await self.check_strike_action(user_id, guild_id, new_strike_count)
    
    async def check_strike_action(self, user_id: int, guild_id: int, strike_count: int):
        """Verificar e aplicar ação baseada no número de strikes"""
        strikes_to_ban = self.config.get("strikes_system", {}).get("strikes_to_ban", 3)
        progressive_actions = self.config.get("strikes_system", {}).get("progressive_actions", {})
        
        guild = self.bot.get_guild(guild_id)
        if not guild:
            return
        
        member = guild.get_member(user_id)
        if not member:
            return
        
        # Ação baseada em strikes
        if strike_count >= strikes_to_ban:
            # Ban automático
            try:
                await member.ban(reason=f"Atingiu {strikes_to_ban} strikes")
                
                embed = discord.Embed(
                    title="🔨 Ban Automático por Strikes",
                    description=f"**Usuário:** {member.mention}\n**Strikes:** {strike_count}/{strikes_to_ban}",
                    color=discord.Color.dark_red(),
                    timestamp=datetime.now()
                )
                await self.send_mod_log(embed, guild)
                
                bot_logger.warning(f"Ban automático: {member} ({strike_count} strikes)")
            except Exception as e:
                bot_logger.error(f"Erro ao banir usuário por strikes: {e}")
        
        elif strike_count == 2 and progressive_actions.get("strike_2") == "timeout":
            # Timeout no segundo strike
            try:
                await member.timeout(timedelta(hours=24), reason="2º strike - timeout de 24h")
                
                embed = discord.Embed(
                    title="⏱️ Timeout Automático (Strike 2)",
                    description=f"**Usuário:** {member.mention}\n**Duração:** 24 horas",
                    color=discord.Color.orange(),
                    timestamp=datetime.now()
                )
                await self.send_mod_log(embed, guild)
                
                bot_logger.info(f"Timeout automático (2º strike): {member}")
            except Exception as e:
                bot_logger.error(f"Erro ao aplicar timeout: {e}")
        
        elif strike_count == 1 and progressive_actions.get("strike_1") == "warn":
            # Aviso no primeiro strike
            try:
                dm_embed = discord.Embed(
                    title="⚠️ Primeiro Strike Recebido",
                    description=f"Recebeste o teu primeiro strike em **{guild.name}**.",
                    color=discord.Color.gold()
                )
                dm_embed.add_field(
                    name="⚠️ Atenção",
                    value=f"Com {strikes_to_ban} strikes serás automaticamente banido!",
                    inline=False
                )
                await member.send(embed=dm_embed)
            except:
                pass
    
    async def get_active_strikes(self, user_id: int, guild_id: int) -> int:
        """Obter número de strikes ativos de um usuário"""
        async with aiosqlite.connect(self.bot.db_path) as db:
            # Expirar strikes antigos primeiro
            await db.execute(
                "UPDATE moderation_strikes SET is_active = 0 WHERE expires_at < ? AND is_active = 1",
                (datetime.now(),)
            )
            await db.commit()
            
            # Contar strikes ativos
            async with db.execute(
                "SELECT strike_count FROM moderation_strikes WHERE user_id = ? AND guild_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
                (user_id, guild_id)
            ) as cursor:
                row = await cursor.fetchone()
                return row[0] if row else 0
    
    async def backup_user_roles(self, user_id: int, guild_id: int, role_ids: list, reason: str = "Ban"):
        """Fazer backup dos roles de um usuário antes do ban"""
        async with aiosqlite.connect(self.bot.db_path) as db:
            import json
            
            await db.execute(
                """INSERT INTO role_backups (user_id, guild_id, role_ids, reason)
                   VALUES (?, ?, ?, ?)""",
                (user_id, guild_id, json.dumps(role_ids), reason)
            )
            await db.commit()
            
            bot_logger.info(f"Backup de roles criado para User {user_id} em Guild {guild_id} - {len(role_ids)} roles")
    
    async def restore_user_roles(self, user_id: int, guild_id: int) -> bool:
        """Restaurar roles de um usuário após unban"""
        async with aiosqlite.connect(self.bot.db_path) as db:
            import json
            
            async with db.execute(
                "SELECT role_ids FROM role_backups WHERE user_id = ? AND guild_id = ? ORDER BY backed_up_at DESC LIMIT 1",
                (user_id, guild_id)
            ) as cursor:
                row = await cursor.fetchone()
                
                if not row:
                    return False
                
                role_ids = json.loads(row[0])
                
                guild = self.bot.get_guild(guild_id)
                if not guild:
                    return False
                
                member = guild.get_member(user_id)
                if not member:
                    return False
                
                # Restaurar roles
                restored = 0
                for role_id in role_ids:
                    role = guild.get_role(role_id)
                    if role and role < guild.me.top_role:  # Verificar hierarquia
                        try:
                            await member.add_roles(role, reason="Restauração após unban")
                            restored += 1
                        except:
                            pass
                
                bot_logger.info(f"Roles restaurados: {restored}/{len(role_ids)} para User {user_id} em Guild {guild_id}")
                return True
    
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
            # Backup de roles se o sistema estiver ativo
            if self.config.get("role_backup", {}).get("enabled", False):
                role_ids = [role.id for role in membro.roles if role != interaction.guild.default_role]
                if role_ids:
                    await self.backup_user_roles(membro.id, interaction.guild.id, role_ids, f"Ban por: {motivo}")
            
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
            
            # Restaurar roles se o sistema estiver ativo e o unban permitir
            roles_restored = False
            if self.config.get("role_backup", {}).get("enabled", False) and \
               self.config.get("role_backup", {}).get("restore_on_unban", True):
                # Esperar um pouco para o usuário re-entrar
                await interaction.response.send_message(
                    f"✅ **{user}** foi desbanido! Se o utilizador voltar ao servidor, os roles serão restaurados automaticamente.",
                    ephemeral=True
                )
                # A restauração será feita no on_member_join
                return
            
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
    
    @app_commands.command(name="setup_antispam", description="Configurar anti-spam")
    @app_commands.describe(
        ativar="Ativar ou desativar anti-spam",
        canal="Canal para adicionar/remover da whitelist",
        acao="Adicionar ou remover canal da whitelist"
    )
    @app_commands.choices(acao=[
        app_commands.Choice(name="Adicionar", value="add"),
        app_commands.Choice(name="Remover", value="remove"),
        app_commands.Choice(name="Listar", value="list")
    ])
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_antispam(
        self,
        interaction: discord.Interaction,
        ativar: Optional[bool] = None,
        canal: Optional[discord.TextChannel] = None,
        acao: Optional[str] = None
    ):
        """Configurar sistema anti-spam"""
        try:
            if ativar is not None:
                self.config["anti_spam"]["enabled"] = ativar
            
            whitelisted = self.config.get("anti_spam", {}).get("whitelisted_channels", [])
            
            if acao and canal:
                if acao == "add":
                    if canal.id not in whitelisted:
                        whitelisted.append(canal.id)
                        self.config["anti_spam"]["whitelisted_channels"] = whitelisted
                        action_msg = f"✅ {canal.mention} adicionado à whitelist"
                    else:
                        action_msg = f"ℹ️ {canal.mention} já está na whitelist"
                
                elif acao == "remove":
                    if canal.id in whitelisted:
                        whitelisted.remove(canal.id)
                        self.config["anti_spam"]["whitelisted_channels"] = whitelisted
                        action_msg = f"✅ {canal.mention} removido da whitelist"
                    else:
                        action_msg = f"ℹ️ {canal.mention} não está na whitelist"
            
            elif acao == "list":
                if whitelisted:
                    channels_list = "\n".join([f"<#{cid}>" for cid in whitelisted])
                    action_msg = f"**Canais na whitelist:**\n{channels_list}"
                else:
                    action_msg = "Nenhum canal na whitelist"
            else:
                action_msg = ""
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if self.config["anti_spam"]["enabled"] else "❌ Desativado"
            
            embed = discord.Embed(
                title="🚫 Anti-Spam Configurado",
                description=f"**Status:** {status}",
                color=discord.Color.green() if self.config["anti_spam"]["enabled"] else discord.Color.gray()
            )
            
            if action_msg:
                embed.add_field(name="Ação", value=action_msg, inline=False)
            
            # Configurações atuais
            config = self.config["anti_spam"]
            embed.add_field(name="Limite de Mensagens", value=f"{config['message_threshold']} msgs", inline=True)
            embed.add_field(name="Intervalo", value=f"{config['time_window']}s", inline=True)
            embed.add_field(name="Duplicadas", value=f"{config['duplicate_threshold']} msgs", inline=True)
            embed.add_field(name="Ação", value=config['action'].upper(), inline=True)
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou anti-spam")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_antiraid", description="Configurar anti-raid")
    @app_commands.describe(
        ativar="Ativar ou desativar anti-raid",
        threshold="Número de joins para considerar raid",
        intervalo="Intervalo de tempo em segundos"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_antiraid(
        self,
        interaction: discord.Interaction,
        ativar: Optional[bool] = None,
        threshold: Optional[int] = None,
        intervalo: Optional[int] = None
    ):
        """Configurar sistema anti-raid"""
        try:
            if ativar is not None:
                self.config["anti_raid"]["enabled"] = ativar
            
            if threshold is not None:
                self.config["anti_raid"]["join_threshold"] = threshold
            
            if intervalo is not None:
                self.config["anti_raid"]["time_window"] = intervalo
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if self.config["anti_raid"]["enabled"] else "❌ Desativado"
            
            embed = discord.Embed(
                title="🚨 Anti-Raid Configurado",
                description=f"**Status:** {status}",
                color=discord.Color.green() if self.config["anti_raid"]["enabled"] else discord.Color.gray()
            )
            
            # Configurações atuais
            config = self.config["anti_raid"]
            embed.add_field(name="Threshold", value=f"{config['join_threshold']} joins", inline=True)
            embed.add_field(name="Intervalo", value=f"{config['time_window']}s", inline=True)
            embed.add_field(name="Ação", value=config['action'].upper(), inline=True)
            
            embed.add_field(
                name="ℹ️ Como Funciona",
                value=f"Se {config['join_threshold']} membros entrarem em {config['time_window']}s, "
                      f"o bot irá executar ação: **{config['action']}**",
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou anti-raid")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_nsfw", description="Configurar detecção de NSFW")
    @app_commands.describe(
        ativar="Ativar ou desativar detecção NSFW",
        canal="Canal para adicionar/remover da whitelist (permitir NSFW)",
        acao="Adicionar ou remover canal da whitelist",
        api_key="DeepAI API key (necessária para detecção)"
    )
    @app_commands.choices(acao=[
        app_commands.Choice(name="Adicionar", value="add"),
        app_commands.Choice(name="Remover", value="remove"),
        app_commands.Choice(name="Listar", value="list")
    ])
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_nsfw(
        self,
        interaction: discord.Interaction,
        ativar: Optional[bool] = None,
        canal: Optional[discord.TextChannel] = None,
        acao: Optional[str] = None,
        api_key: Optional[str] = None
    ):
        """Configurar detecção de conteúdo NSFW"""
        try:
            if ativar is not None:
                self.config["nsfw_detection"]["enabled"] = ativar
            
            if api_key:
                self.config["nsfw_detection"]["api_key"] = api_key
            
            whitelisted = self.config.get("nsfw_detection", {}).get("whitelisted_channels", [])
            
            if acao and canal:
                if acao == "add":
                    if canal.id not in whitelisted:
                        whitelisted.append(canal.id)
                        self.config["nsfw_detection"]["whitelisted_channels"] = whitelisted
                        action_msg = f"✅ {canal.mention} adicionado à whitelist (NSFW permitido)"
                    else:
                        action_msg = f"ℹ️ {canal.mention} já está na whitelist"
                
                elif acao == "remove":
                    if canal.id in whitelisted:
                        whitelisted.remove(canal.id)
                        self.config["nsfw_detection"]["whitelisted_channels"] = whitelisted
                        action_msg = f"✅ {canal.mention} removido da whitelist"
                    else:
                        action_msg = f"ℹ️ {canal.mention} não está na whitelist"
            
            elif acao == "list":
                if whitelisted:
                    channels_list = "\n".join([f"<#{cid}>" for cid in whitelisted])
                    action_msg = f"**Canais com NSFW permitido:**\n{channels_list}"
                else:
                    action_msg = "Nenhum canal na whitelist"
            else:
                action_msg = ""
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if self.config["nsfw_detection"]["enabled"] else "❌ Desativado"
            has_key = "✅ Configurada" if self.config["nsfw_detection"]["api_key"] else "❌ Não configurada"
            
            embed = discord.Embed(
                title="🔞 Detecção NSFW Configurada",
                description=f"**Status:** {status}\n**API Key:** {has_key}",
                color=discord.Color.green() if self.config["nsfw_detection"]["enabled"] else discord.Color.gray()
            )
            
            if action_msg:
                embed.add_field(name="Ação", value=action_msg, inline=False)
            
            # Configurações atuais
            config = self.config["nsfw_detection"]
            embed.add_field(name="Confiança Mínima", value=f"{config['confidence_threshold']:.0%}", inline=True)
            embed.add_field(name="Ação", value=config['action'].upper(), inline=True)
            
            if not config["api_key"]:
                embed.add_field(
                    name="⚠️ API Key Necessária",
                    value="Obter em: https://deepai.org/\n"
                          "Use: `/setup_nsfw api_key:SUA_KEY`",
                    inline=False
                )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou NSFW detection")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
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
    
    @app_commands.command(name="setup_linkfilter", description="Configurar filtro de links")
    @app_commands.describe(
        ativar="Ativar ou desativar filtro de links",
        bloquear_convites="Bloquear convites do Discord",
        bloquear_phishing="Bloquear domínios de phishing",
        canal="Canal para adicionar/remover da whitelist",
        acao_canal="Adicionar ou remover canal"
    )
    @app_commands.choices(acao_canal=[
        app_commands.Choice(name="Adicionar", value="add"),
        app_commands.Choice(name="Remover", value="remove")
    ])
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_linkfilter(
        self,
        interaction: discord.Interaction,
        ativar: Optional[bool] = None,
        bloquear_convites: Optional[bool] = None,
        bloquear_phishing: Optional[bool] = None,
        canal: Optional[discord.TextChannel] = None,
        acao_canal: Optional[str] = None
    ):
        """Configurar filtro de links maliciosos"""
        try:
            if ativar is not None:
                self.config["link_filter"]["enabled"] = ativar
            
            if bloquear_convites is not None:
                self.config["link_filter"]["block_invites"] = bloquear_convites
            
            if bloquear_phishing is not None:
                self.config["link_filter"]["block_phishing"] = bloquear_phishing
            
            if canal and acao_canal:
                whitelisted = self.config["link_filter"].get("whitelisted_channels", [])
                if acao_canal == "add" and canal.id not in whitelisted:
                    whitelisted.append(canal.id)
                elif acao_canal == "remove" and canal.id in whitelisted:
                    whitelisted.remove(canal.id)
                self.config["link_filter"]["whitelisted_channels"] = whitelisted
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if self.config["link_filter"]["enabled"] else "❌ Desativado"
            
            embed = discord.Embed(
                title="🔗 Filtro de Links Configurado",
                description=f"**Status:** {status}",
                color=discord.Color.green() if self.config["link_filter"]["enabled"] else discord.Color.gray()
            )
            
            config = self.config["link_filter"]
            embed.add_field(name="Bloquear Convites", value="✅" if config["block_invites"] else "❌", inline=True)
            embed.add_field(name="Bloquear Phishing", value="✅" if config["block_phishing"] else "❌", inline=True)
            embed.add_field(name="Ação", value=config["action"].upper(), inline=True)
            
            whitelisted_count = len(config.get("whitelisted_channels", []))
            embed.add_field(name="Canais Whitelisted", value=str(whitelisted_count), inline=True)
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou filtro de links")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_strikes", description="Configurar sistema de strikes")
    @app_commands.describe(
        ativar="Ativar ou desativar sistema de strikes",
        strikes_ban="Número de strikes para ban automático",
        dias_expiracao="Dias até strikes expirarem"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_strikes(
        self,
        interaction: discord.Interaction,
        ativar: Optional[bool] = None,
        strikes_ban: Optional[int] = None,
        dias_expiracao: Optional[int] = None
    ):
        """Configurar sistema de strikes"""
        try:
            if ativar is not None:
                self.config["strikes_system"]["enabled"] = ativar
            
            if strikes_ban is not None:
                self.config["strikes_system"]["strikes_to_ban"] = strikes_ban
            
            if dias_expiracao is not None:
                self.config["strikes_system"]["strike_expiry_days"] = dias_expiracao
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if self.config["strikes_system"]["enabled"] else "❌ Desativado"
            
            embed = discord.Embed(
                title="⚠️ Sistema de Strikes Configurado",
                description=f"**Status:** {status}",
                color=discord.Color.green() if self.config["strikes_system"]["enabled"] else discord.Color.gray()
            )
            
            config = self.config["strikes_system"]
            embed.add_field(name="Strikes para Ban", value=str(config["strikes_to_ban"]), inline=True)
            embed.add_field(name="Expiração", value=f"{config['strike_expiry_days']} dias", inline=True)
            
            embed.add_field(
                name="ℹ️ Ações Progressivas",
                value=f"**Strike 1:** {config['progressive_actions']['strike_1']}\n"
                      f"**Strike 2:** {config['progressive_actions']['strike_2']}\n"
                      f"**Strike 3:** Ban automático",
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou sistema de strikes")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_mentionspam", description="Configurar proteção contra spam de menções")
    @app_commands.describe(
        ativar="Ativar ou desativar proteção",
        max_mencoes="Máximo de menções de usuários",
        max_mencoes_roles="Máximo de menções de roles"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_mentionspam(
        self,
        interaction: discord.Interaction,
        ativar: Optional[bool] = None,
        max_mencoes: Optional[int] = None,
        max_mencoes_roles: Optional[int] = None
    ):
        """Configurar proteção contra spam de menções"""
        try:
            if ativar is not None:
                self.config["mention_spam"]["enabled"] = ativar
            
            if max_mencoes is not None:
                self.config["mention_spam"]["max_mentions"] = max_mencoes
            
            if max_mencoes_roles is not None:
                self.config["mention_spam"]["max_role_mentions"] = max_mencoes_roles
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if self.config["mention_spam"]["enabled"] else "❌ Desativado"
            
            embed = discord.Embed(
                title="📢 Proteção Mention Spam Configurada",
                description=f"**Status:** {status}",
                color=discord.Color.green() if self.config["mention_spam"]["enabled"] else discord.Color.gray()
            )
            
            config = self.config["mention_spam"]
            embed.add_field(name="Máx. Menções Usuários", value=str(config["max_mentions"]), inline=True)
            embed.add_field(name="Máx. Menções Roles", value=str(config["max_role_mentions"]), inline=True)
            embed.add_field(name="Ação", value=config["action"].upper(), inline=True)
            embed.add_field(name="Timeout", value=f"{config['timeout_duration']}s", inline=True)
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou proteção mention spam")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_slowmode", description="Configurar auto-slowmode")
    @app_commands.describe(
        ativar="Ativar ou desativar auto-slowmode",
        threshold="Número de mensagens para ativar",
        janela="Janela de tempo em segundos",
        duracao="Duração do slowmode em segundos"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_slowmode(
        self,
        interaction: discord.Interaction,
        ativar: Optional[bool] = None,
        threshold: Optional[int] = None,
        janela: Optional[int] = None,
        duracao: Optional[int] = None
    ):
        """Configurar auto-slowmode durante alta atividade"""
        try:
            if ativar is not None:
                self.config["auto_slowmode"]["enabled"] = ativar
            
            if threshold is not None:
                self.config["auto_slowmode"]["trigger_threshold"] = threshold
            
            if janela is not None:
                self.config["auto_slowmode"]["trigger_window"] = janela
            
            if duracao is not None:
                self.config["auto_slowmode"]["slowmode_duration"] = duracao
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if self.config["auto_slowmode"]["enabled"] else "❌ Desativado"
            
            embed = discord.Embed(
                title="⏱️ Auto-Slowmode Configurado",
                description=f"**Status:** {status}",
                color=discord.Color.green() if self.config["auto_slowmode"]["enabled"] else discord.Color.gray()
            )
            
            config = self.config["auto_slowmode"]
            embed.add_field(name="Threshold", value=f"{config['trigger_threshold']} mensagens", inline=True)
            embed.add_field(name="Janela", value=f"{config['trigger_window']}s", inline=True)
            embed.add_field(name="Slowmode", value=f"{config['slowmode_duration']}s", inline=True)
            embed.add_field(name="Duração Total", value=f"{config['slowmode_time']}s", inline=True)
            
            embed.add_field(
                name="ℹ️ Como Funciona",
                value=f"Se {config['trigger_threshold']} mensagens forem enviadas em {config['trigger_window']}s, "
                      f"slowmode de {config['slowmode_duration']}s será ativado por {config['slowmode_time']}s",
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou auto-slowmode")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="setup_rolebackup", description="Configurar backup de roles")
    @app_commands.describe(
        ativar="Ativar ou desativar backup de roles",
        restaurar_unban="Restaurar roles automaticamente após unban"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def setup_rolebackup(
        self,
        interaction: discord.Interaction,
        ativar: Optional[bool] = None,
        restaurar_unban: Optional[bool] = None
    ):
        """Configurar sistema de backup de roles"""
        try:
            if ativar is not None:
                self.config["role_backup"]["enabled"] = ativar
            
            if restaurar_unban is not None:
                self.config["role_backup"]["restore_on_unban"] = restaurar_unban
            
            # Salvar config
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            status = "✅ Ativado" if self.config["role_backup"]["enabled"] else "❌ Desativado"
            
            embed = discord.Embed(
                title="♻️ Backup de Roles Configurado",
                description=f"**Status:** {status}",
                color=discord.Color.green() if self.config["role_backup"]["enabled"] else discord.Color.gray()
            )
            
            config = self.config["role_backup"]
            embed.add_field(name="Restaurar no Unban", value="✅" if config["restore_on_unban"] else "❌", inline=True)
            
            embed.add_field(
                name="ℹ️ Como Funciona",
                value="Quando um membro é banido, seus roles são salvos. "
                      "Se restaurar no unban estiver ativo, os roles serão restaurados quando o membro voltar.",
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            bot_logger.info(f"{interaction.user} configurou backup de roles")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro: {e}", ephemeral=True)
    
    @app_commands.command(name="strike", description="Adicionar strike manualmente a um usuário")
    @app_commands.describe(
        membro="Membro para adicionar strike",
        motivo="Motivo do strike"
    )
    @app_commands.checks.has_permissions(moderate_members=True)
    async def strike_add(
        self,
        interaction: discord.Interaction,
        membro: discord.Member,
        motivo: str
    ):
        """Adicionar strike a um usuário"""
        if not self.config.get("strikes_system", {}).get("enabled", False):
            await interaction.response.send_message("❌ Sistema de strikes não está ativo!", ephemeral=True)
            return
        
        if membro.bot:
            await interaction.response.send_message("❌ Não podes adicionar strikes a bots!", ephemeral=True)
            return
        
        if membro.id == interaction.user.id:
            await interaction.response.send_message("❌ Não podes adicionar strikes a ti mesmo!", ephemeral=True)
            return
        
        try:
            await self.add_strike(membro.id, interaction.guild.id, interaction.user.id, motivo)
            
            strikes = await self.get_active_strikes(membro.id, interaction.guild.id)
            strikes_to_ban = self.config.get("strikes_system", {}).get("strikes_to_ban", 3)
            
            embed = discord.Embed(
                title="⚠️ Strike Adicionado",
                description=f"**Usuário:** {membro.mention}\n**Strikes:** {strikes}/{strikes_to_ban}",
                color=discord.Color.orange(),
                timestamp=datetime.now()
            )
            embed.add_field(name="Motivo", value=motivo, inline=False)
            embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            
            if strikes >= strikes_to_ban:
                embed.color = discord.Color.red()
                embed.add_field(name="⚠️ Atenção", value="Usuário atingiu limite de strikes!", inline=False)
            
            await interaction.response.send_message(embed=embed)
            
            # Enviar DM ao usuário
            try:
                dm_embed = discord.Embed(
                    title="⚠️ Strike Recebido",
                    description=f"Recebeste um strike em **{interaction.guild.name}**",
                    color=discord.Color.orange()
                )
                dm_embed.add_field(name="Motivo", value=motivo, inline=False)
                dm_embed.add_field(name="Strikes Atuais", value=f"{strikes}/{strikes_to_ban}", inline=True)
                dm_embed.add_field(
                    name="⚠️ Atenção",
                    value=f"Com {strikes_to_ban} strikes serás automaticamente banido!",
                    inline=False
                )
                await membro.send(embed=dm_embed)
            except:
                pass
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro ao adicionar strike: {e}", ephemeral=True)
    
    @app_commands.command(name="strikes", description="Ver strikes de um usuário")
    @app_commands.describe(
        membro="Membro para ver strikes (deixar vazio para ver próprios strikes)"
    )
    async def strikes_view(
        self,
        interaction: discord.Interaction,
        membro: Optional[discord.Member] = None
    ):
        """Ver strikes de um usuário"""
        if not self.config.get("strikes_system", {}).get("enabled", False):
            await interaction.response.send_message("❌ Sistema de strikes não está ativo!", ephemeral=True)
            return
        
        target = membro or interaction.user
        
        try:
            strikes = await self.get_active_strikes(target.id, interaction.guild.id)
            strikes_to_ban = self.config.get("strikes_system", {}).get("strikes_to_ban", 3)
            
            # Buscar histórico de strikes
            async with aiosqlite.connect(self.bot.db_path) as db:
                async with db.execute(
                    """SELECT reason, created_at, moderator_id 
                       FROM moderation_strikes 
                       WHERE user_id = ? AND guild_id = ? AND is_active = 1 
                       ORDER BY created_at DESC""",
                    (target.id, interaction.guild.id)
                ) as cursor:
                    rows = await cursor.fetchall()
            
            embed = discord.Embed(
                title=f"⚠️ Strikes de {target.display_name}",
                description=f"**Strikes Ativos:** {strikes}/{strikes_to_ban}",
                color=discord.Color.orange() if strikes > 0 else discord.Color.green()
            )
            
            if rows:
                for idx, (reason, created_at, mod_id) in enumerate(rows, 1):
                    moderator = interaction.guild.get_member(mod_id)
                    mod_name = moderator.mention if moderator else f"ID: {mod_id}"
                    
                    timestamp = datetime.fromisoformat(created_at)
                    embed.add_field(
                        name=f"Strike #{idx}",
                        value=f"**Motivo:** {reason}\n**Moderador:** {mod_name}\n**Data:** {timestamp.strftime('%d/%m/%Y %H:%M')}",
                        inline=False
                    )
            else:
                embed.add_field(name="✅ Sem Strikes", value="Este usuário não tem strikes ativos.", inline=False)
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro ao buscar strikes: {e}", ephemeral=True)
    
    @app_commands.command(name="clearstrikes", description="Limpar strikes de um usuário")
    @app_commands.describe(
        membro="Membro para limpar strikes"
    )
    @app_commands.checks.has_permissions(administrator=True)
    async def strikes_clear(
        self,
        interaction: discord.Interaction,
        membro: discord.Member
    ):
        """Limpar todos os strikes de um usuário"""
        if not self.config.get("strikes_system", {}).get("enabled", False):
            await interaction.response.send_message("❌ Sistema de strikes não está ativo!", ephemeral=True)
            return
        
        try:
            async with aiosqlite.connect(self.bot.db_path) as db:
                await db.execute(
                    "UPDATE moderation_strikes SET is_active = 0 WHERE user_id = ? AND guild_id = ?",
                    (membro.id, interaction.guild.id)
                )
                await db.commit()
            
            embed = discord.Embed(
                title="✅ Strikes Limpos",
                description=f"Todos os strikes de {membro.mention} foram removidos.",
                color=discord.Color.green()
            )
            embed.add_field(name="Moderador", value=interaction.user.mention, inline=True)
            
            await interaction.response.send_message(embed=embed)
            bot_logger.info(f"{interaction.user} limpou strikes de {membro}")
            
        except Exception as e:
            await interaction.response.send_message(f"❌ Erro ao limpar strikes: {e}", ephemeral=True)


async def setup(bot):
    await bot.add_cog(Moderation(bot))
