import os
from dataclasses import dataclass
from typing import Optional

@dataclass
class Config:
    """Configuração do bot"""
    
    # Tokens e IDs
    discord_token: str
    openai_token: Optional[str] = None
    owner_ids: list[int] = None  # IDs dos donos do bot
    
    # Configurações do servidor (use IDs do seu servidor)
    server_id: int = 0  # ID do seu servidor
    mod_role_id: int = 0  # ID da role de moderador
    ticket_category_id: int = 0  # ID da categoria para tickets
    
    # Configurações de comando
    command_prefix: str = "!"
    
    # Configurações de música
    ffmpeg_path: str = "bin\\ffmpeg\\ffmpeg.exe"
    max_queue_size: int = 50
    music_timeout: int = 15  # Timeout para extração de música em segundos
    ytdl_format: str = "bestaudio"  # Formato padrão do yt-dlp
    enable_music_cache: bool = True  # Cache de URLs extraídas
    
    # Configurações de logging
    log_level: str = "INFO"
    music_debug: bool = False  # Log detalhado para música
    
    # Configurações de idioma
    language: str = "en"  # 'en' para English, 'pt' para Português
    
    @classmethod
    def from_env(cls) -> "Config":
        """Cria configuração a partir de variáveis de ambiente"""
        # Parse owner IDs
        owner_ids_str = os.getenv("OWNER_IDS", "")
        owner_ids = [int(id.strip()) for id in owner_ids_str.split(",") if id.strip()] if owner_ids_str else []
        
        return cls(
            discord_token=os.getenv("DISCORD_TOKEN", ""),
            openai_token=os.getenv("OPENAI_TOKEN"),
            owner_ids=owner_ids,
            server_id=int(os.getenv("SERVER_ID", "0")),
            mod_role_id=int(os.getenv("MOD_ROLE_ID", "0")),
            ticket_category_id=int(os.getenv("TICKET_CATEGORY_ID", "0")),
            command_prefix=os.getenv("COMMAND_PREFIX", "!"),
            ffmpeg_path=os.getenv("FFMPEG_PATH", "bin\\ffmpeg\\ffmpeg.exe"),
            max_queue_size=int(os.getenv("MAX_QUEUE_SIZE", "50")),
            music_timeout=int(os.getenv("MUSIC_TIMEOUT", "15")),
            ytdl_format=os.getenv("YTDL_FORMAT", "bestaudio"),
            enable_music_cache=os.getenv("ENABLE_MUSIC_CACHE", "True").lower() == "true",
            log_level=os.getenv("LOG_LEVEL", "INFO"),
            music_debug=os.getenv("MUSIC_DEBUG", "False").lower() == "true",
            language=os.getenv("BOT_LANGUAGE", "en")
        )
    
    def validate(self) -> bool:
        """Valida se as configurações obrigatórias estão presentes"""
        if not self.discord_token:
            raise ValueError("DISCORD_TOKEN é obrigatório")
        return True
