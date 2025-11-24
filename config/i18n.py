"""
Sistema de Internacionalização (i18n)

Suporta múltiplos idiomas para o bot.
Branch 'main' = Português de Portugal
Branch 'en' = English
"""

from typing import Dict, Any


class Translator:
    """Sistema de tradução para o bot"""
    
    def __init__(self, language: str = "en"):
        """
        Inicializar tradutor
        
        Args:
            language: Código do idioma ('en' ou 'pt')
        """
        self.language = language
        self.translations = TRANSLATIONS.get(language, TRANSLATIONS["en"])
    
    def get(self, key: str, **kwargs) -> str:
        """
        Obter tradução para uma chave
        
        Args:
            key: Chave da tradução (ex: 'common.error')
            **kwargs: Variáveis para formatação
        
        Returns:
            String traduzida e formatada
        """
        keys = key.split('.')
        value = self.translations
        
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k, key)
            else:
                return key
        
        if isinstance(value, str) and kwargs:
            try:
                return value.format(**kwargs)
            except KeyError:
                return value
        
        return value if isinstance(value, str) else key
    
    def __call__(self, key: str, **kwargs) -> str:
        """Atalho para get()"""
        return self.get(key, **kwargs)


# Traduções disponíveis
TRANSLATIONS: Dict[str, Dict[str, Any]] = {
    "en": {
        "common": {
            "error": "❌ An error occurred!",
            "success": "✅ Success!",
            "loading": "⏳ Loading...",
            "timeout": "⏰ Time's up!",
            "cancelled": "🚫 Cancelled.",
            "no_permission": "❌ You don't have permission to do that!",
            "already_active": "❌ You already have an active game! Finish it first.",
            "insufficient_funds": "❌ Insufficient EPA Coins! Balance: {balance}",
            "invalid_bet": "❌ Minimum bet is {min} EPA Coins!",
            "economy_unavailable": "❌ Economy system unavailable!",
        },
        
        "help": {
            "title": "📚 EPA BOT - Help",
            "description": "Complete list of available commands",
            "categories": {
                "tickets": "🎫 Tickets",
                "fun": "🎉 Fun",
                "games": "🎮 Games",
                "music": "🎵 Music",
                "economy": "💰 Economy",
                "utilities": "🔧 Utilities",
                "social": "👥 Social",
                "moderation": "🛡️ Moderation",
                "monitoring": "📊 Monitoring"
            },
            "footer": "Use /help <command> for details",
        },
        
        "tickets": {
            "created": "🎫 Ticket created successfully!",
            "closed": "🎫 Ticket closed.",
            "no_ticket": "❌ This is not a ticket channel!",
        },
        
        "economy": {
            "balance": "💰 **{user}**'s balance",
            "balance_value": "**{amount}** EPA Coins",
            "daily_claimed": "✅ Daily reward claimed!",
            "daily_reward": "+{amount} EPA Coins",
            "daily_already_claimed": "❌ You already claimed your daily reward today!",
            "daily_cooldown": "⏰ Come back in {hours}h {minutes}m",
            "shop_title": "🏪 EPA Coins Shop",
            "shop_empty": "The shop is empty right now!",
        },
        
        "games": {
            "tictactoe": {
                "name": "Tic-Tac-Toe",
                "challenge": "🎮 {challenger} challenges {opponent} to Tic-Tac-Toe!",
                "accepted": "✅ {player} accepted the challenge!",
                "declined": "❌ {player} declined the challenge.",
                "timeout": "⏰ Challenge expired!",
                "turn": "🎯 {player}'s turn",
                "win": "🎉 {player} won!",
                "draw": "🤝 Draw!",
                "abandon": "🚫 {player} abandoned the game!",
            },
            
            "connect4": {
                "name": "Connect 4",
                "challenge": "🎮 {challenger} challenges {opponent} to Connect 4!",
                "turn": "🎯 {player}'s turn",
                "win": "🎉 {player} won!",
                "draw": "🤝 Board full! Draw!",
                "full_column": "❌ This column is full!",
            },
            
            "hangman": {
                "name": "Hangman",
                "title": "🎮 Hangman",
                "word": "Word",
                "attempts": "Attempts",
                "guessed": "Guessed",
                "instruction": "Type a letter or the full word",
                "win": "🎉 Congratulations! You won!",
                "lose": "💀 Game Over! The word was: **{word}**",
                "invalid": "❌ Invalid input! Type a letter or the full word.",
                "already_guessed": "❌ Already tried!",
            },
            
            "blackjack": {
                "name": "Blackjack",
                "title": "🃏 Blackjack",
                "your_hand": "Your Hand",
                "dealer_hand": "Dealer's Hand",
                "bet": "Bet",
                "win": "🎉 You won! +{amount} EPA Coins",
                "lose": "💀 You lost! -{amount} EPA Coins",
                "draw": "🤝 Draw! Bet returned.",
                "bust": "💀 Bust! You lost!",
                "blackjack": "🎯 Blackjack! Click 'Stand' to finish.",
                "hit": "Hit",
                "stand": "Stand",
            },
            
            "quiz": {
                "name": "Quiz",
                "title": "❓ Quiz",
                "correct": "✅ Correct!",
                "incorrect": "❌ Incorrect!",
                "correct_answer": "The correct answer was: **{answer}**",
                "reward": "💰 Reward",
            },
            
            "memory": {
                "name": "Memory Game",
                "title": "🧠 Memory Game",
                "memorize": "Memorize these numbers!",
                "your_turn": "Now type the sequence!",
                "correct": "✅ Correct! +{reward} EPA Coins",
                "incorrect": "❌ Incorrect! The sequence was: {sequence}",
            },
        },
        
        "social": {
            "profile": {
                "title": "👤 {user}'s Profile",
                "level": "Level",
                "xp": "XP",
                "next_level": "Next Level",
                "rank": "Rank",
            },
            "leaderboard": {
                "title": "🏆 Leaderboard",
                "position": "Position",
            },
        },
        
        "moderation": {
            "kick": {
                "success": "✅ {user} was kicked.",
                "reason": "Reason",
            },
            "ban": {
                "success": "✅ {user} was banned.",
            },
            "timeout": {
                "success": "✅ {user} was timed out for {duration}.",
            },
            "clear": {
                "success": "✅ Deleted {count} messages.",
            },
        },
        
        "utilities": {
            "avatar": {
                "title": "🖼️ {user}'s Avatar",
            },
            "emoji": {
                "title": "😀 Custom Emoji",
                "download": "Download Links",
                "invalid": "❌ Please provide a valid custom emoji!",
            },
            "emojiinfo": {
                "title": "😀 Emoji Information",
                "id": "ID",
                "name": "Name",
                "type": "Type",
                "animated": "Animated",
                "static": "Static",
                "created": "Created",
                "creator": "Creator",
                "available": "Available",
                "managed": "Managed",
                "roles": "Restricted Roles",
                "no_restrictions": "No restrictions",
                "url": "Direct URL",
                "markdown": "Markdown",
                "not_found": "❌ Emoji not found in this server!",
            },
            "serverinfo": {
                "title": "ℹ️ Server Information",
                "owner": "Owner",
                "created": "Created",
                "members": "Members",
                "channels": "Channels",
            },
        },
        
        "music": {
            "playing": "🎵 Now playing",
            "added_queue": "✅ Added to queue",
            "queue_empty": "❌ The queue is empty!",
            "not_in_voice": "❌ You need to be in a voice channel!",
            "not_playing": "❌ Nothing is playing!",
        },
    },
    
    "pt": {
        "common": {
            "error": "❌ Ocorreu um erro!",
            "success": "✅ Sucesso!",
            "loading": "⏳ A carregar...",
            "timeout": "⏰ Tempo esgotado!",
            "cancelled": "🚫 Cancelado.",
            "no_permission": "❌ Não tens permissão para fazer isso!",
            "already_active": "❌ Já tens um jogo ativo! Termina-o primeiro.",
            "insufficient_funds": "❌ Não tens EPA Coins suficientes! Saldo: {balance}",
            "invalid_bet": "❌ Aposta mínima é {min} EPA Coins!",
            "economy_unavailable": "❌ Sistema de economia não disponível!",
        },
        
        "help": {
            "title": "📚 EPA BOT - Ajuda",
            "description": "Lista completa de comandos disponíveis",
            "categories": {
                "tickets": "🎫 Tickets",
                "fun": "🎉 Diversão",
                "games": "🎮 Jogos",
                "music": "🎵 Música",
                "economy": "💰 Economia",
                "utilities": "🔧 Utilidades",
                "social": "👥 Social",
                "moderation": "🛡️ Moderação",
                "monitoring": "📊 Monitorização"
            },
            "footer": "Usa /help <comando> para detalhes",
        },
        
        "tickets": {
            "created": "🎫 Ticket criado com sucesso!",
            "closed": "🎫 Ticket fechado.",
            "no_ticket": "❌ Este não é um canal de ticket!",
        },
        
        "economy": {
            "balance": "💰 Saldo de **{user}**",
            "balance_value": "**{amount}** EPA Coins",
            "daily_claimed": "✅ Recompensa diária reclamada!",
            "daily_reward": "+{amount} EPA Coins",
            "daily_already_claimed": "❌ Já reclamaste a tua recompensa diária hoje!",
            "daily_cooldown": "⏰ Volta daqui a {hours}h {minutes}m",
            "shop_title": "🏪 Loja EPA Coins",
            "shop_empty": "A loja está vazia de momento!",
        },
        
        "games": {
            "tictactoe": {
                "name": "Jogo do Galo",
                "challenge": "🎮 {challenger} desafia {opponent} para o Jogo do Galo!",
                "accepted": "✅ {player} aceitou o desafio!",
                "declined": "❌ {player} recusou o desafio.",
                "timeout": "⏰ Desafio expirou!",
                "turn": "🎯 Vez de {player}",
                "win": "🎉 {player} ganhou!",
                "draw": "🤝 Empate!",
                "abandon": "🚫 {player} abandonou o jogo!",
            },
            
            "connect4": {
                "name": "4 em Linha",
                "challenge": "🎮 {challenger} desafia {opponent} para 4 em Linha!",
                "turn": "🎯 Vez de {player}",
                "win": "🎉 {player} ganhou!",
                "draw": "🤝 Tabuleiro cheio! Empate!",
                "full_column": "❌ Esta coluna está cheia!",
            },
            
            "hangman": {
                "name": "Forca",
                "title": "🎮 Jogo da Forca",
                "word": "Palavra",
                "attempts": "Tentativas",
                "guessed": "Tentadas",
                "instruction": "Escreve uma letra ou a palavra completa",
                "win": "🎉 Parabéns! Ganhaste!",
                "lose": "💀 Perdeste! A palavra era: **{word}**",
                "invalid": "❌ Input inválido! Escreve uma letra ou a palavra completa.",
                "already_guessed": "❌ Já tentaste essa!",
            },
            
            "blackjack": {
                "name": "Blackjack",
                "title": "🃏 Blackjack",
                "your_hand": "Tua Mão",
                "dealer_hand": "Mão do Dealer",
                "bet": "Aposta",
                "win": "🎉 Ganhaste! +{amount} EPA Coins",
                "lose": "💀 Perdeste! -{amount} EPA Coins",
                "draw": "🤝 Empate! Aposta devolvida.",
                "bust": "💀 Rebentaste! Perdeste!",
                "blackjack": "🎯 Blackjack! Clica 'Parar' para finalizar.",
                "hit": "Pedir",
                "stand": "Parar",
            },
            
            "quiz": {
                "name": "Quiz",
                "title": "❓ Quiz",
                "correct": "✅ Correto!",
                "incorrect": "❌ Incorreto!",
                "correct_answer": "A resposta correta era: **{answer}**",
                "reward": "💰 Recompensa",
            },
            
            "memory": {
                "name": "Jogo da Memória",
                "title": "🧠 Jogo da Memória",
                "memorize": "Memoriza estes números!",
                "your_turn": "Agora escreve a sequência!",
                "correct": "✅ Correto! +{reward} EPA Coins",
                "incorrect": "❌ Errado! A sequência era: {sequence}",
            },
        },
        
        "social": {
            "profile": {
                "title": "👤 Perfil de {user}",
                "level": "Nível",
                "xp": "XP",
                "next_level": "Próximo Nível",
                "rank": "Rank",
            },
            "leaderboard": {
                "title": "🏆 Leaderboard",
                "position": "Posição",
            },
        },
        
        "moderation": {
            "kick": {
                "success": "✅ {user} foi expulso.",
                "reason": "Razão",
            },
            "ban": {
                "success": "✅ {user} foi banido.",
            },
            "timeout": {
                "success": "✅ {user} foi silenciado por {duration}.",
            },
            "clear": {
                "success": "✅ {count} mensagens eliminadas.",
            },
        },
        
        "utilities": {
            "avatar": {
                "title": "🖼️ Avatar de {user}",
            },
            "emoji": {
                "title": "😀 Emoji Customizado",
                "download": "Links de Download",
                "invalid": "❌ Por favor fornece um emoji customizado válido!",
            },
            "emojiinfo": {
                "title": "😀 Informações do Emoji",
                "id": "ID",
                "name": "Nome",
                "type": "Tipo",
                "animated": "Animado",
                "static": "Estático",
                "created": "Criado",
                "creator": "Criador",
                "available": "Disponível",
                "managed": "Gerido",
                "roles": "Roles Restritas",
                "no_restrictions": "Sem restrições",
                "url": "URL Direto",
                "markdown": "Markdown",
                "not_found": "❌ Emoji não encontrado neste servidor!",
            },
            "serverinfo": {
                "title": "ℹ️ Informações do Servidor",
                "owner": "Dono",
                "created": "Criado",
                "members": "Membros",
                "channels": "Canais",
            },
        },
        
        "music": {
            "playing": "🎵 A tocar agora",
            "added_queue": "✅ Adicionado à fila",
            "queue_empty": "❌ A fila está vazia!",
            "not_in_voice": "❌ Precisas de estar num canal de voz!",
            "not_playing": "❌ Nada está a tocar!",
        },
    }
}


# Instância global do tradutor
_translator = Translator("en")


def get_translator(language: str = "en") -> Translator:
    """Obter instância do tradutor para um idioma específico"""
    return Translator(language)


def set_language(language: str):
    """Definir idioma global"""
    global _translator
    _translator = Translator(language)


def t(key: str, **kwargs) -> str:
    """Atalho para tradução rápida"""
    return _translator.get(key, **kwargs)
