"""
EPA BOT - Bot Discord Modernizado

Autor: Droppers
Data: Agosto 2025
"""

import asyncio
import os
import sys
from pathlib import Path

import discord
from discord.ext import commands
from dotenv import load_dotenv

# Adicionar a directoria do projecto ao path para imports
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from config.settings import Config
from utils.logger import setup_logging
from utils.database import get_database
from utils.backup import BackupSystem


class EPABot(commands.Bot):
    """Classe principal do bot EPA BOT"""
    
    def __init__(self):
        # Carregar configurações
        load_dotenv()
        self.config = Config.from_env()
        self.config.validate()
        
        # Configurar logging
        self.logger = setup_logging(
            level=self.config.log_level,
            log_file="logs/bot.log"
        )
        
        # Configurar intents
        intents = discord.Intents.default()
        intents.message_content = True
        intents.voice_states = True
        intents.members = True
        
        # Inicializar bot
        super().__init__(
            command_prefix=self.config.command_prefix,
            intents=intents,
            description="EPA BOT - Bot Discord para o servidor EPA",
            help_command=None,  # Desactivar comando help padrão
            case_insensitive=True
        )
        
        # Sistemas adicionais
        self.db = None
        self.backup_system = None
        
        self.initial_extensions = [
            "cogs.help",
            "cogs.tickets",
            "cogs.fun",  
            "cogs.games",
            "cogs.music",
            "cogs.economy",
            "cogs.utilidades",
            "cogs.social",
            "cogs.games_extra",
            "cogs.moderation",      # Novo: Sistema de moderação
            "cogs.monitoring",      # Novo: Monitorização
        ]

    async def setup_hook(self):
        """Hook executado durante a inicialização do bot"""
        self.logger.info("🚀 A iniciar configuração do bot...")
        
        # Inicializar base de dados
        try:
            self.db = await get_database()
            self.logger.info("✅ Base de dados inicializada")
            
            # Migrar dados JSON se existirem
            from pathlib import Path
            if Path("data/economy_simple.json").exists():
                self.logger.info("🔄 Detectados ficheiros JSON antigos, a migrar...")
                await self.db.migrate_from_json()
        except Exception as e:
            self.logger.error(f"❌ Erro ao inicializar base de dados: {e}")
        
        # Inicializar sistema de backup
        try:
            self.backup_system = BackupSystem(self, interval_hours=24)
            self.backup_system.start()
            self.logger.info("✅ Sistema de backup inicializado")
        except Exception as e:
            self.logger.error(f"❌ Erro ao inicializar backup: {e}")
        
        # Carregar extensões (cogs)
        for extension in self.initial_extensions:
            try:
                await self.load_extension(extension)
                self.logger.info(f"✅ Cog carregado: {extension}")
            except Exception as e:
                self.logger.error(f"❌ Erro ao carregar {extension}: {e}")
        
        # Sincronizar comandos slash APENAS para o servidor específico
        try:
            if self.config.server_id:
                guild = discord.Object(id=self.config.server_id)
                synced = await self.tree.sync(guild=guild)
                self.logger.info(f"✅ {len(synced)} comandos sincronizados para o servidor {self.config.server_id}")
                
                if len(synced) == 0:
                    self.logger.warning("⚠️ NENHUM comando foi sincronizado! A tentar sincronização global...")
                    # Fallback para sincronização global se a do servidor falhar
                    synced_global = await self.tree.sync()
                    self.logger.info(f"✅ {len(synced_global)} comandos sincronizados globalmente")
                    
            else:
                self.logger.error("❌ server_id não configurado! Os comandos não foram sincronizados.")
                
            # Log dos comandos carregados
            total_commands = len(self.tree.get_commands())
            self.logger.info(f"📋 Total de comandos na árvore: {total_commands}")
            
        except Exception as e:
            self.logger.error(f"❌ Erro ao sincronizar comandos: {e}")
            import traceback
            self.logger.error(traceback.format_exc())

    async def on_ready(self):
        """Evento executado quando o bot está pronto"""
        self.logger.info(f"🤖 {self.user} está online!")
        self.logger.info(f"📊 Ligado a {len(self.guilds)} servidor(es)")
        self.logger.info(f"👥 A servir {len(set(self.get_all_members()))} utilizador(es)")
        
        # Configurar estado do bot
        activity = discord.Game(name="Servidor EPA | /help")
        await self.change_presence(status=discord.Status.online, activity=activity)

    async def on_guild_join(self, guild):
        """Evento executado quando o bot entra num servidor"""
        self.logger.info(f"📥 Entrei no servidor: {guild.name} (ID: {guild.id})")

    async def on_guild_remove(self, guild):
        """Evento executado quando o bot sai de um servidor"""
        self.logger.info(f"📤 Saí do servidor: {guild.name} (ID: {guild.id})")

    async def on_command_error(self, ctx, error):
        """Tratamento global de erros de comandos"""
        
        # Ignorar erros de comandos não encontrados
        if isinstance(error, commands.CommandNotFound):
            return
        
        # Tratamento de erros específicos
        if isinstance(error, commands.MissingPermissions):
            await ctx.send("❌ Não tens permissão para usar este comando!")
        elif isinstance(error, commands.BotMissingPermissions):
            await ctx.send("❌ Não tenho as permissões necessárias para executar este comando!")
        elif isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(f"❌ Argumento obrigatório em falta: `{error.param.name}`")
        elif isinstance(error, commands.BadArgument):
            await ctx.send("❌ Argumento inválido fornecido!")
        elif isinstance(error, commands.CommandOnCooldown):
            await ctx.send(f"❌ Comando em pausa! Tenta novamente em {error.retry_after:.1f}s")
        else:
            # Log do erro completo
            self.logger.error(f"Erro não tratado no comando {ctx.command}: {error}", exc_info=error)
            
            # Enviar mensagem genérica para o utilizador
            embed = discord.Embed(
                title="❌ Erro Interno",
                description="Ocorreu um erro inesperado. O problema foi registado e será investigado.",
                color=discord.Color.red()
            )
            embed.set_footer(text="Se o problema persistir, contacta um administrador.")
            await ctx.send(embed=embed)

    async def on_app_command_error(self, interaction: discord.Interaction, error):
        """Tratamento global de erros de comandos slash"""
        
        # Se a interacção já foi respondida, usar followup
        if interaction.response.is_done():
            send_func = interaction.followup.send
        else:
            send_func = interaction.response.send_message
        
        if isinstance(error, discord.app_commands.MissingPermissions):
            await send_func("❌ Não tens permissão para usar este comando!", ephemeral=True)
        elif isinstance(error, discord.app_commands.BotMissingPermissions):
            await send_func("❌ Não tenho as permissões necessárias!", ephemeral=True)
        elif isinstance(error, discord.app_commands.CommandOnCooldown):
            await send_func(f"❌ Comando em pausa! Tenta novamente em {error.retry_after:.1f}s", ephemeral=True)
        else:
            self.logger.error(f"Erro não tratado no comando slash: {error}", exc_info=error)
            await send_func("❌ Ocorreu um erro inesperado!", ephemeral=True)

    async def close(self):
        """Limpeza quando o bot é desligado"""
        self.logger.info("🔄 A desligar bot...")
        await super().close()


async def main():
    """Função principal para executar o bot"""
    
    # Criar directórios necessários
    os.makedirs("logs", exist_ok=True)
    
    # Criar e executar o bot
    bot = EPABot()
    
    try:
        await bot.start(bot.config.discord_token)
    except KeyboardInterrupt:
        bot.logger.info("🛑 Bot interrompido pelo utilizador")
    except Exception as e:
        bot.logger.critical(f"💥 Erro fatal: {e}", exc_info=True)
    finally:
        if not bot.is_closed():
            await bot.close()


if __name__ == "__main__":
    # Verificar versão do Python
    if sys.version_info < (3, 8):
        print("❌ É necessário Python 3.8 ou superior!")
        sys.exit(1)
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Bot interrompido pelo utilizador")
    except Exception as e:
        print(f"💥 Erro fatal: {e}")
        sys.exit(1)
