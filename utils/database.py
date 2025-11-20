"""
Sistema de Base de Dados para EPA BOT
Migração de JSON para SQLite com suporte assíncrono
"""

import aiosqlite
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any
import logging


class Database:
    """Classe principal para gestão da base de dados"""
    
    def __init__(self, db_path: str = "data/epa_bot.db"):
        self.db_path = db_path
        self.logger = logging.getLogger("EPA BOT.Database")
        
    async def init_db(self):
        """Inicializa a base de dados e cria as tabelas"""
        async with aiosqlite.connect(self.db_path) as db:
            # Tabela de utilizadores (economia)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    balance INTEGER DEFAULT 2500,
                    last_daily TEXT,
                    daily_streak INTEGER DEFAULT 0,
                    total_earned INTEGER DEFAULT 2500,
                    total_donated INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Tabela de items do utilizador
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    item_data TEXT,
                    acquired_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                )
            """)
            
            # Tabela de XP e níveis (social)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_levels (
                    user_id TEXT,
                    guild_id TEXT,
                    xp INTEGER DEFAULT 0,
                    level INTEGER DEFAULT 1,
                    messages_sent INTEGER DEFAULT 0,
                    last_message_at REAL DEFAULT 0,
                    PRIMARY KEY (user_id, guild_id)
                )
            """)
            
            # Tabela de reputação
            await db.execute("""
                CREATE TABLE IF NOT EXISTS user_reputation (
                    user_id TEXT,
                    guild_id TEXT,
                    reputation INTEGER DEFAULT 0,
                    PRIMARY KEY (user_id, guild_id)
                )
            """)
            
            # Tabela de configurações de boas-vindas
            await db.execute("""
                CREATE TABLE IF NOT EXISTS welcome_config (
                    guild_id TEXT PRIMARY KEY,
                    channel_id TEXT,
                    message TEXT,
                    enabled INTEGER DEFAULT 1,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Tabela de tickets
            await db.execute("""
                CREATE TABLE IF NOT EXISTS tickets (
                    ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    channel_id TEXT UNIQUE NOT NULL,
                    user_id TEXT NOT NULL,
                    status TEXT DEFAULT 'open',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    closed_at TEXT,
                    closed_by TEXT
                )
            """)
            
            # Tabela de transações (auditoria)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_user_id TEXT,
                    to_user_id TEXT,
                    amount INTEGER NOT NULL,
                    transaction_type TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Tabela de logs de moderação
            await db.execute("""
                CREATE TABLE IF NOT EXISTS moderation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    moderator_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    reason TEXT,
                    duration INTEGER,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Tabela de avisos (warnings)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS warnings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    moderator_id TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Tabela de estatísticas de jogos
            await db.execute("""
                CREATE TABLE IF NOT EXISTS game_stats (
                    user_id TEXT NOT NULL,
                    game_type TEXT NOT NULL,
                    wins INTEGER DEFAULT 0,
                    losses INTEGER DEFAULT 0,
                    draws INTEGER DEFAULT 0,
                    total_games INTEGER DEFAULT 0,
                    total_earnings INTEGER DEFAULT 0,
                    best_streak INTEGER DEFAULT 0,
                    current_streak INTEGER DEFAULT 0,
                    last_played TEXT,
                    PRIMARY KEY (user_id, game_type)
                )
            """)
            
            # Tabela de torneios
            await db.execute("""
                CREATE TABLE IF NOT EXISTS tournaments (
                    tournament_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_type TEXT NOT NULL,
                    creator_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    start_time TEXT,
                    end_time TEXT,
                    prize_pool INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'open',
                    max_players INTEGER DEFAULT 8,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Tabela de participantes em torneios
            await db.execute("""
                CREATE TABLE IF NOT EXISTS tournament_participants (
                    tournament_id INTEGER,
                    user_id TEXT NOT NULL,
                    score INTEGER DEFAULT 0,
                    rank INTEGER,
                    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id)
                )
            """)
            
            # Criar índices para melhor performance
            await db.execute("CREATE INDEX IF NOT EXISTS idx_user_items_user ON user_items(user_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_user_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_user_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_mod_logs_guild ON moderation_logs(guild_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(user_id, guild_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_game_stats_user ON game_stats(user_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_game_stats_type ON game_stats(game_type)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_tournaments_guild ON tournaments(guild_id)")
            
            await db.commit()
            self.logger.info("✅ Base de dados inicializada com sucesso")
    
    async def migrate_from_json(self):
        """Migra dados dos ficheiros JSON existentes para SQLite"""
        self.logger.info("🔄 Iniciando migração de JSON para SQLite...")
        
        # Migrar economia
        economy_file = Path("data/economy_simple.json")
        if economy_file.exists():
            with open(economy_file, 'r', encoding='utf-8') as f:
                economy_data = json.load(f)
            
            async with aiosqlite.connect(self.db_path) as db:
                for user_id, data in economy_data.get("users", {}).items():
                    await db.execute("""
                        INSERT OR REPLACE INTO users 
                        (user_id, balance, last_daily, daily_streak, total_earned, total_donated)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        user_id,
                        data.get("balance", 2500),
                        data.get("last_daily"),
                        data.get("daily_streak", 0),
                        data.get("total_earned", 2500),
                        data.get("total_donated", 0)
                    ))
                    
                    # Migrar items
                    for item in data.get("items", []):
                        await db.execute("""
                            INSERT INTO user_items (user_id, item_name, item_data)
                            VALUES (?, ?, ?)
                        """, (user_id, str(item), json.dumps(item)))
                
                await db.commit()
                self.logger.info(f"✅ Migrados {len(economy_data.get('users', {}))} utilizadores da economia")
        
        # Migrar dados sociais
        social_file = Path("data/social_data.json")
        if social_file.exists():
            with open(social_file, 'r', encoding='utf-8') as f:
                social_data = json.load(f)
            
            async with aiosqlite.connect(self.db_path) as db:
                for guild_id, users in social_data.get("guilds", {}).items():
                    for user_id, data in users.items():
                        await db.execute("""
                            INSERT OR REPLACE INTO user_levels 
                            (user_id, guild_id, xp, level, messages_sent, last_message_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (
                            user_id,
                            guild_id,
                            data.get("xp", 0),
                            data.get("level", 1),
                            data.get("messages_sent", 0),
                            data.get("last_message", 0)
                        ))
                        
                        await db.execute("""
                            INSERT OR REPLACE INTO user_reputation 
                            (user_id, guild_id, reputation)
                            VALUES (?, ?, ?)
                        """, (user_id, guild_id, data.get("reputation", 0)))
                
                await db.commit()
                total_users = sum(len(users) for users in social_data.get("guilds", {}).values())
                self.logger.info(f"✅ Migrados {total_users} utilizadores dos dados sociais")
        
        # Migrar configurações de boas-vindas
        welcome_file = Path("data/welcome_config.json")
        if welcome_file.exists():
            with open(welcome_file, 'r', encoding='utf-8') as f:
                welcome_data = json.load(f)
            
            async with aiosqlite.connect(self.db_path) as db:
                for guild_id, config in welcome_data.get("guilds", {}).items():
                    await db.execute("""
                        INSERT OR REPLACE INTO welcome_config 
                        (guild_id, channel_id, message, enabled)
                        VALUES (?, ?, ?, ?)
                    """, (
                        guild_id,
                        config.get("channel_id"),
                        config.get("message"),
                        1 if config.get("enabled", True) else 0
                    ))
                
                await db.commit()
                self.logger.info(f"✅ Migradas {len(welcome_data.get('guilds', {}))} configurações de boas-vindas")
        
        self.logger.info("🎉 Migração concluída com sucesso!")
    
    # --- Métodos de Economia ---
    
    async def get_user_balance(self, user_id: str) -> int:
        """Obtém o saldo de um utilizador"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT balance FROM users WHERE user_id = ?", (user_id,)
            ) as cursor:
                row = await cursor.fetchone()
                return row[0] if row else 2500
    
    async def add_money(self, user_id: str, amount: int, transaction_type: str = "earn", description: str = None):
        """Adiciona dinheiro a um utilizador"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO users (user_id, balance, total_earned)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    balance = balance + ?,
                    total_earned = total_earned + ?,
                    updated_at = CURRENT_TIMESTAMP
            """, (user_id, 2500 + amount, amount, amount, amount))
            
            # Registar transação
            await db.execute("""
                INSERT INTO transactions (to_user_id, amount, transaction_type, description)
                VALUES (?, ?, ?, ?)
            """, (user_id, amount, transaction_type, description))
            
            await db.commit()
    
    async def remove_money(self, user_id: str, amount: int, transaction_type: str = "spend", description: str = None):
        """Remove dinheiro de um utilizador"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE users 
                SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (amount, user_id))
            
            # Registar transação
            await db.execute("""
                INSERT INTO transactions (from_user_id, amount, transaction_type, description)
                VALUES (?, ?, ?, ?)
            """, (user_id, amount, transaction_type, description))
            
            await db.commit()
    
    async def transfer_money(self, from_user: str, to_user: str, amount: int):
        """Transfere dinheiro entre utilizadores"""
        async with aiosqlite.connect(self.db_path) as db:
            # Remover do remetente
            await db.execute("""
                UPDATE users 
                SET balance = balance - ?, total_donated = total_donated + ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (amount, amount, from_user))
            
            # Adicionar ao destinatário
            await db.execute("""
                INSERT INTO users (user_id, balance, total_earned)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    balance = balance + ?,
                    total_earned = total_earned + ?,
                    updated_at = CURRENT_TIMESTAMP
            """, (to_user, 2500 + amount, amount, amount, amount))
            
            # Registar transação
            await db.execute("""
                INSERT INTO transactions (from_user_id, to_user_id, amount, transaction_type, description)
                VALUES (?, ?, ?, 'transfer', 'Transferência entre utilizadores')
            """, (from_user, to_user, amount))
            
            await db.commit()
    
    async def get_top_richest(self, limit: int = 10) -> List[Dict]:
        """Obtém os utilizadores mais ricos"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("""
                SELECT user_id, balance FROM users 
                ORDER BY balance DESC LIMIT ?
            """, (limit,)) as cursor:
                rows = await cursor.fetchall()
                return [{"user_id": row[0], "balance": row[1]} for row in rows]
    
    # --- Métodos de XP/Níveis ---
    
    async def add_xp(self, user_id: str, guild_id: str, xp: int) -> Dict:
        """Adiciona XP a um utilizador e calcula nível"""
        async with aiosqlite.connect(self.db_path) as db:
            # Obter XP atual
            async with db.execute("""
                SELECT xp, level FROM user_levels 
                WHERE user_id = ? AND guild_id = ?
            """, (user_id, guild_id)) as cursor:
                row = await cursor.fetchone()
                current_xp = row[0] if row else 0
                current_level = row[1] if row else 1
            
            new_xp = current_xp + xp
            new_level = int((new_xp / 100) ** 0.5) + 1
            leveled_up = new_level > current_level
            
            # Atualizar XP e nível
            await db.execute("""
                INSERT INTO user_levels (user_id, guild_id, xp, level, messages_sent)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(user_id, guild_id) DO UPDATE SET
                    xp = ?,
                    level = ?,
                    messages_sent = messages_sent + 1,
                    last_message_at = ?
            """, (user_id, guild_id, new_xp, new_level, new_xp, new_level, datetime.now().timestamp()))
            
            await db.commit()
            
            return {
                "xp": new_xp,
                "level": new_level,
                "leveled_up": leveled_up,
                "old_level": current_level
            }
    
    async def get_user_level(self, user_id: str, guild_id: str) -> Dict:
        """Obtém informações de nível de um utilizador"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("""
                SELECT xp, level, messages_sent FROM user_levels 
                WHERE user_id = ? AND guild_id = ?
            """, (user_id, guild_id)) as cursor:
                row = await cursor.fetchone()
                if row:
                    return {"xp": row[0], "level": row[1], "messages": row[2]}
                return {"xp": 0, "level": 1, "messages": 0}
    
    async def get_leaderboard(self, guild_id: str, limit: int = 10) -> List[Dict]:
        """Obtém o leaderboard de XP"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("""
                SELECT user_id, xp, level FROM user_levels 
                WHERE guild_id = ?
                ORDER BY xp DESC LIMIT ?
            """, (guild_id, limit)) as cursor:
                rows = await cursor.fetchall()
                return [{"user_id": row[0], "xp": row[1], "level": row[2]} for row in rows]
    
    # --- Métodos de Moderação ---
    
    async def add_warning(self, guild_id: str, user_id: str, moderator_id: str, reason: str):
        """Adiciona um aviso a um utilizador"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
                VALUES (?, ?, ?, ?)
            """, (guild_id, user_id, moderator_id, reason))
            
            await db.execute("""
                INSERT INTO moderation_logs (guild_id, user_id, moderator_id, action, reason)
                VALUES (?, ?, ?, 'warn', ?)
            """, (guild_id, user_id, moderator_id, reason))
            
            await db.commit()
    
    async def get_warnings(self, guild_id: str, user_id: str) -> List[Dict]:
        """Obtém os avisos de um utilizador"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("""
                SELECT id, moderator_id, reason, created_at FROM warnings 
                WHERE guild_id = ? AND user_id = ? AND active = 1
                ORDER BY created_at DESC
            """, (guild_id, user_id)) as cursor:
                rows = await cursor.fetchall()
                return [{
                    "id": row[0],
                    "moderator_id": row[1],
                    "reason": row[2],
                    "created_at": row[3]
                } for row in rows]
    
    async def log_moderation(self, guild_id: str, user_id: str, moderator_id: str, 
                            action: str, reason: str = None, duration: int = None):
        """Registra uma ação de moderação"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO moderation_logs (guild_id, user_id, moderator_id, action, reason, duration)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (guild_id, user_id, moderator_id, action, reason, duration))
            await db.commit()
    
    # --- Métodos de Estatísticas de Jogos ---
    
    async def update_game_stats(self, user_id: str, game_type: str, result: str, earnings: int = 0):
        """Atualiza estatísticas de jogo de um utilizador"""
        async with aiosqlite.connect(self.db_path) as db:
            # Verificar se já existe
            async with db.execute(
                "SELECT * FROM game_stats WHERE user_id = ? AND game_type = ?",
                (user_id, game_type)
            ) as cursor:
                existing = await cursor.fetchone()
            
            if existing:
                wins = existing[2] + (1 if result == "win" else 0)
                losses = existing[3] + (1 if result == "loss" else 0)
                draws = existing[4] + (1 if result == "draw" else 0)
                total_games = existing[5] + 1
                total_earnings = existing[6] + earnings
                current_streak = existing[8] + 1 if result == "win" else 0
                best_streak = max(existing[7], current_streak)
                
                await db.execute("""
                    UPDATE game_stats 
                    SET wins = ?, losses = ?, draws = ?, total_games = ?,
                        total_earnings = ?, best_streak = ?, current_streak = ?,
                        last_played = CURRENT_TIMESTAMP
                    WHERE user_id = ? AND game_type = ?
                """, (wins, losses, draws, total_games, total_earnings, 
                      best_streak, current_streak, user_id, game_type))
            else:
                wins = 1 if result == "win" else 0
                losses = 1 if result == "loss" else 0
                draws = 1 if result == "draw" else 0
                current_streak = 1 if result == "win" else 0
                
                await db.execute("""
                    INSERT INTO game_stats 
                    (user_id, game_type, wins, losses, draws, total_games, 
                     total_earnings, best_streak, current_streak, last_played)
                    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (user_id, game_type, wins, losses, draws, earnings, 
                      current_streak, current_streak))
            
            await db.commit()
    
    async def get_game_stats(self, user_id: str, game_type: str = None):
        """Obtém estatísticas de jogo de um utilizador"""
        async with aiosqlite.connect(self.db_path) as db:
            if game_type:
                async with db.execute(
                    "SELECT * FROM game_stats WHERE user_id = ? AND game_type = ?",
                    (user_id, game_type)
                ) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        return {
                            "wins": row[2], "losses": row[3], "draws": row[4],
                            "total_games": row[5], "total_earnings": row[6],
                            "best_streak": row[7], "current_streak": row[8],
                            "last_played": row[9]
                        }
            else:
                async with db.execute(
                    "SELECT * FROM game_stats WHERE user_id = ?",
                    (user_id,)
                ) as cursor:
                    rows = await cursor.fetchall()
                    stats = {}
                    for row in rows:
                        stats[row[1]] = {
                            "wins": row[2], "losses": row[3], "draws": row[4],
                            "total_games": row[5], "total_earnings": row[6],
                            "best_streak": row[7], "current_streak": row[8],
                            "last_played": row[9]
                        }
                    return stats
        return {}
    
    async def get_game_leaderboard(self, game_type: str, limit: int = 10):
        """Obtém leaderboard de um jogo específico"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute("""
                SELECT user_id, wins, total_games, total_earnings, best_streak
                FROM game_stats
                WHERE game_type = ?
                ORDER BY wins DESC, total_earnings DESC
                LIMIT ?
            """, (game_type, limit)) as cursor:
                rows = await cursor.fetchall()
                return [
                    {
                        "user_id": row[0],
                        "wins": row[1],
                        "total_games": row[2],
                        "total_earnings": row[3],
                        "best_streak": row[4]
                    }
                    for row in rows
                ]


# Instância global
db_instance = None

async def get_database() -> Database:
    """Obtém a instância da base de dados"""
    global db_instance
    if db_instance is None:
        db_instance = Database()
        await db_instance.init_db()
    return db_instance
