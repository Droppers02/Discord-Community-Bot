import logging
import sys
from pathlib import Path
from typing import Optional
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler

def setup_logging(level: str = "INFO", log_file: Optional[str] = None) -> logging.Logger:
    """
    Configura o sistema de logging do bot com rotação automática
    
    Args:
        level: Nível de logging (DEBUG, INFO, WARNING, ERROR)
        log_file: Caminho para arquivo de log (opcional)
    
    Returns:
        Logger configurado
    """
    
    # Criar logger principal
    logger = logging.getLogger("EPA BOT")
    logger.setLevel(getattr(logging, level.upper()))
    
    # Limpar handlers existentes
    logger.handlers.clear()
    
    # Formato das mensagens (mais detalhado)
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Formato simplificado para console
    console_formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%H:%M:%S'
    )
    
    # Handler para console
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # Handler para arquivo com rotação (se especificado)
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Rotação por tamanho: máximo 5MB por arquivo, manter 5 backups
        file_handler = RotatingFileHandler(
            log_path,
            maxBytes=5 * 1024 * 1024,  # 5MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        
        # Handler adicional para erros críticos
        error_log = log_path.parent / "errors.log"
        error_handler = RotatingFileHandler(
            error_log,
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding='utf-8'
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(formatter)
        logger.addHandler(error_handler)
    
    # Configurar loggers do discord.py
    discord_logger = logging.getLogger('discord')
    discord_logger.setLevel(logging.WARNING)
    
    # Configurar logger HTTP do discord
    discord_http = logging.getLogger('discord.http')
    discord_http.setLevel(logging.WARNING)
    
    logger.info("✅ Sistema de logging inicializado com rotação automática")
    
    return logger


# Criar instância global do logger para importação em outros módulos
# Usa o logger "EPA BOT" que pode já estar configurado
def get_logger(name: str = "EPA BOT") -> logging.Logger:
    """Retorna o logger configurado"""
    return logging.getLogger(name)


# Logger padrão para uso em cogs
bot_logger = get_logger()
