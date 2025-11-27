# 🤖 EPA BOT - Discord Community Bot (English Version)

> A comprehensive Discord bot with games, economy, music, moderation, and social features.
>
> **Branch: `en` (English) | Main branch: `main` (Portuguese)**

<<<<<<< HEAD
[![Discord.py](https://img.shields.io/badge/discord.py-2.4.0-blue)](https://github.com/Rapptz/discord.py)
[![Python](https://img.shields.io/badge/python-3.10+-green)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-orange)](LICENSE)
=======
Bot Discord completo com sistema de economia, jogos, música, moderação, tickets e muito mais!

**Autor:** Droppers  
**Linguagem:** Python 3.10+

> 🌍 **English version available!** → [Switch to branch `en`](https://github.com/Droppers02/Discord-Community-Bot/tree/en)
>>>>>>> main

---

## 📋 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Configuration](#%EF%B8%8F-configuration)
- [Commands](#-commands)
- [Internationalization](#-internationalization)
- [Development](#-development)
- [License](#-license)

---

## ✨ Features

### 🎮 Games (9 Games)

<<<<<<< HEAD
- **Tic-Tac-Toe** - Challenge players with 30s turn timer
- **Connect 4** - 4-in-a-row with 45s turn timer
- **Hangman** - Improved with text detection
- **Blackjack** - Casino-style card game
- **Quiz** - Trivia questions with rewards
- **Reaction** - Quick reaction test (15s)
- **Math** - Math challenges (20s)
- **Memory** - Number sequence memory (120s)
- **Statistics & Leaderboards** - Track wins, losses, and rankings
=======
- **💰 Economia Avançada** - Moedas, loja, custom roles, trading, leilões, achievements, eventos especiais
- **🎲 Jogos** - Jogos interativos (blackjack, slots, crash, coinflip, etc.)
- **🎵 Música** - Player de música com fila e controles
- **⭐ Social Avançado** - XP, níveis, perfis customizáveis, badges, casamentos, streaks e histórico
- **🎫 Tickets** - Sistema profissional de suporte com categorias e gestão
- **🛡️ Moderação** - Sistema avançado com logs, filtro de palavras, quarentena, appeals, anti-spam, anti-raid, NSFW detection, filtro de links, strikes, mention spam protection, auto-slowmode e role backup
- **📊 Monitoramento** - Status do bot, servidor e utilizadores
- **🔧 Utilidades Avançadas** - Lembretes, Polls, Anúncios, Auto-roles (3 painéis), Verificação 2FA, Sistema de Sugestões, Giveaways Automatizados, Timestamps, Notas Pessoais, Voice Tracker, Starboard, Sistema AFK
>>>>>>> main

### 💰 Advanced Economy

- **Basic Economy**

  - Balance, daily rewards with streak bonuses
  - Work and crime commands with cooldowns
  - Item shop and inventory
  - Coin transfers between users

- **Advanced Features** (v2.6.0)
  - Custom roles (50k coins) - Buy and customize personal roles
  - P2P Trading system - Trade coins and items
  - Achievements system - Unlock and display badges
  - Auction system - Create and bid on auctions
  - Special events - Server-wide multiplier events

### 👥 Social System

- **Leveling** - XP system with ranks
- **Reputation** - Like system (1h cooldown)
- **Profiles** - Customizable user profiles
- **Badges** - Earned achievements display
- **Marriage** - Marry and divorce other users
- **Streaks** - Track daily, message, and game streaks
- **Leaderboards** - XP and Reputation rankings

### 🎵 Music System

- YouTube support (yt-dlp)
- Queue management
- Playback controls (pause, resume, skip, stop)
- Now playing display

### 🛡️ Moderation

- **Basic**: Kick, ban, timeout, warnings
- **Advanced**: Auto-moderation, word filter, quarantine system, appeals
- **Auto-Moderation** (v2.7.1):
  - Anti-spam with channel whitelisting
  - Anti-raid protection with join monitoring
  - NSFW detection with AI (DeepAI integration)
- **Logging**: Moderation action logs

### 🎫 Ticket System

- 5 customizable categories
- Staff panel with controls
- Automatic channel management

### 🔧 Utilities

- **Avatar & User Info** - View avatars and profiles
- **Emoji Tools** (v2.6.1)
  - `/emoji` - Enlarge custom emojis up to 1024x1024
  - `/emojiinfo` - Technical emoji information
- **Server Info** - Comprehensive server statistics
- **Reminders** - Schedule reminders
- **Polls** - Create interactive polls
- **Announcements** - Schedule announcements
- **Community Suggestions** (v2.8.0) - Upvote/downvote system
- **Automated Giveaways** (v2.8.0) - Random winner selection
- **Timestamp Generator** (v2.8.0) - Discord timestamp codes
- **Personal Notes** (v2.8.0) - Private notes with tags
- **Voice Tracker** (v2.8.0) - Time in voice statistics
- **Starboard** (v2.8.0) - Hall of fame for messages
- **AFK System** (v2.8.0) - Auto-reply when mentioned

---

## 🚀 Installation

### Prerequisites

- Python 3.10 or higher
- FFmpeg (for music features)
- Discord Bot Token

### Steps

1. **Clone the repository**

```bash
git clone https://github.com/Droppers02/Discord-Community-Bot.git
cd Discord-Community-Bot
```

2. **Switch to English branch**

```bash
git checkout en
```

3. **Install dependencies**

```bash
pip install -r requirements.txt
```

4. **Configure environment**
   Create a `.env` file:

```env
DISCORD_TOKEN=your_bot_token_here
BOT_LANGUAGE=en

# Optional
SERVER_ID=your_server_id
MOD_ROLE_ID=your_moderator_role_id
TICKET_CATEGORY_ID=your_ticket_category_id
OWNER_IDS=owner_id_1,owner_id_2

# FFmpeg (if not in PATH)
FFMPEG_PATH=path/to/ffmpeg/ffmpeg.exe

# Logging
LOG_LEVEL=INFO
```

5. **Run the bot**

```bash
python main.py
```

---

## ⚙️ Configuration

### Language Settings

The bot supports two languages:

- **English (`en`)** - This branch
- **Portuguese (`pt`)** - Main branch

To change language, set in `.env`:

```env
BOT_LANGUAGE=en
```

### Database

SQLite database automatically created on first run:

- `database.db` - Main database
- 9 economy tables (custom_roles, trades, achievements, etc.)
- Automatic JSON migration from legacy versions

### Music Configuration

```env
# Music settings
MUSIC_TIMEOUT=15
YTDL_FORMAT=bestaudio
ENABLE_MUSIC_CACHE=True
MUSIC_DEBUG=False
```

---

## 📚 Commands

Use `/help` in Discord to see all commands with pagination.

### Quick Reference

| Category             | Key Commands                                                      |
| -------------------- | ----------------------------------------------------------------- |
| **Games**            | `/tictactoe`, `/connect4`, `/hangman`, `/blackjack`, `/quiz`      |
| **Economy**          | `/balance`, `/daily`, `/work`, `/shop`, `/buy`                    |
| **Advanced Economy** | `/buy_role`, `/propose_trade`, `/create_auction`, `/achievements` |
| **Social**           | `/rank`, `/like`, `/profile`, `/marry`, `/badges`                 |
| **Music**            | `/play`, `/pause`, `/skip`, `/queue`                              |
| **Moderation**       | `/kick`, `/ban`, `/timeout`, `/warn`, `/clear`                    |
| **Utilities**        | `/avatar`, `/emoji`, `/emojiinfo`, `/serverinfo`                  |
| **Tickets**          | `/setup_tickets`, `/rename`                                       |
| **Admin**            | `/setup_autoroles`, `/reload`, `/sync`, `/ping`                   |

---

## 🌍 Internationalization

### Branch Structure

```
main (Portuguese) ←→ en (English)
```

### Translation System

The bot uses a custom i18n system located in `config/i18n.py`:

```python
from config.i18n import get_translator

# Get translator for current language
t = get_translator("en")

# Use translations
title = t("games.tictactoe.name")  # "Tic-Tac-Toe"
message = t("common.insufficient_funds", balance=1000)  # Formatted string
```

### Adding Translations

Edit `config/i18n.py` and add keys to both `en` and `pt` dictionaries:

```python
TRANSLATIONS = {
    "en": {
        "category": {
            "key": "English text"
        }
    },
    "pt": {
        "category": {
            "key": "Texto em português"
        }
    }
}
```

---

## 👨‍💻 Development

### Project Structure

```
<<<<<<< HEAD
EPA BOTCHI/
├── cogs/                   # Command modules (cogs)
│   ├── games.py           # Main games (TicTacToe, Connect4)
│   ├── games_extra.py     # Extra games (Hangman, Quiz, etc.)
│   ├── economy.py         # Basic economy
│   ├── economy_advanced.py # Advanced economy features
│   ├── social.py          # Basic social features
│   ├── social_advanced.py # Advanced social features
│   ├── music.py           # Music system
│   ├── moderation.py      # Moderation tools
│   ├── tickets.py         # Ticket system
│   ├── utilidades.py      # Utility commands
│   ├── utilities_advanced.py # Advanced utilities
│   ├── help.py            # Help command (TRANSLATED)
│   └── fun.py             # Fun commands
=======
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

**Permissões Necessárias:**

- Administrator (recomendado)
- OU: Manage Channels, Manage Roles, Kick Members, Ban Members, Manage Messages, etc.

---

## 🎯 Comandos

### 💰 Economia

**Básico:**

```
/saldo [@user]            - Ver saldo de EPA Coins
/daily                    - Recompensa diária (streak bonus)
/trabalho                 - Trabalhar por coins (cooldown: 1h)
/crime                    - Crime arriscado (cooldown: 2h)
/doar <@user> <valor>     - Doar coins a alguém
/perfil [@user]           - Ver perfil económico completo
```

**Loja & Itens:**

```
/loja                     - Ver itens disponíveis
/comprar <item>           - Comprar item da loja
/inventario [@user]       - Ver inventário
```

**Economia Avançada:**

```
/comprar_role <nome> <cor> - Comprar Custom Role (50k coins)
/editar_role [nome] [cor]  - Editar a tua Custom Role
/remover_role              - Remover Custom Role
/propor_trade <@user> <coins_tuas> <coins_deles> - Propor troca
/trades_pendentes          - Ver trades pendentes
/conquistas [@user]        - Ver achievements desbloqueados
```

**Leilões:**

```
/criar_leilao <nome> <desc> <lance> [compra_ja] [horas] - Criar leilão
/leiloes                   - Ver leilões ativos
/dar_lance <id> <valor>    - Dar lance em leilão
```

**Eventos (Admin):**

```
/criar_evento <tipo> <horas> [multiplicador] - Criar evento especial
/eventos_ativos             - Ver eventos ativos
```

### 🎲 Jogos de Aposta

```
/blackjack <aposta>      - Jogar blackjack
/slots <aposta>          - Slot machine
/coinflip <aposta> <lado> - Cara ou coroa
/crash <aposta>          - Jogo crash
/roulette <aposta> <tipo> - Roleta
/mines <aposta>          - Campo minado
```

### 🎮 Jogos Clássicos

```
/galo [@adversário]      - Jogo do Galo (Tic-Tac-Toe)
/4emlinha [@adversário]  - 4 em Linha (Connect Four)
/forca                   - Jogo da Forca (melhorado com botões)
/quiz                    - Quiz de conhecimentos
```

### ⚡ Mini-Jogos de Reação

```
/reacao                  - Clica no emoji mais rápido!
/matematica              - Resolve cálculos matemáticos
/memoria                 - Jogo de memória com emojis
```

### 📊 Estatísticas de Jogos

```
/gamestats [@user] [jogo] - Ver estatísticas de jogos
/gameleaderboard <jogo>   - Top 10 jogadores por jogo
```

**Jogos disponíveis para stats:** `galo`, `4emlinha`, `forca`, `quiz`, `blackjack`, `reacao`, `matematica`, `memoria`

### 🎵 Música

```
/play <música>           - Tocar música
/pause                   - Pausar
/resume                  - Retomar
/skip                    - Próxima música
/stop                    - Parar e limpar fila
/queue                   - Ver fila
/nowplaying              - Música atual
/volume <0-100>          - Ajustar volume
```

### ⭐ Sistema Social Avançado

O bot possui um sistema social completo com XP, níveis, perfis customizáveis, badges, casamentos e histórico de atividades.

**Comandos Básicos:**

```
/rank [@user]            - Ver nível, XP e progresso
/like <@user>            - Dar reputação (cooldown: 1h)
/leaderboard [tipo]      - Rankings (XP ou Reputação)
```

**Sistema de Perfis:**

```
/perfil [@user]          - Ver perfil completo com badges e casamento
/editarperfil            - Customizar bio, pronomes, aniversário, jogo favorito
/badges [@user]          - Ver todos os badges conquistados
```

**Perfis incluem:**

- 📊 Estatísticas (Level, XP, Reputação, Mensagens)
- 🎨 Customização (Bio, Cor do embed, Banner, Pronomes)
- 🏅 Badges conquistados
- 💍 Status de casamento
- 🎮 2 campos personalizados

**Sistema de Casamento:**

```
/casar <@user>           - Pedir utilizador em casamento
/divorcio                - Divorciar-se (requer confirmação)
```

- Propostas interativas com botões aceitar/recusar
- Badge 💍 automático ao casar
- Exibição de parceiro no perfil
- Sistema de ring tiers (💍/💎)

**Histórico e Streaks:**

```
/historico [@user]       - Ver últimas 20 atividades
/streaks                 - Ver streaks (Daily, Mensagens, Jogos)
/top_categoria [cat]     - Top por Level, Mensagens, Reputação, Badges, Streak
```

**Badges Automáticos:**

- 🔟 Nível 10
- 🎖️ Nível 25
- ⭐ Nível 50
- 👑 Nível 100
- 💍 Casamento

**Sistema de XP:**

- 15-25 XP por mensagem (cooldown: 60s)
- Cálculo: Level = ⌊√(XP/100)⌋ + 1
- Notificações automáticas de level up
- Streaks de mensagens registados
- Tudo armazenado em SQLite

### 🎫 Tickets

```
/setup_tickets           - [ADMIN] Configurar painel com categorias
/rename <novo_nome>      - [STAFF] Renomear ticket atual
```

**Funcionalidades:**

- 5 categorias: Suporte Técnico, Dúvidas, Reports, Sugestões, Outros
- Limite de 1 ticket por utilizador
- Formato: 🎫┃username-0001 (ID sequencial)
- Botão para fechar tickets
- Sistema de permissões automático

### 🛡️ Moderação

**Comandos Básicos:**

```
/kick <@user> [razão]    - Expulsar membro
/ban <@user> [razão]     - Banir membro
/unban <user_id>         - Desbanir
/timeout <@user> <preset> - Timeout com presets (1m, 5m, 10m, 30m, 1h, 6h, 12h, 1d, 3d, 1w)
/untimeout <@user>       - Remover timeout
/warn <@user> <razão>    - Avisar utilizador
/warnings <@user>        - Ver avisos
/clear <quantidade>      - Limpar mensagens
```

**Sistema de Logs:**

```
/setup modlogs <#canal>  - Configurar canal de logs de moderação
```

- Logs automáticos de todas as ações (kick, ban, timeout, warn)
- Embeds formatados com informações completas
- Registro de filtro de palavras e quarentena

**Filtro de Palavras:**

```
/setup wordfilter <ativar> [ação] - Configurar filtro (warn/timeout/kick/ban)
/wordfilter add <palavra>         - Adicionar palavra proibida
/wordfilter remove <palavra>      - Remover palavra
/wordfilter list                  - Listar palavras proibidas
```

- Detecção automática de palavras proibidas
- Ações configuráveis (aviso, timeout, kick, ban)
- Logs detalhados de violações

**Sistema de Quarentena:**

```
/setup quarantine <ativar> [role] [duração] - Configurar quarentena
```

- Role automática para novos membros
- Duração configurável em minutos
- Remoção automática após tempo definido

**Sistema de Appeals:**

```
/setup appeals <ativar> [#canal] - Configurar appeals
/appeal <servidor_id> <motivo>   - Pedir unban (DM)
```

- Usuários banidos podem pedir revisão
- Appeals enviados para canal específico
- Processo organizado para moderação

**Auto-Moderação:**

```
/setup antispam [ativar] [canal] [ação]          - Anti-spam com whitelist de canais
/setup antiraid [ativar] [threshold] [intervalo] - Proteção anti-raid
/setup nsfw [ativar] [canal] [ação] [api_key]   - Detecção de NSFW (DeepAI)
/setup linkfilter [ativar] [bloquear_convites] [bloquear_phishing] [canal] [acao_canal] - Filtro de links maliciosos
/setup strikes [ativar] [strikes_ban] [dias_expiracao] - Sistema de strikes
/setup mentionspam [ativar] [max_mencoes] [max_mencoes_roles] - Proteção mention spam
/setup slowmode [ativar] [threshold] [janela] [duracao] - Auto-slowmode
/setup rolebackup [ativar] [restaurar_unban] - Backup de roles
```

- **Anti-Spam**: Deteção de spam por mensagens rápidas e duplicadas

  - Whitelist de canais (add/remove/list)
  - Threshold configurável de mensagens
  - Ações automáticas: warn, timeout, kick

- **Anti-Raid**: Monitoramento de joins suspeitos

  - Threshold configurável (X membros em Y segundos)
  - Ação automática ao detetar raid
  - Logs detalhados com timestamps

- **NSFW Detection**: Análise de imagens com IA

  - Integração com DeepAI API
  - Whitelist de canais NSFW permitidos
  - Confidence threshold ajustável
  - Ações: delete, warn, timeout, kick

- **Link Filter**: Proteção contra links maliciosos

  - Bloqueio de convites do Discord (discord.gg, discord.com/invite)
  - Deteção de domínios de phishing conhecidos
  - Whitelist/blacklist de domínios
  - Whitelist de canais
  - Integração com sistema de strikes

- **Sistema de Strikes**: Infrações progressivas (3 strikes = ban)

  - Strikes automáticos em violações
  - Strikes manuais: `/strike <user> <reason>`
  - Ver strikes: `/strikes [user]`
  - Limpar strikes: `/clearstrikes <user>` (admin)
  - Expiração automática (padrão: 30 dias)
  - Ações progressivas:
    - Strike 1: Aviso em DM
    - Strike 2: Timeout de 24 horas
    - Strike 3: Ban automático

- **Mention Spam Protection**: Limites de menções

  - Máximo de menções de usuários (padrão: 5)
  - Máximo de menções de roles (padrão: 2)
  - Bloqueio de @everyone/@here não autorizado
  - Timeout automático (padrão: 10 minutos)
  - Integração com strikes

- **Auto-Slowmode**: Slowmode durante alta atividade

  - Threshold configurável (padrão: 20 msgs em 10s)
  - Duração ajustável (padrão: 10s por 5 minutos)
  - Remoção automática após expiração
  - Notificação no canal

- **Role Backup**: Preservação de roles em bans
  - Backup automático ao banir
  - Restauração automática ao desbanir (configurável)
  - Verificação de hierarquia de roles

### 📊 Monitoramento

```
/status                  - Status do bot
/ping                    - Latência
/serverinfo              - Info do servidor
/userinfo [@user]        - Info do utilizador
```

### 🔧 Utilidades Básicas

```
/avatar [@user]          - Ver avatar de um utilizador
/userinfo [@user]        - Informações de utilizador
/serverinfo              - Informações do servidor
/botinfo                 - Informações do bot
```

### 🔧 Utilidades Avançadas

```
/lembrete                - Criar lembrete (simples ou recorrente)
/meus_lembretes          - Ver lembretes ativos
/poll                    - Criar poll interativa (até 5 opções)
/anuncio                 - [ADMIN] Agendar anúncio
/setup_autoroles         - [ADMIN] Configurar 3 painéis de roles
/setup_verificacao       - [ADMIN] Sistema de verificação 2FA
/suggest                 - Criar sugestão para a comunidade
/approve_suggestion      - [MOD] Aprovar sugestão
/deny_suggestion         - [MOD] Recusar sugestão
/setup_suggestions       - [ADMIN] Configurar sistema de sugestões
/giveaway                - [MOD] Criar giveaway automatizado
/timestamp               - Gerar timestamp do Discord
/note_add                - Adicionar nota pessoal privada
/notes                   - Ver as tuas notas (filtro por tag)
/note_view               - Ver nota completa
/note_delete             - Apagar nota
/voicestats              - Ver estatísticas de tempo em voz
/voiceleaderboard        - Top 10 usuários por tempo em voz
/setup_starboard         - [ADMIN] Configurar Starboard
/afk                     - Definir status AFK
```

### 👑 Admin

```
/reload <cog>            - Recarregar módulo
/sync                    - Sincronizar comandos
```

---

## 📁 Estrutura

```
EPA-BOT/
├── main.py              # Arquivo principal
├── requirements.txt     # Dependências
├── .env                 # Configuração (NÃO COMMITAR!)
├── .gitignore          # Arquivos ignorados
>>>>>>> main
│
├── config/                 # Configuration
│   ├── settings.py        # Bot settings
│   ├── i18n.py            # Translation system (NEW)
│   └── *.json             # Config files
│
├── utils/                  # Utilities
│   ├── database.py        # SQLite database
│   ├── logger.py          # Logging system
│   ├── embeds.py          # Embed helpers
│   ├── pagination.py      # Pagination views
│   └── backup.py          # Backup system
│
├── data/                   # Data files
│   ├── *.json             # JSON data
│   └── database.db        # SQLite database
│
├── logs/                   # Log files
├── main.py                 # Bot entry point
├── requirements.txt        # Dependencies
└── README_EN.md           # This file
```

### Adding New Features

1. Create or modify cog in `cogs/`
2. Add translations to `config/i18n.py`
3. Update `cogs/help.py` with new commands
4. Test thoroughly
5. Update CHANGELOG

### Code Style

- Use async/await for Discord commands
- Follow PEP 8 style guide
- Add docstrings to all functions
- Use type hints where possible
- Comment complex logic

---

## 📝 Version History

### v2.6.1 (2024-11-24)

- ✅ Added `/emoji` - Enlarge custom emojis
- ✅ Added `/emojiinfo` - Emoji technical information
- 🐛 Fixed Blackjack loading issue (syntax error)

### v2.6.0 (2024-11-20)

- ✅ Advanced Economy System (9 new tables)
- ✅ Custom Roles, Trading, Achievements
- ✅ Auction System, Special Events
- ✅ Complete social system overhaul

### v2.5.0

- ✅ Game challenge system with timeouts
- ✅ Hangman rewrite with text detection
- ✅ Optimized all game timeouts

### Earlier Versions

See [CHANGELOG.md](CHANGELOG.md) for complete history.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 👤 Author

**Droppers** 🇵🇹

- GitHub: [@Droppers02](https://github.com/Droppers02)
- Repository: [Discord-Community-Bot](https://github.com/Droppers02/Discord-Community-Bot)

---

## 🔗 Links

- [Discord.py Documentation](https://discordpy.readthedocs.io/)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Portuguese Version (Main Branch)](https://github.com/Droppers02/Discord-Community-Bot/tree/main)

---

**Made with ❤️ for the Discord community**
