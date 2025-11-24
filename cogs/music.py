import discord
from discord.ext import commands
from discord import app_commands
import yt_dlp
import asyncio
from collections import deque
import os
from typing import Optional, Dict, List
import logging


class MusicQueue:
    """Classe para gerenciar a fila de música de um servidor"""
    
    def __init__(self):
        self.queue: deque = deque()
        self.current: Optional[dict] = None
        self.loop_mode: str = "off"  # off, song, queue
        self.volume: float = 0.5
    
    def add(self, track: dict):
        """Adiciona uma música à fila"""
        self.queue.append(track)
    
    def next(self) -> Optional[dict]:
        """Retorna a próxima música da fila"""
        if self.loop_mode == "song" and self.current:
            return self.current
        
        if self.loop_mode == "queue" and self.current:
            self.queue.append(self.current)
        
        if self.queue:
            self.current = self.queue.popleft()
            return self.current
        
        self.current = None
        return None
    
    def clear(self):
        """Limpa a fila"""
        self.queue.clear()
        self.current = None
    
    def remove(self, index: int) -> bool:
        """Remove uma música da fila por índice"""
        try:
            del self.queue[index]
            return True
        except IndexError:
            return False
    
    def shuffle(self):
        """Embaralha a fila"""
        import random
        queue_list = list(self.queue)
        random.shuffle(queue_list)
        self.queue = deque(queue_list)
    
    def __len__(self):
        return len(self.queue)


