# 🤖 EPA BOT

> **⚠️ AVISO IMPORTANTE**
>
> **Este bot requer conhecimentos de programação para configurar e usar.**  
> **Não é fornecido suporte técnico. Use por sua conta e risco.**

Bot Discord completo com sistema de economia, jogos, música, moderação, tickets e muito mais!

**Autor:** Droppers  
**Linguagem:** Python 3.10+

---

## 📋 Índice

- [Características](#-características)
- [Requisitos](#-requisitos)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Comandos](#-comandos)
- [Estrutura](#-estrutura)
- [Tecnologias](#-tecnologias)
- [Avisos Legais](#-avisos-legais)

---

## ✨ Características

### 🎮 Sistemas Principais

- **💰 Economia** - Sistema completo com moedas, itens, loja e inventário
- **🎲 Jogos** - Jogos interativos (blackjack, slots, crash, coinflip, etc.)
- **🎵 Música** - Player de música com fila e controles
- **⭐ Social** - Sistema de XP, níveis, reputação e leaderboards
- **🎫 Tickets** - Sistema de suporte com transcrições
- **🛡️ Moderação** - Ferramentas completas (kick, ban, warn, timeout, etc.)
- **📊 Monitoramento** - Status do bot, servidor e utilizadores
- **🔧 Utilidades** - Ferramentas úteis para o servidor

### 🚀 Funcionalidades Avançadas

- ✅ Database SQLite com migração automática
- ✅ Sistema de backup automático (24h)
- ✅ Logging avançado com rotação de ficheiros
- ✅ Embeds padronizados e profissionais
- ✅ Sistema de paginação para listas
- ✅ Comandos Slash (/)
- ✅ Views e Buttons interativos
- ✅ Gestão de erros centralizada
- ✅ Configuração via variáveis de ambiente

---

## 📦 Requisitos

### Software Necessário

- **Python** 3.10 ou superior
- **FFmpeg** (para comandos de música)
- **Git** (para clonar o repositório)

### Conhecimentos Requeridos

⚠️ **IMPORTANTE: Este bot NÃO é plug-and-play!**

Você precisa ter conhecimentos em:

- Python (básico a intermediário)
- Discord API e discord.py
- Gestão de bases de dados SQLite
- Variáveis de ambiente
- Linha de comando (terminal/cmd)
- Configuração de tokens e IDs do Discord

**Se você não tem estes conhecimentos, este bot NÃO é para você!**

---

## 🔧 Instalação

### 1. Clonar o Repositório

```bash
git clone https://github.com/SEU_USERNAME/EPA-BOT.git
cd EPA-BOT
```

### 2. Instalar Dependências

**Windows:**

```bash
# Execute o script de instalação automática
install.bat

# OU manualmente:
python -m pip install -r requirements.txt
```

**Linux/Mac:**

```bash
python3 -m pip install -r requirements.txt
```

### 3. Instalar FFmpeg

**Windows:**

- Baixe: https://ffmpeg.org/download.html
- Extraia para `bin/ffmpeg/`
- Adicione ao PATH do sistema

**Linux:**

```bash
sudo apt install ffmpeg
```

**Mac:**

```bash
brew install ffmpeg
```

---

## ⚙️ Configuração

### 1. Criar Ficheiro .env

Copie o `.env.example` e renomeie para `.env`:

```env
# Token do Discord Bot
DISCORD_TOKEN=SEU_TOKEN_AQUI

# IDs do Servidor (configure os seus)
SERVER_ID=0
MOD_ROLE_ID=0
TICKET_CATEGORY_ID=0

# OpenAI (opcional)
OPENAI_TOKEN=

# Configurações do Bot
COMMAND_PREFIX=!
```

### 2. Obter Token do Discord

1. Acesse: https://discord.com/developers/applications
2. Crie uma nova aplicação
3. Vá em "Bot" → "Add Bot"
4. Copie o token em "TOKEN"
5. **NUNCA compartilhe este token!**

### 3. Obter IDs do Discord

**ID do Servidor:**

- Ative o Modo Desenvolvedor (Configurações → Avançado)
- Clique com botão direito no servidor → Copiar ID

**ID da Role de Moderação:**

- Clique com botão direito na role → Copiar ID

**ID da Categoria de Tickets:**

- Clique com botão direito na categoria → Copiar ID

### 4. Configurar Permissões do Bot

URL de convite (substitua CLIENT_ID):

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

**Permissões Necessárias:**

- Administrator (recomendado)
- OU: Manage Channels, Manage Roles, Kick Members, Ban Members, Manage Messages, etc.

---

## 🎯 Comandos

### 💰 Economia

```
/balance [@user]          - Ver saldo
/daily                    - Recompensa diária
/work                     - Trabalhar por moedas
/shop                     - Loja de itens
/buy <item>              - Comprar item
/inventory [@user]        - Ver inventário
/transfer <@user> <valor> - Transferir moedas
/leaderboard             - Top utilizadores
```

### 🎲 Jogos

```
/blackjack <aposta>      - Jogar blackjack
/slots <aposta>          - Slot machine
/coinflip <aposta> <lado> - Cara ou coroa
/crash <aposta>          - Jogo crash
/roulette <aposta> <tipo> - Roleta
/mines <aposta>          - Campo minado
```

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

### ⭐ Social

```
/rank [@user]            - Ver nível e XP
/rep <@user>             - Dar reputação
/top                     - Top do servidor
```

### 🎫 Tickets

```
/setup_tickets           - [ADMIN] Configurar painel
/fecharticket            - Fechar ticket atual
/ticket_stats            - [ADMIN] Ver estatísticas
```

### 🛡️ Moderação

```
/kick <@user> [razão]    - Expulsar membro
/ban <@user> [razão]     - Banir membro
/unban <user_id>         - Desbanir
/timeout <@user> <tempo> - Timeout
/untimeout <@user>       - Remover timeout
/warn <@user> <razão>    - Avisar utilizador
/warnings <@user>        - Ver avisos
/clear <quantidade>      - Limpar mensagens
```

### 📊 Monitoramento

```
/status                  - Status do bot
/ping                    - Latência
/serverinfo              - Info do servidor
/userinfo [@user]        - Info do utilizador
```

### 🔧 Utilidades

```
/poll <pergunta>         - Criar votação
/avatar [@user]          - Ver avatar
/servericon              - Ícone do servidor
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
│
├── cogs/               # Módulos do bot
│   ├── economy.py      # Sistema de economia
│   ├── games.py        # Jogos básicos
│   ├── games_extra.py  # Jogos extras
│   ├── music.py        # Player de música
│   ├── social.py       # Sistema social
│   ├── tickets.py      # Sistema de tickets
│   ├── moderation.py   # Moderação
│   ├── monitoring.py   # Monitoramento
│   ├── utilidades.py   # Utilitários
│   ├── fun.py          # Comandos divertidos
│   └── help.py         # Sistema de ajuda
│
├── utils/              # Utilitários
│   ├── database.py     # Gestão de database
│   ├── backup.py       # Sistema de backup
│   ├── logger.py       # Sistema de logging
│   ├── embeds.py       # Builder de embeds
│   └── pagination.py   # Sistema de paginação
│
├── config/             # Configurações
│   └── settings.py     # Settings principais
│
├── data/               # Dados (gitignored)
│   ├── bot.db         # Database SQLite
│   └── *.json         # Backups JSON
│
├── logs/              # Logs (gitignored)
│   └── bot.log        # Logs do bot
│
└── backups/           # Backups (gitignored)
    └── *.zip          # Backups automáticos
```

---

## 🛠️ Tecnologias

### Core

- **[Discord.py](https://discordpy.readthedocs.io/)** 2.4.0 - Framework principal
- **[Python](https://python.org)** 3.10+ - Linguagem

### Database & Storage

- **[aiosqlite](https://aiosqlite.omnilib.dev/)** - SQLite assíncrono
- **[aiofiles](https://github.com/Tinche/aiofiles)** - I/O de ficheiros assíncrono

### Sistema

- **[psutil](https://psutil.readthedocs.io/)** - Monitoramento de sistema
- **[python-dotenv](https://pypi.org/project/python-dotenv/)** - Gestão de .env

### Música (Opcional)

- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** - Download de áudio
- **[PyNaCl](https://pynacl.readthedocs.io/)** - Codificação de áudio
- **[FFmpeg](https://ffmpeg.org/)** - Processamento de áudio

---

## 🚀 Iniciar o Bot

### Método 1: Script Automático (Windows)

```bash
start.bat
```

### Método 2: Manual

```bash
python main.py
```

### Método 3: Com Logs

```bash
python main.py 2>&1 | tee -a logs/bot.log
```

---

## 🔄 Backups

O bot cria backups automáticos:

- **Frequência:** A cada 24 horas
- **Localização:** `backups/`
- **Formato:** ZIP comprimido
- **Retenção:** 7 dias

### Restaurar Backup Manualmente

```python
from utils.backup import BackupSystem

backup_system = BackupSystem()
await backup_system.restore_backup("backup_2024-01-15_12-00-00.zip")
```

---

## 📊 Logging

Logs são salvos em `logs/bot.log`:

- **Rotação:** 5MB por ficheiro
- **Backups:** 5 ficheiros antigos
- **Níveis:** INFO, WARNING, ERROR, CRITICAL

### Ver Logs

```bash
# Linux/Mac
tail -f logs/bot.log

# Windows (PowerShell)
Get-Content logs/bot.log -Wait -Tail 50
```

---

## 🐛 Troubleshooting

### Bot não inicia

1. Verifique se o token está correto no `.env`
2. Confirme que todas as dependências estão instaladas
3. Verifique os logs em `logs/bot.log`

### Comandos não aparecem

1. Execute `/sync` no Discord
2. Aguarde até 1 hora para sincronização global
3. Verifique permissões do bot

### Música não funciona

1. Instale FFmpeg corretamente
2. Verifique se está no PATH do sistema
3. Teste: `ffmpeg -version` no terminal

### Database bloqueada

1. Feche todas as instâncias do bot
2. Delete `data/bot.db-wal` e `data/bot.db-shm`
3. Reinicie o bot

---

## ⚠️ Avisos Legais

### Disclaimer

```
ESTE SOFTWARE É FORNECIDO "COMO ESTÁ", SEM GARANTIAS DE QUALQUER TIPO.
O AUTOR NÃO SE RESPONSABILIZA POR QUAISQUER DANOS CAUSADOS PELO USO DESTE BOT.

VOCÊ É TOTALMENTE RESPONSÁVEL POR:
- Configurar o bot corretamente
- Manter o token seguro
- Cumprir os Termos de Serviço do Discord
- Respeitar as leis de privacidade (GDPR, etc.)
- Usar o bot de forma ética e legal

NÃO É FORNECIDO SUPORTE TÉCNICO.
```

### Termos de Uso do Discord

Este bot deve respeitar:

- [Discord Terms of Service](https://discord.com/terms)
- [Discord Developer Terms](https://discord.com/developers/docs/policies-and-agreements/developer-terms-of-service)
- [Discord Developer Policy](https://discord.com/developers/docs/policies-and-agreements/developer-policy)

### Privacidade

O bot armazena:

- IDs de utilizadores
- Estatísticas de uso
- Dados de economia/XP
- Logs de moderação

**Configure adequadamente de acordo com GDPR e leis locais!**

---

## 📝 Licença

Este projeto está sob a licença MIT. Veja o ficheiro `LICENSE` para mais detalhes.

**Em resumo:**

- ✅ Uso comercial permitido
- ✅ Modificações permitidas
- ✅ Distribuição permitida
- ✅ Uso privado permitido
- ⚠️ SEM garantia
- ⚠️ SEM responsabilidade do autor

---

## 🤝 Contribuições

**Não são aceites contribuições externas no momento.**

Este é um projeto pessoal sem manutenção ativa.

---

## 📞 Contato

**⚠️ NÃO ENTRE EM CONTATO PARA SUPORTE!**

Este bot é fornecido como está, sem suporte.

Se você não consegue configurar ou usar, **este bot não é para você**.

---

## 🎓 Recursos de Aprendizagem

Se você quer aprender a criar bots Discord:

- **Discord.py Docs:** https://discordpy.readthedocs.io/
- **Discord Developer Portal:** https://discord.com/developers/docs
- **Python.org:** https://docs.python.org/3/
- **Real Python:** https://realpython.com/
- **Automate the Boring Stuff:** https://automatetheboringstuff.com/

---

## 🌟 Agradecimentos

Obrigado a todos que contribuíram para as bibliotecas usadas neste projeto:

- Discord.py team
- Python community
- Todos os desenvolvedores de bibliotecas open-source

---

**Feito com ❤️ por Droppers**

**Última atualização:** Dezembro 2024

---
