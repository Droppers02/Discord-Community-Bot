# 🤖 EPA BOT

> **⚠️ AVISO IMPORTANTE**
>
> **Este bot requer conhecimentos de programação para configurar e usar.**  
> **Não é fornecido suporte técnico. Use por sua conta e risco.**

Bot Discord completo com sistema de economia, jogos, música, moderação, tickets e muito mais!

**Autor:** Droppers  
**Linguagem:** Python 3.10+

> 🌍 **English version available!** → [Switch to branch `en`](https://github.com/Droppers02/Discord-Community-Bot/tree/en)

---

## 📋 Índice

- [Características](#-características)
- [Requisitos](#-requisitos)
- [Instalação](#-instalação)
- [Configuração](#%EF%B8%8F-configuração)
- [Comandos](#-comandos)
- [Estrutura](#-estrutura)
- [Tecnologias](#%EF%B8%8F-tecnologias)
- [Avisos Legais](#%EF%B8%8F-avisos-legais)

---

## ✨ Características

### 🎮 Sistemas Principais

- **💰 Economia Avançada** - Moedas, loja, custom roles, trading, leilões, achievements, eventos especiais
- **🎲 Jogos** - Jogos interativos (blackjack, slots, crash, coinflip, etc.)
- **🎵 Música** - Player de música com fila e controles
- **⭐ Social Avançado** - XP, níveis, perfis customizáveis, badges, casamentos, streaks e histórico
- **🎫 Tickets** - Sistema profissional de suporte com categorias e gestão
- **🛡️ Moderação** - Sistema avançado com logs, filtro de palavras, quarentena, appeals, anti-spam, anti-raid, NSFW detection, filtro de links, strikes, mention spam protection, auto-slowmode e role backup
- **📊 Monitoramento** - Status do bot, servidor e utilizadores
- **🔧 Utilidades Avançadas** - Lembretes, Polls, Anúncios, Auto-roles (3 painéis), Verificação 2FA

### 🚀 Funcionalidades Avançadas

- ✅ Database SQLite com migração automática
- ✅ Sistema de backup automático (24h)
- ✅ Logging avançado com rotação de ficheiros
- ✅ Embeds padronizados e profissionais
- ✅ Sistema de paginação para listas
- ✅ Comandos Slash (/)
- ✅ Views e Buttons interativos
- ✅ Gestão de erros centralizada
- ✅ Cooldowns visuais com barras de progresso
- ✅ Sistema de trading P2P
- ✅ Leilões de itens raros
- ✅ Achievements com recompensas
- ✅ Eventos especiais com multiplicadores
- ✅ Configuração via variáveis de ambiente

---

## 📦 Requisitos

### Software Necessário

- **Python** 3.10 ou superior
- **FFmpeg** (para comandos de música)
- **Git** (para clonar o repositório)

### Conhecimentos Requeridos

⚠️ **IMPORTANTE: Este bot NÃO é plug-and-play!**

Precisas ter conhecimentos em:

- Python (básico a intermediário)
- Discord API e discord.py
- Gestão de bases de dados SQLite
- Variáveis de ambiente
- Linha de comando (terminal/cmd)
- Configuração de tokens e IDs do Discord

**Se não tens estes conhecimentos, este bot NÃO é para ti!**

---

## 🔧 Instalação

### 1. Clonar o Repositório

```bash
git clone https://github.com/Droppers02/Discord-Community-Bot.git
cd Discord-Community-Bot
```

### 2. Instalar Dependências Python

**Windows:**

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

**Linux/Mac:**

```bash
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt
```

**Dependências incluídas:**

- `discord.py>=2.4.0` - Biblioteca principal do Discord
- `aiosqlite>=0.20.0` - Base de dados assíncrona
- `python-dotenv>=1.0.0` - Gestão de variáveis de ambiente
- `Pillow>=10.0.0` - Manipulação de imagens
- `psutil>=5.9.0` - Monitoramento do sistema
- `aiofiles>=23.0.0` - Operações de ficheiros assíncronas
- `yt-dlp>=2024.0.0` - Download de música do YouTube
- `PyNaCl>=1.5.0` - Codec de áudio para Discord

### 3. Instalar FFmpeg

⚠️ **OBRIGATÓRIO** para comandos de música funcionar!

**Windows:**

1. Baixe: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
2. Extraia o conteúdo
3. Copie os ficheiros `ffmpeg.exe`, `ffplay.exe` e `ffprobe.exe` para `bin/ffmpeg/`
4. **OU** adicione FFmpeg ao PATH do sistema

**Linux (Ubuntu/Debian):**

```bash
sudo apt update
sudo apt install ffmpeg
```

**Mac:**

```bash
brew install ffmpeg
```

**Verificar instalação:**

```bash
ffmpeg -version
```

### 4. Criar Estrutura de Pastas

O bot precisa destas pastas (criadas automaticamente na primeira execução):

```bash
mkdir data logs bin/ffmpeg
```

### 5. Executar o Bot

**Windows:**

```bash
python main.py
```

**Linux/Mac:**

```bash
python3 main.py
```

**Primeira execução:**

- O bot criará automaticamente a base de dados SQLite
- Fará backup dos ficheiros JSON existentes (se houver)
- Migrará dados antigos para o novo sistema

**O bot está pronto quando ver:**

```
✅ Bot iniciado como: NomeDoBot#1234
✅ Conectado a X servidor(es)
✅ X comandos sincronizados
```

---

## 🚀 Deployment / Hosting

### Railway.app (Recomendado) ⭐

O bot está otimizado para deploy na **Railway** com plano grátis generoso (512MB RAM, $5 crédito mensal).

**Ficheiros de configuração:**

- `railway.json` - Configuração do deploy
- `Procfile` - Comando de início
- `runtime.txt` - Versão do Python
- `nixpacks.toml` - Pacotes do sistema (FFmpeg)

**Passo a passo:**

1. **Criar conta:** Vai a [railway.app](https://railway.app) e cria conta com GitHub
2. **Novo Projeto:** Clica em "New Project" → "Deploy from GitHub repo"
3. **Selecionar Repo:** Escolhe o repositório `Discord-Community-Bot`
4. **Variáveis de Ambiente:** No painel do projeto, vai a "Variables" e adiciona:
   ```
   DISCORD_TOKEN=teu_token_aqui
   SERVER_ID=id_do_servidor
   MOD_ROLE_ID=id_da_role_moderador
   TICKET_CATEGORY_ID=id_da_categoria_tickets
   ```
5. **Deploy Automático:** Railway fará deploy automaticamente!

**✅ Vantagens da Railway:**

- 512MB RAM (5x mais que Discloud)
- $5 crédito grátis por mês (~500 horas)
- Deploy automático via GitHub
- FFmpeg incluído (comandos de música funcionam)
- Logs em tempo real
- Restart automático

**Monitorização:**

- Acessa os logs em tempo real no painel
- Vê uso de RAM e CPU
- Deploy automático a cada push no GitHub

---

### Discloud (Alternativa)

O bot também suporta **Discloud** com o ficheiro `discloud.config`:

**Passo a passo:**

1. Cria uma conta em [discloud.app](https://discloud.app)
2. Faz upload do bot (ZIP ou conecta ao GitHub)
3. No painel, adiciona as variáveis de ambiente:
   - `DISCORD_TOKEN`
   - `SERVER_ID`
   - `MOD_ROLE_ID`
   - `TICKET_CATEGORY_ID`
4. Inicia o bot

**⚠️ Limitações do Plano Grátis:**

- 100MB RAM (muito limitado)
- Comandos de música podem causar problemas
- Considera desativar o cog `music.py`

---

### Outras Opções de Hosting

- **VPS (Máximo controlo):** DigitalOcean ($4/mês), Linode, AWS EC2
- **Render.com:** Alternativa gratuita similar à Railway
- **PebbleHost:** Especializado em bots Discord ($1/mês)
- **Oracle Cloud:** VPS grátis permanente (requer cartão)

---

## 📝 Configuração de IDs Personalizados

O bot utiliza um sistema de configuração em JSON para permitir personalização de roles e canais sem modificar o código.

### Passo 1: Copiar o Ficheiro de Exemplo

```bash
cp config/utilities_config.example.json config/utilities_config.json
```

Ou copia manualmente o ficheiro `utilities_config.example.json` e renomeia para `utilities_config.json`.

### Passo 2: Obter os IDs do Discord

**Ativar o Modo de Desenvolvedor:**

1. Discord → Configurações do Utilizador → Avançado
2. Ativar "Modo de desenvolvedor"

**Copiar IDs:**

- **Roles:** Clique direito na role → Copiar ID
- **Canais:** Clique direito no canal → Copiar ID

### Passo 3: Editar o Ficheiro de Configuração

Abre `config/utilities_config.json` e preenche com os IDs do teu servidor:

```json
{
  "verification": {
    "verified_role_id": 123456789012345678
  },
  "autoroles": {
    "games": {
      "gacha": 123456789012345678,
      "csgo": 123456789012345678,
      "valorant": 123456789012345678,
      ...
    },
    "platforms": {
      "playstation": 123456789012345678,
      "xbox": 123456789012345678,
      ...
    },
    "dm_preferences": {
      "can_dm": 123456789012345678,
      "ask_dm": 123456789012345678,
      "no_dm": 123456789012345678
    }
  },
  "channels": {
    "autoroles_channel": 123456789012345678,
    "verification_channel": 123456789012345678
  }
}
```

### Passo 4: Reiniciar o Bot

Após editar o ficheiro, reinicia o bot para carregar as novas configurações.

**Notas Importantes:**

- Use `0` para desativar roles/botões específicos
- O arquivo `utilities_config.json` não é commitado no git (está no .gitignore)
- Mantenha seus IDs privados e seguros

---

## 🐛 Resolução de Problemas

### Bot não inicia

- ✅ Verificar se o token está correto no `.env`
- ✅ Verificar se todas as dependências estão instaladas
- ✅ Verificar a versão do Python (`python --version`)

### Comandos de música não funcionam

- ✅ Verificar se FFmpeg está instalado (`ffmpeg -version`)
- ✅ Verificar se FFmpeg está no PATH ou em `bin/ffmpeg/`

### Base de dados não funciona

- ✅ Verificar permissões da pasta `data/`
- ✅ Deletar `data/epa_bot.db` e reiniciar (⚠️ perde dados)

### Comandos não aparecem no Discord

- ✅ Aguardar até 1 hora (comandos globais)
- ✅ Verificar permissões do bot no servidor
- ✅ Reiniciar o bot e o Discord

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
/setup_modlogs <#canal>  - Configurar canal de logs de moderação
```

- Logs automáticos de todas as ações (kick, ban, timeout, warn)
- Embeds formatados com informações completas
- Registro de filtro de palavras e quarentena

**Filtro de Palavras:**

```
/setup_wordfilter <ativar> [ação] - Configurar filtro (warn/timeout/kick/ban)
/addword <palavra>                - Adicionar palavra proibida
/removeword <palavra>             - Remover palavra
/listwords                        - Listar palavras proibidas
```

- Detecção automática de palavras proibidas
- Ações configuráveis (aviso, timeout, kick, ban)
- Logs detalhados de violações

**Sistema de Quarentena:**

```
/setup_quarantine <ativar> [role] [duração] - Configurar quarentena
```

- Role automática para novos membros
- Duração configurável em minutos
- Remoção automática após tempo definido

**Sistema de Appeals:**

```
/setup_appeals <ativar> [#canal] - Configurar appeals
/appeal <servidor_id> <motivo>   - Pedir unban (DM)
```

- Usuários banidos podem pedir revisão
- Appeals enviados para canal específico
- Processo organizado para moderação

**Auto-Moderação:**

```
/setup_antispam [ativar] [canal] [ação]          - Anti-spam com whitelist de canais
/setup_antiraid [ativar] [threshold] [intervalo] - Proteção anti-raid
/setup_nsfw [ativar] [canal] [ação] [api_key]   - Detecção de NSFW (DeepAI)
/setup_linkfilter [ativar] [bloquear_convites] [bloquear_phishing] [canal] [acao_canal] - Filtro de links maliciosos
/setup_strikes [ativar] [strikes_ban] [dias_expiracao] - Sistema de strikes
/setup_mentionspam [ativar] [max_mencoes] [max_mencoes_roles] - Proteção mention spam
/setup_slowmode [ativar] [threshold] [janela] [duracao] - Auto-slowmode
/setup_rolebackup [ativar] [restaurar_unban] - Backup de roles
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
│   ├── economy.py      # Sistema de economia básico
│   ├── economy_advanced.py # Economia avançada (trades, leilões, achievements)
│   ├── games.py        # Jogos básicos
│   ├── games_extra.py  # Jogos extras
│   ├── music.py        # Player de música
│   ├── social.py       # Sistema social (XP, perfis, badges)
│   ├── social_advanced.py # Social avançado (casamentos, streaks, histórico)
│   ├── social_advanced.py  # Social avançado (casamento, streaks, histórico)
│   ├── tickets.py      # Sistema de tickets
│   ├── moderation.py   # Moderação
│   ├── monitoring.py   # Monitoramento
│   ├── utilidades.py          # Utilitários básicos
│   ├── utilities_advanced.py  # Lembretes, Polls, Auto-roles, 2FA
│   ├── fun.py                 # Comandos divertidos
│   └── help.py                # Sistema de ajuda
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

ÉS TOTALMENTE RESPONSÁVEL POR:
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

Se não consegues configurar ou usar, **este bot não é para ti**.

### 💼 Bots Personalizados

Interessado num bot Discord personalizado para o teu servidor?

📧 **Email:** business.gnobre@gmail.com

_Desenvolvimento de bots Discord sob medida com funcionalidades customizadas para as tuas necessidades específicas._

---

## 🎓 Recursos de Aprendizagem

Se quiseres aprender a criar bots Discord:

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

**Última atualização:** Novembro de 2025

---
