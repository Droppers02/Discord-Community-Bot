# 🤖 EPA BOT - Discord Community Bot (English Version)

> A comprehensive Discord bot with games, economy, music, moderation, and social features.
>
> **Branch: `en` (English) | Main branch: `main` (Portuguese)**

[![Discord.py](https://img.shields.io/badge/discord.py-2.4.0-blue)](https://github.com/Rapptz/discord.py)
[![Python](https://img.shields.io/badge/python-3.10+-green)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-orange)](LICENSE)

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

- **Tic-Tac-Toe** - Challenge players with 30s turn timer
- **Connect 4** - 4-in-a-row with 45s turn timer
- **Hangman** - Improved with text detection
- **Blackjack** - Casino-style card game
- **Quiz** - Trivia questions with rewards
- **Reaction** - Quick reaction test (15s)
- **Math** - Math challenges (20s)
- **Memory** - Number sequence memory (120s)
- **Statistics & Leaderboards** - Track wins, losses, and rankings

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
