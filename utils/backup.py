"""
Sistema de Backup Automático para EPA BOT
Cria backups periódicos da base de dados e ficheiros críticos
"""

import asyncio
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
import logging
from typing import Optional


class BackupSystem:
    """Sistema de backup automático"""
    
    def __init__(self, bot, backup_dir: str = "backups", interval_hours: int = 24):
        self.bot = bot
        self.backup_dir = Path(backup_dir)
        self.interval_hours = interval_hours
        self.logger = logging.getLogger("EPA BOT.Backup")
        self.backup_task: Optional[asyncio.Task] = None
        
        # Criar diretório de backups
        self.backup_dir.mkdir(exist_ok=True)
    
    def start(self):
        """Inicia o sistema de backup automático"""
        if self.backup_task is None or self.backup_task.done():
            self.backup_task = asyncio.create_task(self._backup_loop())
            self.logger.info(f"✅ Sistema de backup iniciado (intervalo: {self.interval_hours}h)")
    
    def stop(self):
        """Para o sistema de backup"""
        if self.backup_task and not self.backup_task.done():
            self.backup_task.cancel()
            self.logger.info("🛑 Sistema de backup parado")
    
    async def _backup_loop(self):
        """Loop principal de backup"""
        while True:
            try:
                await asyncio.sleep(self.interval_hours * 3600)  # Converter horas para segundos
                await self.create_backup()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Erro no loop de backup: {e}", exc_info=True)
    
    async def create_backup(self) -> str:
        """Cria um backup completo"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"epa_bot_backup_{timestamp}"
        backup_path = self.backup_dir / backup_name
        
        try:
            self.logger.info(f"📦 Criando backup: {backup_name}")
            
            # Criar diretório temporário para o backup
            backup_path.mkdir(exist_ok=True)
            
            # Backup da base de dados
            db_file = Path("data/epa_bot.db")
            if db_file.exists():
                shutil.copy2(db_file, backup_path / "epa_bot.db")
                self.logger.info("✅ Base de dados copiada")
            
            # Backup dos ficheiros JSON (caso ainda existam)
            data_dir = Path("data")
            if data_dir.exists():
                for json_file in data_dir.glob("*.json"):
                    shutil.copy2(json_file, backup_path / json_file.name)
                self.logger.info("✅ Ficheiros JSON copiados")
            
            # Backup das configurações
            config_files = [".env"]
            for config_file in config_files:
                file_path = Path(config_file)
                if file_path.exists():
                    shutil.copy2(file_path, backup_path / file_path.name)
            
            # Criar arquivo ZIP
            zip_path = self.backup_dir / f"{backup_name}.zip"
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file in backup_path.rglob("*"):
                    if file.is_file():
                        zipf.write(file, file.relative_to(backup_path))
            
            # Remover diretório temporário
            shutil.rmtree(backup_path)
            
            # Limpar backups antigos (manter apenas os últimos 7)
            await self._cleanup_old_backups(keep=7)
            
            self.logger.info(f"✅ Backup criado com sucesso: {zip_path}")
            return str(zip_path)
            
        except Exception as e:
            self.logger.error(f"❌ Erro ao criar backup: {e}", exc_info=True)
            raise
    
    async def _cleanup_old_backups(self, keep: int = 7):
        """Remove backups antigos, mantendo apenas os mais recentes"""
        try:
            backups = sorted(self.backup_dir.glob("epa_bot_backup_*.zip"), 
                           key=lambda x: x.stat().st_mtime, reverse=True)
            
            for old_backup in backups[keep:]:
                old_backup.unlink()
                self.logger.info(f"🗑️ Backup antigo removido: {old_backup.name}")
                
        except Exception as e:
            self.logger.error(f"Erro ao limpar backups antigos: {e}")
    
    async def restore_backup(self, backup_file: str):
        """Restaura um backup"""
        backup_path = Path(backup_file)
        
        if not backup_path.exists():
            raise FileNotFoundError(f"Backup não encontrado: {backup_file}")
        
        try:
            self.logger.info(f"📥 Restaurando backup: {backup_path.name}")
            
            # Criar backup do estado atual antes de restaurar
            current_backup = await self.create_backup()
            self.logger.info(f"✅ Backup do estado atual criado: {current_backup}")
            
            # Extrair backup
            extract_dir = self.backup_dir / "restore_temp"
            extract_dir.mkdir(exist_ok=True)
            
            with zipfile.ZipFile(backup_path, 'r') as zipf:
                zipf.extractall(extract_dir)
            
            # Restaurar base de dados
            db_backup = extract_dir / "epa_bot.db"
            if db_backup.exists():
                shutil.copy2(db_backup, "data/epa_bot.db")
                self.logger.info("✅ Base de dados restaurada")
            
            # Restaurar ficheiros JSON
            for json_file in extract_dir.glob("*.json"):
                shutil.copy2(json_file, f"data/{json_file.name}")
                self.logger.info(f"✅ {json_file.name} restaurado")
            
            # Limpar diretório temporário
            shutil.rmtree(extract_dir)
            
            self.logger.info("✅ Backup restaurado com sucesso!")
            
        except Exception as e:
            self.logger.error(f"❌ Erro ao restaurar backup: {e}", exc_info=True)
            raise
    
    def list_backups(self) -> list:
        """Lista todos os backups disponíveis"""
        backups = sorted(self.backup_dir.glob("epa_bot_backup_*.zip"), 
                        key=lambda x: x.stat().st_mtime, reverse=True)
        
        return [{
            "name": backup.name,
            "path": str(backup),
            "size": backup.stat().st_size,
            "created": datetime.fromtimestamp(backup.stat().st_mtime)
        } for backup in backups]