class MusicCog(commands.Cog):
    """Cog para funcionalidades de música"""
    
    def __init__(self, bot):
        self.bot = bot
        self.queues: Dict[int, MusicQueue] = {}
        
        # Sistema de cache para URLs extraídas
        self.url_cache = {}
        self.failed_cache = {}  # Cache de URLs que falharam recentemente
        self.cache_enabled = getattr(bot.config, 'enable_music_cache', True)
        
        # Obter formato da configuração ou usar padrão
        ytdl_format = getattr(bot.config, 'ytdl_format', 'bestaudio')
        
        self.ydl_opts = {
            "format": f"{ytdl_format}[abr<=128]/{ytdl_format}/best",
            "noplaylist": True,
            "extractaudio": True,
            "audioformat": "opus",
            "outtmpl": "%(extractor)s-%(id)s-%(title)s.%(ext)s",
            "restrictfilenames": True,
            "logtostderr": False,
            "ignoreerrors": False,
            "default_search": "ytsearch",
            "source_address": "0.0.0.0",
            "quiet": True,
            "no_warnings": True,
            # Opções avançadas para contornar restrições do YouTube
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "ios", "web"],
                    "player_skip": ["webpage", "configs"],
                    "skip": ["hls", "dash", "translated_subs"],
                }
            },
            "http_headers": {
                "User-Agent": "com.google.android.youtube/17.36.4 (Linux; U; Android 12; US) gzip",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-us,en;q=0.5",
                "Sec-Fetch-Mode": "navigate",
            },
            # Configurações adicionais
            "cookiesfrombrowser": None,
            "age_limit": None,
            "geo_bypass": True,
            "geo_bypass_country": "US",
            "prefer_insecure": False,
            "extract_flat": False,
            # Usar client Android por padrão (menos restritivo)
            "extractor_retries": 3,
            "fragment_retries": 3,
            "skip_unavailable_fragments": True,
        }
        
        # Configurações do FFmpeg otimizadas
        music_debug = getattr(bot.config, 'music_debug', False)
        loglevel = "info" if music_debug else "error"
        
        self.ffmpeg_options = {
            "before_options": f"-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 -loglevel {loglevel}",
            "options": "-vn -filter:a 'volume=0.5' -ar 48000 -ac 2 -bufsize 1024k",
        }
        
        # Opções para PCM (fallback)
        self.ffmpeg_pcm_options = {
            "before_options": f"-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 -loglevel {loglevel}",
            "options": "-vn -ar 48000 -ac 2",
        }
        
        # Verificar se FFmpeg existe
        ffmpeg_path = self.bot.config.ffmpeg_path
        if os.path.exists(ffmpeg_path):
            self.ffmpeg_options["executable"] = ffmpeg_path
            self.bot.logger.info(f"✅ FFmpeg encontrado: {ffmpeg_path}")
        else:
            self.bot.logger.warning(f"⚠️ FFmpeg não encontrado em: {ffmpeg_path}")
            # Tentar usar FFmpeg do sistema
            import shutil
            system_ffmpeg = shutil.which("ffmpeg")
            if system_ffmpeg:
                self.ffmpeg_options["executable"] = system_ffmpeg
                self.bot.logger.info(f"✅ Usando FFmpeg do sistema: {system_ffmpeg}")
            else:
                self.bot.logger.error("❌ FFmpeg não encontrado no sistema!")

    async def cog_load(self):
        """Método chamado quando o cog é carregado"""
        self.bot.logger.info("🎵 Cog de música carregado com sucesso")

    def get_queue(self, guild_id: int) -> MusicQueue:
        """Retorna a fila de música do servidor"""
        if guild_id not in self.queues:
            self.queues[guild_id] = MusicQueue()
        return self.queues[guild_id]

    async def search_song(self, query: str) -> Optional[dict]:
        """Procura por uma música no YouTube com múltiplas tentativas"""
        
        # Verificar cache primeiro se habilitado
        if self.cache_enabled and query in self.url_cache:
            self.bot.logger.info(f"🎯 Cache hit para: {query}")
            return self.url_cache[query]
        
        # Verificar se falhou recentemente (cache negativo)
        import time
        if query in self.failed_cache:
            last_fail = self.failed_cache[query]
            if time.time() - last_fail < 300:  # 5 minutos de cooldown
                self.bot.logger.warning(f"⏰ URL em cooldown (falhou recentemente): {query}")
                return None
        
        # Lista de configurações alternativas para tentar
        alternative_opts = [
            # Configuração 1: Android TV (mais confiável)
            {
                "format": "bestaudio/best",
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "default_search": "ytsearch",
                "extract_flat": False,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["android_creator", "android_music"],
                        "player_skip": ["configs", "webpage", "js"]
                    }
                },
                "http_headers": {
                    "User-Agent": "com.google.android.apps.youtube.creator/22.30.100 (Linux; U; Android 11; SM-G973F) gzip",
                    "X-YouTube-Client-Name": "14",
                    "X-YouTube-Client-Version": "22.30.100"
                }
            },
            
            # Configuração 2: iOS (alternativa móvel)
            {
                "format": "bestaudio/best",
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "default_search": "ytsearch",
                "extract_flat": False,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["ios"],
                        "player_skip": ["configs", "webpage"]
                    }
                },
                "http_headers": {
                    "User-Agent": "com.google.ios.youtube/17.33.2 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)"
                }
            },
            
            # Configuração 3: Web com bypass agressivo
            {
                "format": "worst/bestaudio/best",
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "default_search": "ytsearch",
                "extract_flat": False,
                "geo_bypass": True,
                "geo_bypass_country": "US",
                "extractor_args": {
                    "youtube": {
                        "player_client": ["web"],
                        "player_skip": ["configs", "webpage", "js"],
                        "skip": ["hls", "dash"]
                    }
                },
                "http_headers": {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
            },
            
            # Configuração 4: TV HTML5 (sem JavaScript)
            {
                "format": "worst",
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "default_search": "ytsearch",
                "extract_flat": False,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["tv_embedded"],
                        "player_skip": ["configs", "webpage", "js", "initial_data"]
                    }
                },
                "http_headers": {
                    "User-Agent": "Mozilla/5.0 (SMART-TV; LINUX; Tizen 2.4.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/2.4.0 TV Safari/538.1"
                }
            },
            
            # Configuração 5: Fallback extremo (sem extractor_args)
            {
                "format": "worst",
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "default_search": "ytsearch",
                "extract_flat": False,
                "geo_bypass": True,
                "prefer_insecure": True,
                "http_headers": {
                    "User-Agent": "yt-dlp/2024.10.01"
                }
            }
        ]
        
        for i, opts in enumerate(alternative_opts):
            try:
                if getattr(self.bot.config, 'music_debug', False):
                    self.bot.logger.debug(f"🔍 Tentativa {i+1} com configuração: {opts.get('extractor_args', {})}")
                
                self.bot.logger.info(f"Tentativa {i+1} de procura por música: {query}")
                
                loop = asyncio.get_event_loop()
                data = await loop.run_in_executor(
                    None, 
                    lambda: yt_dlp.YoutubeDL(opts).extract_info(
                        f"ytsearch:{query}", download=False
                    )
                )
                
                if data and "entries" in data and data["entries"]:
                    track = data["entries"][0]
                    self.bot.logger.info(f"✅ Música encontrada na tentativa {i+1}: {track.get('title', 'Desconhecido')}")
                    
                    track_info = {
                        "title": track.get("title", "Desconhecido"),
                        "url": track.get("url"),
                        "webpage_url": track.get("webpage_url"),
                        "duration": track.get("duration", 0),
                        "uploader": track.get("uploader", "Desconhecido"),
                        "thumbnail": track.get("thumbnail"),
                    }
                    
                    # Salvar no cache se habilitado
                    if self.cache_enabled:
                        self.url_cache[query] = track_info
                        # Manter cache limitado (máximo 100 entradas)
                        if len(self.url_cache) > 100:
                            # Remove a entrada mais antiga
                            oldest_key = next(iter(self.url_cache))
                            del self.url_cache[oldest_key]
                    
                    return track_info
                    
            except Exception as e:
                self.bot.logger.warning(f"Tentativa {i+1} falhou: {str(e)}")
                if i < len(alternative_opts) - 1:
                    await asyncio.sleep(1)  # Esperar 1 segundo antes da próxima tentativa
                continue
        
        # Se todas as tentativas falharam, tentar busca direta por URL se parecer um link
        if "youtube.com" in query or "youtu.be" in query:
            # Tentar com diferentes configurações de emergência
            emergency_configs = [
                {
                    "format": "worst",
                    "quiet": True,
                    "no_warnings": True,
                    "geo_bypass": True,
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["android_creator"],
                            "player_skip": ["configs", "webpage", "js", "initial_data"]
                        }
                    }
                },
                {
                    "format": "worst",
                    "quiet": True,
                    "no_warnings": True,
                    "prefer_insecure": True,
                    "source_address": "0.0.0.0"
                }
            ]
            
            for i, config in enumerate(emergency_configs):
                try:
                    self.bot.logger.info(f"Tentando configuração de emergência {i+1} para URL...")
                    loop = asyncio.get_event_loop()
                    data = await loop.run_in_executor(
                        None, 
                        lambda: yt_dlp.YoutubeDL(config).extract_info(query, download=False)
                    )
                    
                    if data:
                        self.bot.logger.info(f"✅ URL extraída com configuração de emergência {i+1}: {data.get('title', 'Desconhecido')}")
                        track_info = {
                            "title": data.get("title", "Desconhecido"),
                            "url": data.get("url"),
                            "webpage_url": data.get("webpage_url", query),
                            "duration": data.get("duration", 0),
                            "uploader": data.get("uploader", "Desconhecido"),
                            "thumbnail": data.get("thumbnail"),
                        }
                        
                        # Salvar no cache se habilitado
                        if self.cache_enabled:
                            self.url_cache[query] = track_info
                        
                        return track_info
                        
                except Exception as e:
                    self.bot.logger.warning(f"Configuração de emergência {i+1} falhou: {e}")
                    continue
        
        self.bot.logger.error(f"❌ Todas as tentativas falharam para: {query}")
        
        # Adicionar ao cache negativo
        if self.cache_enabled:
            import time
            self.failed_cache[query] = time.time()
            # Limitar cache negativo (máximo 50 entradas)
            if len(self.failed_cache) > 50:
                oldest_key = min(self.failed_cache.keys(), key=lambda k: self.failed_cache[k])
                del self.failed_cache[oldest_key]
        
        return None

    async def play_next(self, guild_id: int, text_channel):
        """Toca a próxima música da fila"""
        guild = self.bot.get_guild(guild_id)
        if not guild:
            return
        
        voice_client = guild.voice_client
        if not voice_client:
            self.bot.logger.warning(f"Voice client não encontrado para guild {guild_id}")
            return
        
        # Verificar se está realmente conectado
        if not voice_client.is_connected():
            self.bot.logger.warning(f"Voice client não está conectado para guild {guild_id}")
            return
        
        queue = self.get_queue(guild_id)
        
        next_track = queue.next()
        if not next_track:
            # Fila vazia, agendar desconexão para mais tarde (não bloquear)
            self.bot.logger.info(f"Fila vazia para guild {guild_id}, agendando desconexão...")
            
            async def disconnect_later():
                try:
                    await asyncio.sleep(300)  # 5 minutos
                    # Verificar novamente se ainda está conectado e sem tocar
                    current_voice_client = guild.voice_client
                    if (current_voice_client and 
                        current_voice_client.is_connected() and 
                        not current_voice_client.is_playing() and
                        not current_voice_client.is_paused()):
                        
                        # Verificar se a fila ainda está vazia
                        current_queue = self.get_queue(guild_id)
                        if len(current_queue) == 0:
                            await current_voice_client.disconnect()
                            if text_channel:
                                embed = discord.Embed(
                                    title="👋 Desconectado",
                                    description="Desconectei por inatividade (5 minutos).",
                                    color=discord.Color.orange()
                                )
                                await text_channel.send(embed=embed)
                            self.bot.logger.info(f"Desconectado por inatividade: guild {guild_id}")
                except Exception as e:
                    self.bot.logger.error(f"Erro ao desconectar por inatividade: {e}")
            
            # Criar task para desconexão sem bloquear
            asyncio.create_task(disconnect_later())
            return
        
        try:
            # Verificar novamente antes de tocar
            if not voice_client.is_connected():
                self.bot.logger.error("Voice client desconectou antes de tocar a música")
                # Tentar reconectar se possível
                try:
                    if hasattr(voice_client, 'channel') and voice_client.channel:
                        await voice_client.channel.connect()
                        self.bot.logger.info("Reconectado ao canal de voz")
                    else:
                        return
                except Exception as reconnect_error:
                    self.bot.logger.error(f"Falha ao reconectar: {reconnect_error}")
                    return
            
            # Criar source com retry em caso de falha
            source = None
            for attempt in range(3):
                try:
                    # Verificar se a URL do áudio é válida
                    if not next_track["url"]:
                        self.bot.logger.error("URL de áudio vazio")
                        return
                    
                    self.bot.logger.info(f"Tentativa {attempt + 1}: Criando source para {next_track['url'][:100]}...")
                    
                    # Tentar FFmpegOpusAudio primeiro (mais eficiente)
                    try:
                        source = discord.FFmpegOpusAudio(
                            next_track["url"],
                            **self.ffmpeg_options
                        )
                        self.bot.logger.info(f"✅ Source Opus criado com sucesso (tentativa {attempt + 1})")
                        break
                    except Exception as opus_error:
                        self.bot.logger.warning(f"FFmpegOpusAudio falhou (tentativa {attempt + 1}): {opus_error}")
                        
                        # Fallback para FFmpegPCMAudio se Opus falhar
                        try:
                            source = discord.FFmpegPCMAudio(
                                next_track["url"],
                                **self.ffmpeg_pcm_options
                            )
                            self.bot.logger.info(f"✅ Source PCM criado como fallback (tentativa {attempt + 1})")
                            break
                        except Exception as pcm_error:
                            self.bot.logger.warning(f"FFmpegPCMAudio também falhou (tentativa {attempt + 1}): {pcm_error}")
                            if attempt == 2:
                                raise pcm_error
                            
                except Exception as source_error:
                    self.bot.logger.warning(f"Tentativa {attempt + 1} de criar source falhou: {source_error}")
                    if attempt == 2:
                        raise source_error
                    await asyncio.sleep(1)
            
            if not source:
                self.bot.logger.error("Falha ao criar source de áudio após todas as tentativas")
                if text_channel:
                    embed = discord.Embed(
                        title="❌ Erro de Áudio",
                        description=f"Não foi possível reproduzir: **{next_track['title']}**\n"
                                  f"O formato de áudio pode não ser compatível.",
                        color=discord.Color.red()
                    )
                    try:
                        await text_channel.send(embed=embed)
                    except:
                        pass
                return
            
            def after_play(error):
                if error:
                    self.bot.logger.error(f"❌ Erro durante reprodução: {error}")
                    # Enviar notificação de erro se possível
                    if text_channel:
                        asyncio.run_coroutine_threadsafe(
                            text_channel.send(f"❌ **Erro durante reprodução**: {error}"),
                            self.bot.loop
                        )
                else:
                    self.bot.logger.info(f"✅ Música '{next_track['title']}' tocada com sucesso")
                
                # Só tentar próxima música se há algo na fila ou em loop
                try:
                    # Verificar se o voice client ainda existe e está conectado
                    current_voice_client = guild.voice_client
                    if not current_voice_client or not current_voice_client.is_connected():
                        self.bot.logger.warning("Voice client não disponível para próxima música")
                        return
                    
                    queue = self.get_queue(guild_id)
                    if len(queue) > 0 or queue.loop_mode != "off":
                        self.bot.logger.info("Passando para próxima música...")
                        asyncio.run_coroutine_threadsafe(
                            self.play_next(guild_id, text_channel),
                            self.bot.loop
                        )
                    else:
                        self.bot.logger.info(f"Reprodução finalizada para guild {guild_id}")
                except Exception as after_error:
                    self.bot.logger.error(f"Erro na função after_play: {after_error}")
            
            # Verificar uma última vez antes de tocar
            if not voice_client.is_connected():
                self.bot.logger.error("Conexão perdida antes de iniciar reprodução")
                return
            
            self.bot.logger.info(f"🎵 Iniciando reprodução: {next_track['title']} (URL: {next_track['url'][:100]}...)")
            
            try:
                voice_client.play(source, after=after_play)
                self.bot.logger.info(f"✅ Comando voice_client.play() executado com sucesso")
            except Exception as play_error:
                self.bot.logger.error(f"❌ Erro ao executar voice_client.play(): {play_error}")
                return
            
            # Enviar embed da música atual
            if text_channel:
                embed = discord.Embed(
                    title="🎵 Tocando Agora",
                    description=f"**[{next_track['title']}]({next_track['webpage_url']})**",
                    color=discord.Color.green()
                )
                embed.add_field(
                    name="👤 Canal",
                    value=next_track["uploader"],
                    inline=True
                )
                
                if next_track["duration"]:
                    duration = f"{next_track['duration'] // 60}:{next_track['duration'] % 60:02d}"
                    embed.add_field(
                        name="⏱️ Duração",
                        value=duration,
                        inline=True
                    )
                
                embed.add_field(
                    name="📋 Na Fila",
                    value=str(len(queue)),
                    inline=True
                )
                
                if next_track["thumbnail"]:
                    embed.set_thumbnail(url=next_track["thumbnail"])
                
                embed.set_footer(text="EPA Bot • Sistema de Música")
                await text_channel.send(embed=embed)
                
        except Exception as e:
            self.bot.logger.error(f"Erro ao tocar música: {e}")
            # Tentar tocar a próxima música se houver
            if len(queue) > 0:
                await asyncio.sleep(2)  # Esperar um pouco antes de tentar novamente
                await self.play_next(guild_id, text_channel)

    @discord.app_commands.command(name="play", description="Toca uma música ou adiciona à fila de reprodução")
    @discord.app_commands.describe(query="Nome da música ou URL do YouTube")
    async def play(self, interaction: discord.Interaction, query: str):
        """
        Toca uma música ou adiciona à fila
        
        Args:
            query: Nome da música ou URL do YouTube
        """
        # Verificar se o utilizador está num canal de voz
        if not interaction.user.voice:
            await interaction.response.send_message("❌ Precisas de estar num canal de voz!", ephemeral=True)
            return
        
        voice_channel = interaction.user.voice.channel
        
        # Verificar permissões do bot no canal de voz
        permissions = voice_channel.permissions_for(interaction.guild.me)
        if not permissions.connect or not permissions.speak:
            await interaction.response.send_message("❌ Não tenho permissão para conectar ou falar neste canal!", ephemeral=True)
            return
        
        # Conectar ao canal de voz se necessário
        voice_client = interaction.guild.voice_client
        
        if not voice_client:
            try:
                # Tentar conectar com retry
                for attempt in range(3):
                    try:
                        voice_client = await voice_channel.connect(timeout=10.0)
                        self.bot.logger.info(f"Conectado ao canal de voz: {voice_channel.name}")
                        break
                    except asyncio.TimeoutError:
                        self.bot.logger.warning(f"Tentativa {attempt + 1} de conexão falhou por timeout")
                        if attempt == 2:  # Última tentativa
                            raise
                        await asyncio.sleep(1)
                    except Exception as e:
                        self.bot.logger.warning(f"Tentativa {attempt + 1} de conexão falhou: {e}")
                        if attempt == 2:  # Última tentativa
                            raise
                        await asyncio.sleep(1)
                        
            except Exception as e:
                self.bot.logger.error(f"Erro ao conectar ao canal de voz após 3 tentativas: {e}")
                await interaction.response.send_message(f"❌ Erro ao conectar após múltiplas tentativas: {str(e)}", ephemeral=True)
                return
        else:
            # Se já está conectado mas em outro canal, mover
            if voice_client.channel != voice_channel:
                try:
                    await voice_client.move_to(voice_channel)
                    self.bot.logger.info(f"Movido para canal de voz: {voice_channel.name}")
                except Exception as e:
                    self.bot.logger.error(f"Erro ao mover para canal de voz: {e}")
                    await interaction.response.send_message(f"❌ Erro ao mover para o canal: {str(e)}", ephemeral=True)
                    return
        
        # Verificar se a conexão está realmente estabelecida
        if not voice_client or not voice_client.is_connected():
            await interaction.response.send_message("❌ Falha na conexão ao canal de voz!", ephemeral=True)
            return
        
        # Aguardar um pouco para estabilizar a conexão
        await asyncio.sleep(0.5)
        
        await interaction.response.defer()
        
        # Procurar música
        track = await self.search_song(query)
        if not track:
            # Verificar se está em cache negativo
            is_in_cooldown = query in self.failed_cache
            
            embed = discord.Embed(
                title="❌ Música Não Encontrada",
                color=discord.Color.red()
            )
            
            if is_in_cooldown:
                embed.description = f"**{query}**\n\n⏰ Esta URL falhou recentemente e está em cooldown (5 min)."
                embed.add_field(
                    name="💡 Sugestões",
                    value="• Tente usar `/music_retry <url>` (admin)\n"
                          "• Aguarde alguns minutos\n"
                          "• Tente uma URL diferente\n"
                          "• Use busca por nome em vez de URL",
                    inline=False
                )
            elif "youtube.com" in query or "youtu.be" in query:
                embed.description = f"**{query}**\n\n🚫 YouTube bloqueou todas as tentativas de extração."
                embed.add_field(
                    name="💡 Sugestões",
                    value="• Tente `/test_url <url>` para diagnóstico\n"
                          "• Use busca por nome: `/play nome da musica`\n"
                          "• Aguarde alguns minutos\n"
                          "• Admin pode usar `/music_update`",
                    inline=False
                )
            else:
                embed.description = f"**{query}**\n\n🔍 Nenhum resultado encontrado na busca."
                embed.add_field(
                    name="💡 Sugestões",
                    value="• Verifique a ortografia\n"
                          "• Tente termos mais específicos\n"
                          "• Use nome do artista + música\n"
                          "• Tente um URL direto do YouTube",
                    inline=False
                )
            
            await interaction.followup.send(embed=embed)
            return
        
        queue = self.get_queue(interaction.guild.id)
        
        # Verificar limite da fila
        if len(queue) >= self.bot.config.max_queue_size:
            await interaction.followup.send(f"❌ Fila cheia! Máximo: {self.bot.config.max_queue_size}")
            return
        
        # Adicionar à fila
        queue.add(track)
        
        # Se não estiver tocando, começar imediatamente
        if not voice_client.is_playing() and not voice_client.is_paused():
            await self.play_next(interaction.guild.id, interaction.channel)
        else:
            # Enviar confirmação de adição à fila
            embed = discord.Embed(
                title="📋 Adicionado à Fila",
                description=f"**[{track['title']}]({track['webpage_url']})**",
                color=discord.Color.blue()
            )
            embed.add_field(
                name="📍 Posição na Fila",
                value=str(len(queue)),
                inline=True
            )
            embed.add_field(
                name="👤 Solicitado por",
                value=interaction.user.mention,
                inline=True
            )
            
            if track["thumbnail"]:
                embed.set_thumbnail(url=track["thumbnail"])
            
            await interaction.followup.send(embed=embed)

    @discord.app_commands.command(name="skip", description="Passa à próxima música")
    async def skip(self, interaction: discord.Interaction):
        """Passa à próxima música"""
        voice_client = interaction.guild.voice_client
        
        if not voice_client or not voice_client.is_playing():
            await interaction.response.send_message("❌ Não estou tocando nada!", ephemeral=True)
            return
        
        voice_client.stop()
        
        embed = discord.Embed(
            title="⏭️ Música Passou",
            description="Próxima música em instantes...",
            color=discord.Color.blue()
        )
        await interaction.response.send_message(embed=embed)

    @discord.app_commands.command(name="pause", description="Pausa a música actual")
    async def pause(self, interaction: discord.Interaction):
        """Pausa a música actual"""
        voice_client = interaction.guild.voice_client
        
        if not voice_client:
            await interaction.response.send_message("❌ Não estou conectado a um canal de voz!", ephemeral=True)
            return
        
        if not voice_client.is_playing():
            await interaction.response.send_message("❌ Não estou tocando nada!", ephemeral=True)
            return
        
        voice_client.pause()
        
        embed = discord.Embed(
            title="⏸️ Música Pausada",
            description="Usa `/resume` para continuar.",
            color=discord.Color.orange()
        )
        await interaction.response.send_message(embed=embed)

    @discord.app_commands.command(name="resume", description="Retoma a música pausada")
    async def resume(self, interaction: discord.Interaction):
        """Retoma a música pausada"""
        voice_client = interaction.guild.voice_client
        
        if not voice_client:
            await interaction.response.send_message("❌ Não estou conectado a um canal de voz!", ephemeral=True)
            return
        
        if not voice_client.is_paused():
            await interaction.response.send_message("❌ A música não está pausada!", ephemeral=True)
            return
        
        voice_client.resume()
        
        embed = discord.Embed(
            title="▶️ Música Retomada",
            description="Continuando a reprodução...",
            color=discord.Color.green()
        )
        await interaction.response.send_message(embed=embed)

    @discord.app_commands.command(name="stop", description="Pára a música e limpa a fila")
    async def stop(self, interaction: discord.Interaction):
        """Pára a música e limpa a fila"""
        voice_client = interaction.guild.voice_client
        
        if not voice_client:
            await interaction.response.send_message("❌ Não estou conectado a um canal de voz!", ephemeral=True)
            return
        
        queue = self.get_queue(interaction.guild.id)
        queue.clear()
        
        if voice_client.is_playing() or voice_client.is_paused():
            voice_client.stop()
        
        await voice_client.disconnect()
        
        embed = discord.Embed(
            title="⏹️ Reprodução Parada",
            description="Fila limpa e desconectado.",
            color=discord.Color.red()
        )
        await interaction.response.send_message(embed=embed)

    @discord.app_commands.command(name="queue", description="Mostra a fila de reprodução")
    @discord.app_commands.describe(pagina="Página da fila para mostrar (padrão: 1)")
    async def show_queue(self, interaction: discord.Interaction, pagina: int = 1):
        """
        Mostra a fila de reprodução
        
        Args:
            pagina: Página da fila para mostrar (padrão: 1)
        """
        queue = self.get_queue(interaction.guild.id)
        
        if not queue.current and len(queue) == 0:
            await interaction.response.send_message("❌ A fila está vazia!", ephemeral=True)
            return
        
        # Configuração da paginação
        items_per_page = 10
        max_pages = max(1, (len(queue) + items_per_page - 1) // items_per_page)
        
        if pagina < 1 or pagina > max_pages:
            await interaction.response.send_message(f"❌ Página inválida! Usa 1-{max_pages}", ephemeral=True)
            return
        
        embed = discord.Embed(
            title="📋 Fila de Reprodução",
            color=discord.Color.blue()
        )
        
        # Música atual
        if queue.current:
            embed.add_field(
                name="🎵 Tocando Agora",
                value=f"**[{queue.current['title']}]({queue.current['webpage_url']})**",
                inline=False
            )
        
        # Fila
        if len(queue) > 0:
            start_idx = (pagina - 1) * items_per_page
            end_idx = min(start_idx + items_per_page, len(queue))
            
            queue_text = ""
            for i in range(start_idx, end_idx):
                track = list(queue.queue)[i]
                queue_text += f"`{i+1}.` **[{track['title']}]({track['webpage_url']})**\n"
            
            embed.add_field(
                name=f"📝 Próximas ({len(queue)} total)",
                value=queue_text or "Nenhuma música na fila",
                inline=False
            )
            
            if max_pages > 1:
                embed.set_footer(text=f"Página {pagina}/{max_pages}")
        
        await interaction.response.send_message(embed=embed)

    @discord.app_commands.command(name="remove", description="Remove uma música da fila por posição")
    @discord.app_commands.describe(posicao="Posição da música na fila (1-N)")
    async def remove_from_queue(self, interaction: discord.Interaction, posicao: int):
        """
        Remove uma música da fila
        
        Args:
            posicao: Posição da música na fila (1-N)
        """
        queue = self.get_queue(interaction.guild.id)
        
        if posicao < 1 or posicao > len(queue):
            await interaction.response.send_message(f"❌ Posição inválida! Usa 1-{len(queue)}", ephemeral=True)
            return
        
        # Remover da fila (converter para índice 0-based)
        removed = queue.remove(posicao - 1)
        
        if removed:
            await interaction.response.send_message(f"✅ Música removida da posição {posicao}")
        else:
            await interaction.response.send_message("❌ Erro ao remover música!", ephemeral=True)

    @discord.app_commands.command(name="shuffle", description="Baralha a fila de reprodução")
    async def shuffle_queue(self, interaction: discord.Interaction):
        """Baralha a fila de reprodução"""
        queue = self.get_queue(interaction.guild.id)
        
        if len(queue) < 2:
            await interaction.response.send_message("❌ Precisas de pelo menos 2 músicas na fila!", ephemeral=True)
            return
        
        queue.shuffle()
        
        embed = discord.Embed(
            title="🔀 Fila Baralhada",
            description=f"Baralhei {len(queue)} músicas!",
            color=discord.Color.purple()
        )
        await interaction.response.send_message(embed=embed)

    @discord.app_commands.command(name="nowplaying", description="Mostra informações da música actual")
    async def now_playing(self, interaction: discord.Interaction):
        """Mostra informações da música actual"""
        voice_client = interaction.guild.voice_client
        queue = self.get_queue(interaction.guild.id)
        
        if not voice_client or not queue.current:
            await interaction.response.send_message("❌ Não estou tocando nada!", ephemeral=True)
            return
        
        track = queue.current
        
        embed = discord.Embed(
            title="🎵 Tocando Agora",
            description=f"**[{track['title']}]({track['webpage_url']})**",
            color=discord.Color.green()
        )
        
        embed.add_field(
            name="👤 Canal",
            value=track["uploader"],
            inline=True
        )
        
        if track["duration"]:
            duration = f"{track['duration'] // 60}:{track['duration'] % 60:02d}"
            embed.add_field(
                name="⏱️ Duração",
                value=duration,
                inline=True
            )
        
        embed.add_field(
            name="📋 Na Fila",
            value=str(len(queue)),
            inline=True
        )
        
        # Status do player
        if voice_client.is_paused():
            status = "⏸️ Pausado"
        elif voice_client.is_playing():
            status = "▶️ Tocando"
        else:
            status = "⏹️ Parado"
        
        embed.add_field(
            name="📊 Status",
            value=status,
            inline=True
        )
        
        if track["thumbnail"]:
            embed.set_thumbnail(url=track["thumbnail"])
        
        await interaction.response.send_message(embed=embed)

    @discord.app_commands.command(name="music_status", description="Mostra o status da conexão de música")
    async def music_status(self, interaction: discord.Interaction):
        """Comando de diagnóstico para verificar o status da música"""
        embed = discord.Embed(
            title="🔧 Diagnóstico de Música",
            color=discord.Color.blue()
        )
        
        # Verificar conexão de voz
        voice_client = interaction.guild.voice_client
        if voice_client:
            embed.add_field(
                name="🔗 Conexão",
                value=f"✅ Conectado a `{voice_client.channel.name}`",
                inline=False
            )
            embed.add_field(
                name="📊 Status",
                value=f"Tocando: {'✅' if voice_client.is_playing() else '❌'}\n"
                      f"Pausado: {'✅' if voice_client.is_paused() else '❌'}\n"
                      f"Conectado: {'✅' if voice_client.is_connected() else '❌'}",
                inline=True
            )
        else:
            embed.add_field(
                name="🔗 Conexão",
                value="❌ Não conectado",
                inline=False
            )
        
        # Verificar fila
        queue = self.get_queue(interaction.guild.id)
        embed.add_field(
            name="📋 Fila",
            value=f"Músicas na fila: {len(queue)}\n"
                  f"Música atual: {'✅' if queue.current else '❌'}",
            inline=True
        )
        
        # Verificar FFmpeg
        ffmpeg_status = "✅ Configurado" if "executable" in self.ffmpeg_options else "⚠️ Usando padrão"
        embed.add_field(
            name="🎛️ FFmpeg",
            value=ffmpeg_status,
            inline=True
        )
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @discord.app_commands.command(name="playurl", description="Toca música diretamente de um URL do YouTube")
    @discord.app_commands.describe(url="URL direto do YouTube")
    async def playurl(self, interaction: discord.Interaction, url: str):
        """
        Toca música diretamente de um URL (usado quando a busca falha)
        
        Args:
            url: URL direto do YouTube
        """
        try:
            # PRIMEIRO: Responder imediatamente para evitar timeout
            await interaction.response.defer()
            
            # Verificar se é um URL válido do YouTube
            if not ("youtube.com" in url or "youtu.be" in url):
                await interaction.followup.send("❌ Por favor forneça um URL válido do YouTube!")
                return
            
            # Verificar se o utilizador está num canal de voz
            if not interaction.user.voice:
                await interaction.followup.send("❌ Precisas de estar num canal de voz!")
                return
            
            voice_channel = interaction.user.voice.channel
            
            # Verificar permissões do bot no canal de voz
            permissions = voice_channel.permissions_for(interaction.guild.me)
            if not permissions.connect or not permissions.speak:
                await interaction.followup.send("❌ Não tenho permissão para conectar ou falar neste canal!")
                return
            
            # Conectar ao canal de voz se necessário
            voice_client = interaction.guild.voice_client
            
            if not voice_client:
                try:
                    voice_client = await voice_channel.connect()
                    self.bot.logger.info(f"Conectado ao canal de voz: {voice_channel.name}")
                except Exception as e:
                    self.bot.logger.error(f"Erro ao conectar ao canal de voz: {e}")
                    await interaction.followup.send(f"❌ Erro ao conectar: {str(e)}")
                    return
            else:
                if voice_client.channel != voice_channel:
                    try:
                        await voice_client.move_to(voice_channel)
                        self.bot.logger.info(f"Movido para canal de voz: {voice_channel.name}")
                    except Exception as e:
                        self.bot.logger.error(f"Erro ao mover para canal de voz: {e}")
                        await interaction.followup.send(f"❌ Erro ao mover para o canal: {str(e)}")
                        return
            
            # Tentar extrair informações do URL com múltiplas estratégias
            try:
                self.bot.logger.info(f"Extraindo informações do URL: {url}")
                
                # Estratégias múltiplas para contornar restrições do YouTube
                extraction_strategies = [
                    # Estratégia 1: Cliente Android (mais eficaz)
                    {
                        "format": "bestaudio/best",
                        "quiet": True,
                        "no_warnings": True,
                        "extract_flat": False,
                        "extractor_args": {
                            "youtube": {
                                "player_client": ["android"],
                                "player_skip": ["configs", "webpage"]
                            }
                        },
                        "http_headers": {
                            "User-Agent": "com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip"
                        }
                    },
                    
                    # Estratégia 2: Cliente Web Embedded
                    {
                        "format": "bestaudio/best",
                        "quiet": True,
                        "no_warnings": True,
                        "extract_flat": False,
                        "extractor_args": {
                            "youtube": {
                                "player_client": ["web_embedded"],
                                "player_skip": ["configs"]
                            }
                        },
                        "http_headers": {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        }
                    },
                    
                    # Estratégia 3: Headers customizados
                    {
                        "format": "bestaudio/best",
                        "quiet": True,
                        "no_warnings": True,
                        "extract_flat": False,
                        "geo_bypass": True,
                        "http_headers": {
                            "User-Agent": "yt-dlp/2023.09.24",
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Accept-Language": "en-us,en;q=0.5",
                            "Accept-Encoding": "gzip,deflate",
                        }
                    },
                    
                    # Estratégia 4: Configuração ultra-simples (fallback)
                    {
                        "format": "worst",
                        "quiet": True,
                        "no_warnings": True,
                        "ignoreerrors": True,
                        "no_check_certificate": True,
                    }
                ]
                
                data = None
                successful_strategy = None
                
                for i, strategy in enumerate(extraction_strategies):
                    try:
                        self.bot.logger.info(f"Tentando estratégia {i+1}/4 para extrair URL...")
                        
                        async def extract_with_strategy():
                            loop = asyncio.get_event_loop()
                            return await loop.run_in_executor(
                                None, 
                                lambda: yt_dlp.YoutubeDL(strategy).extract_info(url, download=False)
                            )
                        
                        # Timeout configurável por estratégia
                        timeout = getattr(self.bot.config, 'music_timeout', 15)
                        data = await asyncio.wait_for(extract_with_strategy(), timeout=float(timeout))
                        
                        if data and data.get("url"):
                            successful_strategy = i + 1
                            self.bot.logger.info(f"✅ Estratégia {successful_strategy} funcionou!")
                            break
                        else:
                            self.bot.logger.warning(f"⚠️ Estratégia {i+1} não retornou dados válidos")
                            
                    except asyncio.TimeoutError:
                        self.bot.logger.warning(f"⏱️ Estratégia {i+1} expirou (timeout)")
                        continue
                    except Exception as e:
                        self.bot.logger.warning(f"❌ Estratégia {i+1} falhou: {str(e)}")
                        continue
                
                if not data or not data.get("url"):
                    await interaction.followup.send(
                        "❌ **YouTube bloqueou todas as tentativas!**\n"
                        "💡 **Soluções:**\n"
                        "• Tente um vídeo diferente\n"
                        "• Use `/play nome da música` em vez de URL\n"
                        "• Aguarde alguns minutos e tente novamente"
                    )
                    return
                
                track = {
                    "title": data.get("title", "Desconhecido"),
                    "url": data.get("url"),
                    "webpage_url": data.get("webpage_url", url),
                    "duration": data.get("duration", 0),
                    "uploader": data.get("uploader", "Desconhecido"),
                    "thumbnail": data.get("thumbnail"),
                }
                
                self.bot.logger.info(f"✅ URL extraído com sucesso (estratégia {successful_strategy}): {track['title']}")
                
            except Exception as e:
                self.bot.logger.error(f"Erro ao extrair URL: {e}")
                await interaction.followup.send(f"❌ Erro ao processar URL. Verifique se o vídeo está disponível.")
                return
            
            queue = self.get_queue(interaction.guild.id)
            
            # Verificar limite da fila
            if len(queue) >= self.bot.config.max_queue_size:
                await interaction.followup.send(f"❌ Fila cheia! Máximo: {self.bot.config.max_queue_size}")
                return
            
            # Adicionar à fila
            queue.add(track)
            
            # Se não estiver tocando, começar imediatamente
            if not voice_client.is_playing() and not voice_client.is_paused():
                self.bot.logger.info(f"Iniciando reprodução de: {track['title']}")
                try:
                    await self.play_next(interaction.guild.id, interaction.channel)
                    
                    # Confirmar início da reprodução
                    embed = discord.Embed(
                        title="🎵 Reprodução Iniciada",
                        description=f"**[{track['title']}]({track['webpage_url']})**",
                        color=discord.Color.green()
                    )
                    if track["thumbnail"]:
                        embed.set_thumbnail(url=track["thumbnail"])
                    embed.add_field(name="👤 Solicitado por", value=interaction.user.mention, inline=True)
                    
                    await interaction.followup.send(embed=embed)
                    
                except Exception as e:
                    self.bot.logger.error(f"Erro ao iniciar reprodução: {e}")
                    await interaction.followup.send(f"❌ Erro ao iniciar reprodução.")
                    return
            else:
                # Enviar confirmação de adição à fila
                embed = discord.Embed(
                    title="📋 Adicionado à Fila (URL)",
                    description=f"**[{track['title']}]({track['webpage_url']})**",
                    color=discord.Color.blue()
                )
                embed.add_field(
                    name="📍 Posição na Fila",
                    value=str(len(queue)),
                    inline=True
                )
                embed.add_field(
                    name="👤 Solicitado por",
                    value=interaction.user.mention,
                    inline=True
                )
                
                if track["thumbnail"]:
                    embed.set_thumbnail(url=track["thumbnail"])
                
                await interaction.followup.send(embed=embed)
                
        except Exception as e:
            self.bot.logger.error(f"Erro crítico no comando playurl: {e}")
            try:
                if interaction.response.is_done():
                    await interaction.followup.send("❌ Erro interno! Tente novamente.")
                else:
                    await interaction.response.send_message("❌ Erro interno! Tente novamente.", ephemeral=True)
            except:
                pass  # Evitar erro duplo

    @app_commands.command(name="test_url", description="Testa a extração de URL (modo debug)")
    async def test_url(self, interaction: discord.Interaction, url: str):
        """Testa diferentes estratégias de extração de URL"""
        try:
            self.bot.logger.info(f"Comando test_url usado por {interaction.user} com URL: {url}")
            await interaction.response.defer()
            
            # Verificar se é um URL válido
            if not url.startswith(('http://', 'https://')):
                await interaction.followup.send("❌ URL inválido! Use um link completo (http/https)")
                return
            
            # Estratégias de teste
            strategies = [
                ("Cliente Android", {
                    "format": "bestaudio/best",
                    "quiet": True,
                    "no_warnings": True,
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["android"],
                            "player_skip": ["configs", "webpage"]
                        }
                    },
                    "http_headers": {
                        "User-Agent": "com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip"
                    }
                }),
                ("Web Embedded", {
                    "format": "bestaudio/best",
                    "quiet": True,
                    "no_warnings": True,
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["web_embedded"],
                            "player_skip": ["configs"]
                        }
                    },
                    "http_headers": {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                }),
                ("Com Geo Bypass", {
                    "format": "bestaudio/best",
                    "quiet": True,
                    "no_warnings": True,
                    "geo_bypass": True,
                    "http_headers": {
                        "User-Agent": "yt-dlp/2023.09.24"
                    }
                }),
                ("Minimalista", {
                    "format": "worst",
                    "quiet": True,
                    "ignoreerrors": True,
                    "no_check_certificate": True,
                })
            ]
            
            results = []
            
            for name, config in strategies:
                try:
                    async def test_extraction():
                        loop = asyncio.get_event_loop()
                        return await loop.run_in_executor(
                            None, 
                            lambda: yt_dlp.YoutubeDL(config).extract_info(url, download=False)
                        )
                    
                    timeout = getattr(self.bot.config, 'music_timeout', 10)
                    data = await asyncio.wait_for(test_extraction(), timeout=float(timeout))
                    
                    if data and data.get("title"):
                        results.append(f"✅ **{name}**: {data.get('title', 'Sem título')}")
                    else:
                        results.append(f"⚠️ **{name}**: Sem dados válidos")
                        
                except asyncio.TimeoutError:
                    results.append(f"⏱️ **{name}**: Timeout")
                except Exception as e:
                    error_msg = str(e)[:50] + "..." if len(str(e)) > 50 else str(e)
                    results.append(f"❌ **{name}**: {error_msg}")
            
            # Criar embed com resultados
            embed = discord.Embed(
                title="🔍 Teste de Extração de URL",
                description=f"**URL testado:** {url[:100]}{'...' if len(url) > 100 else ''}",
                color=discord.Color.orange(),
                timestamp=discord.utils.utcnow()
            )
            
            embed.add_field(
                name="📊 Resultados das Estratégias",
                value="\n".join(results),
                inline=False
            )
            
            embed.set_footer(text=f"Testado por {interaction.user.display_name}")
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            self.bot.logger.error(f"Erro no comando test_url: {e}")
            await interaction.followup.send("❌ Erro ao testar URL!")

    def ensure_playlists_file(self):
        """Garantir que o arquivo de playlists existe"""
        os.makedirs("data", exist_ok=True)
        if not os.path.exists(self.playlists_file):
            with open(self.playlists_file, 'w', encoding='utf-8') as f:
                json.dump({}, f, indent=2)

    def load_playlists(self):
        """Carregar playlists dos utilizadores"""
        try:
            with open(self.playlists_file, 'r', encoding='utf-8') as f:
                self.user_playlists = json.load(f)
        except:
            self.user_playlists = {}

    def save_playlists(self):
        """Salvar playlists dos utilizadores"""
        try:
            with open(self.playlists_file, 'w', encoding='utf-8') as f:
                json.dump(self.user_playlists, f, indent=2, ensure_ascii=False)
        except Exception as e:
            self.bot.logger.error(f"Erro ao salvar playlists: {e}")

    @app_commands.command(name="music_update", description="[ADMIN] Atualiza o yt-dlp para resolver problemas do YouTube")
    async def music_update(self, interaction: discord.Interaction):
        """Atualiza o yt-dlp para a versão mais recente"""
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
            return
        
        await interaction.response.defer()
        
        try:
            import subprocess
            import sys
            
            embed = discord.Embed(
                title="🔄 Atualizando yt-dlp...",
                description="Tentando atualizar o yt-dlp para resolver bloqueios do YouTube.",
                color=discord.Color.blue()
            )
            await interaction.followup.send(embed=embed)
            
            # Tentar atualizar yt-dlp
            result = subprocess.run([
                sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"
            ], capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0:
                embed = discord.Embed(
                    title="✅ yt-dlp Atualizado!",
                    description="yt-dlp foi atualizado com sucesso. Tenta tocar música novamente.",
                    color=discord.Color.green()
                )
                embed.add_field(
                    name="💡 Dica",
                    value="Se ainda houver problemas, tenta:\n• Usar nomes de música em vez de URLs\n• Aguardar alguns minutos\n• Reiniciar o bot",
                    inline=False
                )
            else:
                embed = discord.Embed(
                    title="⚠️ Problema na Atualização",
                    description=f"Houve um problema ao atualizar:\n```\n{result.stderr[:500]}\n```",
                    color=discord.Color.orange()
                )
            
        except subprocess.TimeoutExpired:
            embed = discord.Embed(
                title="⏰ Timeout",
                description="A atualização demorou muito. Tenta novamente mais tarde.",
                color=discord.Color.orange()
            )
        except Exception as e:
            embed = discord.Embed(
                title="❌ Erro",
                description=f"Erro ao atualizar: {str(e)[:500]}",
                color=discord.Color.red()
            )
        
        await interaction.edit_original_response(embed=embed)

    @app_commands.command(name="playlist_create", description="Cria uma nova playlist pessoal")
    @app_commands.describe(nome="Nome da playlist")
    async def playlist_create(self, interaction: discord.Interaction, nome: str):
        """Criar uma nova playlist"""
        user_id = str(interaction.user.id)
        
        if user_id not in self.user_playlists:
            self.user_playlists[user_id] = {}
        
        if nome in self.user_playlists[user_id]:
            await interaction.response.send_message(f"❌ Já tens uma playlist chamada **{nome}**!", ephemeral=True)
            return
        
        if len(self.user_playlists[user_id]) >= 10:
            await interaction.response.send_message("❌ Máximo de 10 playlists por utilizador!", ephemeral=True)
            return
        
        self.user_playlists[user_id][nome] = {
            "songs": [],
            "created": datetime.utcnow().isoformat(),
            "description": ""
        }
        
        self.save_playlists()
        
        embed = discord.Embed(
            title="🎵 Playlist Criada!",
            description=f"Playlist **{nome}** criada com sucesso!",
            color=discord.Color.green()
        )
        embed.add_field(name="📝 Como usar", value="Use `/playlist_add` para adicionar músicas!", inline=False)
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="playlist_add", description="Adiciona música à playlist")
    @app_commands.describe(
        playlist="Nome da playlist",
        musica="Nome ou URL da música"
    )
    async def playlist_add(self, interaction: discord.Interaction, playlist: str, musica: str):
        """Adicionar música à playlist"""
        user_id = str(interaction.user.id)
        
        if user_id not in self.user_playlists or playlist not in self.user_playlists[user_id]:
            await interaction.response.send_message(f"❌ Playlist **{playlist}** não encontrada!", ephemeral=True)
            return
        
        await interaction.response.defer()
        
        # Procurar música
        song_data = await self.search_song(musica)
        if not song_data:
            await interaction.followup.send(f"❌ Não foi possível encontrar: **{musica}**")
            return
        
        # Adicionar à playlist
        playlist_data = self.user_playlists[user_id][playlist]
        
        if len(playlist_data["songs"]) >= 50:
            await interaction.followup.send("❌ Máximo de 50 músicas por playlist!")
            return
        
        song_info = {
            "title": song_data.get("title", "Desconhecido"),
            "url": song_data.get("webpage_url", ""),
            "duration": song_data.get("duration", 0),
            "uploader": song_data.get("uploader", "Desconhecido"),
            "added": datetime.utcnow().isoformat()
        }
        
        playlist_data["songs"].append(song_info)
        self.save_playlists()
        
        embed = discord.Embed(
            title="➕ Música Adicionada!",
            description=f"**{song_info['title']}** foi adicionada à playlist **{playlist}**!",
            color=discord.Color.green()
        )
        
        embed.add_field(
            name="📊 Total",
            value=f"{len(playlist_data['songs'])} música(s)",
            inline=True
        )
        
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="playlist_play", description="Toca uma playlist completa")
    @app_commands.describe(playlist="Nome da playlist para tocar")
    async def playlist_play(self, interaction: discord.Interaction, playlist: str):
        """Tocar playlist completa"""
        user_id = str(interaction.user.id)
        
        if user_id not in self.user_playlists or playlist not in self.user_playlists[user_id]:
            await interaction.response.send_message(f"❌ Playlist **{playlist}** não encontrada!", ephemeral=True)
            return
        
        playlist_data = self.user_playlists[user_id][playlist]
        songs = playlist_data["songs"]
        
        if not songs:
            await interaction.response.send_message(f"❌ A playlist **{playlist}** está vazia!", ephemeral=True)
            return
        
        await interaction.response.defer()
        
        # Verificar se o utilizador está num canal de voz
        if not interaction.user.voice:
            await interaction.followup.send("❌ Precisas de estar num canal de voz!")
            return
        
        # Conectar ao canal de voz se necessário
        guild_id = interaction.guild.id
        voice_channel = interaction.user.voice.channel
        
        if guild_id not in self.voice_clients or not self.voice_clients[guild_id].is_connected():
            try:
                voice_client = await voice_channel.connect()
                self.voice_clients[guild_id] = voice_client
            except Exception as e:
                await interaction.followup.send(f"❌ Erro ao conectar: {e}")
                return
        
        # Adicionar todas as músicas à fila
        queue = self.music_queues.get(guild_id, [])
        added_count = 0
        
        for song in songs:
            # Converter para formato esperado
            track = {
                "title": song["title"],
                "webpage_url": song["url"],
                "duration": song["duration"],
                "uploader": song["uploader"],
                "url": song["url"],  # Para compatibilidade
                "requester": interaction.user
            }
            queue.append(track)
            added_count += 1
        
        self.music_queues[guild_id] = queue
        
        embed = discord.Embed(
            title="🎵 Playlist Adicionada!",
            description=f"**{playlist}** foi adicionada à fila!",
            color=discord.Color.green()
        )
        
        embed.add_field(
            name="📊 Músicas Adicionadas",
            value=f"{added_count} música(s)",
            inline=True
        )
        
        embed.add_field(
            name="📋 Posição na Fila",
            value=f"{len(queue) - added_count + 1}-{len(queue)}",
            inline=True
        )
        
        await interaction.followup.send(embed=embed)
        
        # Iniciar reprodução se não estiver tocando
        if guild_id not in self.current_tracks or not self.current_tracks[guild_id]:
            await self.play_next(guild_id)

    @app_commands.command(name="playlist_list", description="Lista as tuas playlists")
    async def playlist_list(self, interaction: discord.Interaction):
        """Listar playlists do utilizador"""
        user_id = str(interaction.user.id)
        
        if user_id not in self.user_playlists or not self.user_playlists[user_id]:
            embed = discord.Embed(
                title="📝 Tuas Playlists",
                description="Ainda não tens playlists!\nUsa `/playlist_create` para criar uma.",
                color=discord.Color.blue()
            )
            await interaction.response.send_message(embed=embed)
            return
        
        embed = discord.Embed(
            title="📝 Tuas Playlists",
            color=discord.Color.blue()
        )
        
        for name, data in self.user_playlists[user_id].items():
            songs_count = len(data["songs"])
            total_duration = sum(song.get("duration", 0) for song in data["songs"])
            duration_str = self.format_duration(total_duration)
            
            embed.add_field(
                name=f"🎵 {name}",
                value=f"📊 {songs_count} música(s)\n⏱️ {duration_str}",
                inline=True
            )
        
        embed.set_footer(text=f"Total: {len(self.user_playlists[user_id])} playlist(s)")
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="voteskip", description="Vota para pular a música atual")
    async def voteskip(self, interaction: discord.Interaction):
        """Sistema de votação para pular música"""
        guild_id = interaction.guild.id
        
        if guild_id not in self.voice_clients or not self.voice_clients[guild_id].is_playing():
            await interaction.response.send_message("❌ Não há música tocando!", ephemeral=True)
            return
        
        if not interaction.user.voice or interaction.user.voice.channel != self.voice_clients[guild_id].channel:
            await interaction.response.send_message("❌ Precisas de estar no mesmo canal de voz!", ephemeral=True)
            return
        
        # Inicializar votação se necessário
        if guild_id not in self.skip_votes:
            self.skip_votes[guild_id] = set()
        
        user_id = interaction.user.id
        
        if user_id in self.skip_votes[guild_id]:
            await interaction.response.send_message("❌ Já votaste para pular esta música!", ephemeral=True)
            return
        
        # Adicionar voto
        self.skip_votes[guild_id].add(user_id)
        
        # Contar membros no canal de voz (excluindo bots)
        voice_channel = self.voice_clients[guild_id].channel
        human_members = [m for m in voice_channel.members if not m.bot]
        
        votes_needed = max(1, len(human_members) // 2 + 1)  # Maioria
        current_votes = len(self.skip_votes[guild_id])
        
        embed = discord.Embed(
            title="🗳️ Votação para Pular",
            color=discord.Color.orange()
        )
        
        if current_votes >= votes_needed:
            # Pular música
            embed.title = "⏭️ Música Pulada!"
            embed.description = "A maioria votou para pular a música!"
            embed.color = discord.Color.green()
            
            # Limpar votos
            if guild_id in self.skip_votes:
                del self.skip_votes[guild_id]
            
            # Pular
            if self.voice_clients[guild_id].is_playing():
                self.voice_clients[guild_id].stop()
            
            await interaction.response.send_message(embed=embed)
        else:
            # Mostrar progresso da votação
            embed.add_field(
                name="📊 Votos",
                value=f"{current_votes}/{votes_needed}",
                inline=True
            )
            
            embed.add_field(
                name="👥 Votaram",
                value=", ".join([f"<@{uid}>" for uid in self.skip_votes[guild_id]]),
                inline=False
            )
            
            await interaction.response.send_message(embed=embed)

    @app_commands.command(name="letra", description="Mostra a letra da música atual")
    async def letra(self, interaction: discord.Interaction):
        """Buscar letra da música atual"""
        guild_id = interaction.guild.id
        
        if guild_id not in self.current_tracks or not self.current_tracks[guild_id]:
            await interaction.response.send_message("❌ Não há música tocando!", ephemeral=True)
            return
        
        await interaction.response.defer()
        
        current_track = self.current_tracks[guild_id]
        song_title = current_track.get("title", "")
        
        # Buscar letra (implementação simples)
        # Em produção, usaria APIs como Genius, AZLyrics, etc.
        embed = discord.Embed(
            title="🎤 Letra da Música",
            description=f"**{song_title}**",
            color=discord.Color.purple()
        )
        
        # Placeholder - em produção integraria com API de letras
        embed.add_field(
            name="📝 Letra",
            value="🚧 **Funcionalidade em desenvolvimento**\n\nEm breve será possível buscar letras automaticamente!\nPor enquanto, podes procurar a letra no Google ou em sites especializados.",
            inline=False
        )
        
        embed.add_field(
            name="🔍 Sugestões",
            value="• [Genius](https://genius.com)\n• [AZLyrics](https://azlyrics.com)\n• [Letras.mus.br](https://letras.mus.br)",
            inline=False
        )
        
        embed.set_footer(text=f"Música: {current_track.get('uploader', 'Desconhecido')}")
        
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="music_retry", description="[ADMIN] Força retry de URL que falhou recentemente")
    @app_commands.describe(url="URL que falhou e está em cooldown")
    async def music_retry(self, interaction: discord.Interaction, url: str):
        """Força retry de URL que está em cache negativo"""
        try:
            # Verificar se é admin
            if not interaction.user.guild_permissions.administrator:
                await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
                return
            
            await interaction.response.defer()
            
            # Remover do cache negativo se existir
            if url in self.failed_cache:
                del self.failed_cache[url]
                self.bot.logger.info(f"🔄 Cache negativo limpo para: {url}")
            
            # Remover do cache positivo também para forçar nova extração
            if url in self.url_cache:
                del self.url_cache[url]
                self.bot.logger.info(f"🗑️ Cache positivo limpo para: {url}")
            
            # Tentar extrair novamente
            result = await self.search_song(url)
            
            if result:
                embed = discord.Embed(
                    title="✅ Retry Bem-sucedido",
                    description=f"URL foi extraída com sucesso!\n**[{result['title']}]({result['webpage_url']})**",
                    color=discord.Color.green()
                )
                embed.add_field(name="👤 Canal", value=result["uploader"], inline=True)
                if result["duration"]:
                    duration = f"{result['duration'] // 60}:{result['duration'] % 60:02d}"
                    embed.add_field(name="⏱️ Duração", value=duration, inline=True)
            else:
                embed = discord.Embed(
                    title="❌ Retry Falhou",
                    description="A URL ainda não pode ser extraída. Tente novamente mais tarde.",
                    color=discord.Color.red()
                )
            
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            self.bot.logger.error(f"Erro no comando music_retry: {e}")
            await interaction.followup.send("❌ Erro interno no comando de retry.")

    @app_commands.command(name="music_cache", description="[ADMIN] Mostra estatísticas do cache de música")
    async def music_cache(self, interaction: discord.Interaction):
        """Mostra estatísticas do cache"""
        try:
            # Verificar se é admin
            if not interaction.user.guild_permissions.administrator:
                await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
                return
            
            embed = discord.Embed(
                title="📊 Estatísticas do Cache de Música",
                color=discord.Color.blue()
            )
            
            embed.add_field(
                name="✅ Cache Positivo",
                value=f"{len(self.url_cache)} URLs em cache",
                inline=True
            )
            
            embed.add_field(
                name="❌ Cache Negativo",
                value=f"{len(self.failed_cache)} URLs falharam",
                inline=True
            )
            
            embed.add_field(
                name="⚙️ Status",
                value=f"Cache {'✅ Habilitado' if self.cache_enabled else '❌ Desabilitado'}",
                inline=True
            )
            
            # Mostrar URLs mais recentes que falharam
            if self.failed_cache:
                import time
                recent_fails = []
                current_time = time.time()
                
                for url, fail_time in sorted(self.failed_cache.items(), key=lambda x: x[1], reverse=True)[:5]:
                    minutes_ago = int((current_time - fail_time) / 60)
                    # Truncar URL se muito longo
                    display_url = url[:50] + "..." if len(url) > 50 else url
                    recent_fails.append(f"• {display_url} ({minutes_ago}m atrás)")
                
                embed.add_field(
                    name="🕒 Falhas Recentes",
                    value="\n".join(recent_fails) if recent_fails else "Nenhuma",
                    inline=False
                )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
        except Exception as e:
            self.bot.logger.error(f"Erro no comando music_cache: {e}")
            await interaction.response.send_message("❌ Erro interno no comando de cache.")

    @app_commands.command(name="voice_debug", description="[ADMIN] Diagnóstico detalhado da conexão de voz")
    async def voice_debug(self, interaction: discord.Interaction):
        """Diagnóstico detalhado da conexão de voz"""
        try:
            # Verificar se é admin
            if not interaction.user.guild_permissions.administrator:
                await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
                return
            
            embed = discord.Embed(
                title="🔧 Diagnóstico de Conexão de Voz",
                color=discord.Color.blue()
            )
            
            # Informações do usuário
            user_voice = interaction.user.voice
            embed.add_field(
                name="👤 Usuário",
                value=f"Canal: {'✅ ' + user_voice.channel.name if user_voice else '❌ Não conectado'}",
                inline=False
            )
            
            # Informações do bot
            voice_client = interaction.guild.voice_client
            if voice_client:
                embed.add_field(
                    name="🤖 Bot",
                    value=f"Canal: {voice_client.channel.name}\n"
                          f"Conectado: {'✅' if voice_client.is_connected() else '❌'}\n"
                          f"Tocando: {'✅' if voice_client.is_playing() else '❌'}\n"
                          f"Pausado: {'✅' if voice_client.is_paused() else '❌'}\n"
                          f"Latência: {voice_client.latency:.2f}ms",
                    inline=False
                )
                
                # Verificar permissões
                if user_voice and user_voice.channel:
                    perms = user_voice.channel.permissions_for(interaction.guild.me)
                    embed.add_field(
                        name="🔐 Permissões",
                        value=f"Conectar: {'✅' if perms.connect else '❌'}\n"
                              f"Falar: {'✅' if perms.speak else '❌'}\n"
                              f"Usar VAD: {'✅' if perms.use_voice_activation else '❌'}",
                        inline=True
                    )
            else:
                embed.add_field(
                    name="🤖 Bot",
                    value="❌ Não conectado a nenhum canal",
                    inline=False
                )
            
            # Informações da fila
            queue = self.get_queue(interaction.guild.id)
            embed.add_field(
                name="📋 Fila",
                value=f"Músicas: {len(queue)}\n"
                      f"Atual: {'✅ ' + queue.current['title'][:30] + '...' if queue.current else '❌ Nenhuma'}\n"
                      f"Loop: {queue.loop_mode}",
                inline=True
            )
            
            # Status do FFmpeg
            ffmpeg_status = "✅ Personalizado" if "executable" in self.ffmpeg_options else "⚠️ Sistema"
            embed.add_field(
                name="🎛️ FFmpeg",
                value=ffmpeg_status,
                inline=True
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
        except Exception as e:
            self.bot.logger.error(f"Erro no comando voice_debug: {e}")
            await interaction.response.send_message("❌ Erro interno no comando de debug.")

    @app_commands.command(name="test_ffmpeg", description="[ADMIN] Testa o FFmpeg com um URL específico")
    @app_commands.describe(url="URL para testar com FFmpeg")
    async def test_ffmpeg(self, interaction: discord.Interaction, url: str):
        """Testa o FFmpeg diretamente com um URL"""
        try:
            # Verificar se é admin
            if not interaction.user.guild_permissions.administrator:
                await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
                return
            
            await interaction.response.defer()
            
            embed = discord.Embed(
                title="🔧 Teste do FFmpeg",
                description=f"Testando URL: `{url[:100]}...`",
                color=discord.Color.blue()
            )
            
            results = []
            
            # Teste 1: FFmpegOpusAudio
            try:
                self.bot.logger.info(f"Testando FFmpegOpusAudio com: {url}")
                source = discord.FFmpegOpusAudio(url, **self.ffmpeg_options)
                source.cleanup()  # Limpar imediatamente
                results.append("✅ **FFmpegOpusAudio**: OK")
            except Exception as e:
                results.append(f"❌ **FFmpegOpusAudio**: {str(e)}")
            
            # Teste 2: FFmpegPCMAudio
            try:
                self.bot.logger.info(f"Testando FFmpegPCMAudio com: {url}")
                source = discord.FFmpegPCMAudio(url, **self.ffmpeg_pcm_options)
                source.cleanup()  # Limpar imediatamente
                results.append("✅ **FFmpegPCMAudio**: OK")
            except Exception as e:
                results.append(f"❌ **FFmpegPCMAudio**: {str(e)}")
            
            # Teste 3: FFmpeg direto (verificar se executa)
            try:
                import subprocess
                ffmpeg_cmd = [
                    self.ffmpeg_options.get("executable", "ffmpeg"),
                    "-version"
                ]
                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    version_line = result.stdout.split('\n')[0]
                    results.append(f"✅ **FFmpeg**: {version_line}")
                else:
                    results.append(f"❌ **FFmpeg**: Erro no comando")
            except Exception as e:
                results.append(f"❌ **FFmpeg**: {str(e)}")
            
            embed.add_field(
                name="📊 Resultados",
                value="\n".join(results),
                inline=False
            )
            
            # Adicionar informações das opções
            embed.add_field(
                name="⚙️ Opções Opus",
                value=f"```\nbefore: {self.ffmpeg_options['before_options']}\noptions: {self.ffmpeg_options['options']}\n```",
                inline=False
            )
            
            embed.add_field(
                name="⚙️ Opções PCM",
                value=f"```\nbefore: {self.ffmpeg_pcm_options['before_options']}\noptions: {self.ffmpeg_pcm_options['options']}\n```",
                inline=False
            )
            
            await interaction.followup.send(embed=embed)
            
        except Exception as e:
            self.bot.logger.error(f"Erro no comando test_ffmpeg: {e}")
            await interaction.followup.send("❌ Erro interno no comando de teste FFmpeg.")


import json
from datetime import datetime


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(MusicCog(bot))
