# 📋 CHANGELOG

All notable changes to this project will be documented in this file.

---

## [2.8.0] - 2025-11-27

### 🔧 Utilities System - Complete Expansion

**Community Suggestions System**

- ✅ **Suggestions with Upvote/Downvote**

  - `/suggest <suggestion>` command to create suggestions
  - Automatic reactions system (👍/👎)
  - Dedicated channel for suggestions
  - Status: Pending, Approved, Denied
  - DM notifications for authors

- ✅ **Suggestion Management (Moderators)**
  - `/approve_suggestion <id> [note]` - Approve suggestion
  - `/deny_suggestion <id> <reason>` - Deny suggestion
  - `/setup_suggestions <channel>` - Configure system
  - Complete history in database

**Automated Giveaway System**

- ✅ **Giveaways with Requirements**

  - `/giveaway <duration> <winners> <prize> [requirements]`
  - Automatic random winner selection
  - React with 🎉 to participate
  - Countdown with Discord timestamps
  - Optional customizable requirements
  - Automatic winner announcements

- ✅ **Advanced Features**
  - Multiple winners possible
  - Automatic end after duration
  - Winner notifications
  - Giveaway history in database

**Timestamp Commands**

- ✅ **Discord Timestamp Generator**
  - `/timestamp <date_time> [style]` - Generate timestamp
  - 7 available styles:
    - Short Time (16:20)
    - Long Time (16:20:30)
    - Short Date (20/04/2021)
    - Long Date (20 April 2021)
    - Relative (2 months ago)
    - Full Date & Time
    - Day of Week, Date
  - Format: DD/MM/YYYY HH:MM
  - Automatic result preview

**Personal Notes System**

- ✅ **Private Notes per User**
  - `/note_add <title> <content> [tags]` - Create note
  - `/notes [tag]` - List notes (optional tag filter)
  - `/note_view <id>` - View complete note
  - `/note_delete <id>` - Delete note
  - Tag system for organization
  - Private notes (only visible to author)
  - Pinned notes support

**Voice Member Counter**

- ✅ **Complete Voice Tracker**

  - Automatic tracking of time in voice channels
  - Per-user statistics:
    - Total time in voice
    - Number of sessions
    - Average per session
    - Last session
  - Session history by date
  - Configurable minimum time (default: 60s)
  - Channel switches tracked separately

- ✅ **Statistics Commands**
  - `/voicestats [member]` - View individual stats
  - `/voiceleaderboard` - Top 10 users by time
  - Persistent data in database
  - Readable format (hours, minutes)

**Starboard (Hall of Fame)**

- ✅ **Favorite Messages System**

  - Messages with X⭐ go to special channel
  - Configurable threshold (default: 3 reactions)
  - Customizable emoji
  - Real-time star counter updates
  - Image and attachment preservation
  - Direct link to original message

- ✅ **Starboard Configuration**
  - `/setup_starboard <channel> [threshold] [emoji] [self_star]`
  - Allow/block self-starring
  - Automatic counter updates
  - Beautiful embeds in starboard channel

**AFK System**

- ✅ **Automatic AFK Status**
  - `/afk [reason]` - Set AFK status
  - Auto-reply when mentioned
  - Automatic removal when sending message
  - AFK time tracking
  - Temporary notifications (auto-delete)
  - Optional custom reason

### 🗄️ Database - New Tables

- `suggestions` - Community suggestions
- `suggestion_votes` - Suggestion votes
- `giveaways` - Active/ended giveaways
- `giveaway_entries` - Giveaway participants
- `personal_notes` - Private personal notes
- `voice_stats` - Voice session history
- `voice_totals` - Aggregated voice totals
- `starboard` - Messages in starboard
- `starboard_stars` - Individual star reactions
- `starboard_config` - Starboard configuration
- `afk_status` - User AFK status

### 📊 Performance Indexes

- `idx_suggestions_guild` - Fast server lookup
- `idx_suggestions_user` - Author lookup
- `idx_giveaways_status` - Status/date filter
- `idx_notes_user` - Notes by user
- `idx_voice_user` - Voice statistics
- `idx_voice_date` - History by date
- `idx_starboard_guild` - Starboard by server
- `idx_starboard_msg` - Message lookup
- `idx_afk_guild` - AFK status by server

### 📝 New Commands (23 total)

**Suggestions:**

- `/suggest` - Create suggestion
- `/approve_suggestion` - Approve (mod)
- `/deny_suggestion` - Deny (mod)
- `/setup_suggestions` - Configure channel

**Giveaways:**

- `/giveaway` - Create giveaway (mod)

**Timestamps:**

- `/timestamp` - Generate formatted timestamp

**Notes:**

- `/note_add` - Add note
- `/notes` - List notes
- `/note_view` - View complete note
- `/note_delete` - Delete note

**Voice:**

- `/voicestats` - View statistics
- `/voiceleaderboard` - Top 10

**Starboard:**

- `/setup_starboard` - Configure starboard

**AFK:**

- `/afk` - Set AFK status

### 🎯 Event Listeners Added

- `on_message` - AFK system (detection and removal)
- `on_raw_reaction_add` - Starboard (star counting)
- `on_voice_state_update` - Voice Tracker (join/leave/switch)

### ⏱️ Background Tasks

- `check_giveaways` - Check giveaway completion (1 min)

### 🔧 Configuration Files

**`config/utilities_config.json` - New Sections:**

```json
{
  "suggestions": {
    "channel_id": 0,
    "review_role_id": 0,
    "auto_approve": false,
    "min_upvotes_auto_approve": 10
  },
  "starboard": {
    "channel_id": 0,
    "star_threshold": 3,
    "emoji": "⭐",
    "enabled": false,
    "self_star": false
  },
  "giveaways": {
    "default_duration": 86400,
    "ping_role_id": 0
  },
  "voice_tracker": {
    "enabled": true,
    "leaderboard_channel": 0,
    "min_session_time": 60
  }
}
```

---

## [2.7.2] - 2025-11-27

### 🛡️ Moderation System - Advanced Extensions

**Malicious Link Filter**

- ✅ **Dangerous Link Detection**

  - Block Discord invites (discord.gg, discord.com/invite)
  - Detect known phishing domains
  - Customizable domain whitelist/blacklist
  - Channel whitelist where links are allowed
  - Configurable actions: delete, warn, timeout, kick
  - Integration with strikes system

- ✅ **Link Configuration**
  - `/setup_linkfilter` command for management
  - Add/remove channels from whitelist
  - Toggle Discord invite blocking
  - Toggle phishing detection

**Strikes System (3 Strikes = Ban)**

- ✅ **Progressive Infraction Management**

  - Automatic strikes on violations (malicious links, mention spam)
  - Manual strikes with `/strike <user> <reason>` command
  - 3 strikes = automatic ban
  - Automatic strike expiry (default: 30 days)
  - Complete strike history per user

- ✅ **Progressive Actions**

  - Strike 1: DM warning
  - Strike 2: 24-hour timeout
  - Strike 3: Permanent automatic ban

- ✅ **Management Commands**
  - `/strike <member> <reason>` - Add manual strike
  - `/strikes [member]` - View strikes (own or others)
  - `/clearstrikes <member>` - Clear all strikes (admin)
  - `/setup_strikes` - Configure system (threshold, expiry)

**Mention Spam Protection**

- ✅ **Mention Limits**

  - Maximum user mentions (default: 5)
  - Maximum role mentions (default: 2)
  - Block unauthorized @everyone/@here
  - Auto-delete violating messages
  - Moderator bypass

- ✅ **Automatic Actions**
  - Automatic timeout (default: 10 minutes)
  - Integration with strikes system
  - Detailed violation logs
  - `/setup_mentionspam` configuration command

**Auto-Slowmode During Raids**

- ✅ **Smart Activation**

  - Configurable message threshold (default: 20 messages in 10s)
  - Adjustable slowmode duration (default: 10s)
  - Configurable slowmode time (default: 5 minutes)
  - Automatic removal after expiry
  - Per-channel tracking

- ✅ **Configuration**
  - `/setup_slowmode` command for adjustments
  - Automatic channel notification
  - Activation/deactivation logs

**Role Backup on Bans**

- ✅ **Role Preservation**

  - Automatic role backup when banning users
  - Automatic restoration on unban (configurable)
  - Manual restoration available
  - Role hierarchy verification
  - Support for multiple bans/unbans

- ✅ **Updated Commands**
  - `/ban` now automatically backs up roles
  - `/unban` restores roles if configured
  - `/setup_rolebackup` to enable/disable system

### 🗄️ Database

**New Tables**

- `moderation_strikes` - Strike storage with expiry tracking
- `role_backups` - JSON role backup for restoration

**Performance Indexes**

- `idx_strikes_user` - Fast strike lookup by user
- `idx_strikes_active` - Efficient active strike filtering
- `idx_role_backups_user` - Fast role backup lookup

---

## [2.7.1] - 2025-11-26

### 🛡️ Advanced Moderation System

**Anti-Spam with Channel Whitelist**

- ✅ **Intelligent Spam Detection**

  - Configurable message limit per time interval
  - Duplicate/identical message detection
  - Cumulative warning system
  - Auto-delete spam messages
  - Automatic moderator bypass

- ✅ **Channel Whitelist**
  - Add/remove channels where spam is allowed
  - `/setup_antispam` command with actions: add, remove, list
  - Per-channel configuration (not global)

**Anti-Raid Protection**

- ✅ **Suspicious Join Monitoring**

  - Configurable threshold (X members in Y seconds)
  - Automatic action when raid detected (kick by default)
  - Detailed logs with join timestamps
  - Limpeza automática da lista após deteção

- ✅ **Configuração Flexível**
  - Comando `/setup_antiraid` para ajustar thresholds
  - Intervalo de tempo personalizável
  - Sistema ativa automaticamente ao detetar padrões

**NSFW Detection**

- ✅ **Análise de Imagens com IA**

  - Integração com DeepAI API
  - Confidence threshold ajustável (0.0-1.0)
  - Suporte para: PNG, JPG, JPEG, GIF, WEBP
  - Ações automáticas: delete, warn, timeout, kick

- ✅ **Whitelist de Canais NSFW**
  - Permitir conteúdo NSFW em canais específicos
  - Comando `/setup_nsfw` com gestão de whitelist
  - API key configurável via comando

**Comandos Adicionados**

- `/setup_antispam [enable] [channel] [action]` - Configurar anti-spam e whitelist
- `/setup_antiraid [enable] [threshold] [interval]` - Configurar proteção anti-raid
- `/setup_nsfw [enable] [channel] [action] [api_key]` - Configurar deteção NSFW

**Melhorias na Configuração**

- ✅ Config JSON expandido com novas opções:

  - `anti_spam`: message_threshold, time_window, duplicate_threshold, whitelisted_channels
  - `anti_raid`: join_threshold, time_window, action, lockdown_duration
  - `nsfw_detection`: api_key, confidence_threshold, whitelisted_channels, action

- ✅ Todas as features suportam configuração por canal
- ✅ Logs detalhados enviados para canal de moderação
- ✅ Sistema integrado nos listeners `on_message` e `on_member_join`

### 🌍 Tradução para Inglês

- ✅ Todos os novos comandos traduzidos no branch `en`
- ✅ Descrições e mensagens em inglês
- ✅ Help atualizado em ambas as versões (PT e EN)

---

## [2.8.0] - 2025-11-27

### 🔧 Sistema de Utilidades - Expansão Completa

**Sistema de Sugestões da Comunidade**

- ✅ **Sugestões com Upvote/Downvote**

  - Comando `/suggest <sugestão>` para criar sugestões
  - Sistema automático de reações (👍/👎)
  - Canal dedicado para sugestões
  - Status: Pendente, Aprovada, Recusada
  - Notificações em DM para autores

- ✅ **Gestão de Sugestões (Moderadores)**
  - `/approve_suggestion <id> [nota]` - Aprovar sugestão
  - `/deny_suggestion <id> <razão>` - Recusar sugestão
  - `/setup_suggestions <canal>` - Configurar sistema
  - Histórico completo em base de dados

**Sistema de Giveaways Automatizado**

- ✅ **Giveaways com Requisitos**

  - `/giveaway <duração> <vencedores> <prêmio> [requisitos]`
  - Seleção automática de vencedores aleatórios
  - Reação 🎉 para participar
  - Contagem regressiva com timestamps do Discord
  - Requisitos personalizáveis opcionais
  - Anúncio automático dos vencedores

- ✅ **Funcionalidades Avançadas**
  - Múltiplos vencedores possíveis
  - Término automático após duração
  - Notificações para vencedores
  - Histórico de giveaways em database

**Comandos de Timestamp**

- ✅ **Gerador de Timestamps do Discord**
  - `/timestamp <data_hora> [estilo]` - Gerar timestamp
  - 7 estilos disponíveis:
    - Data e Hora Curta (16:20)
    - Data e Hora Longa (16:20:30)
    - Data Curta (20/04/2021)
    - Data Longa (20 Abril 2021)
    - Relativo (há 2 meses)
    - Data e Hora Completa
    - Dia da Semana, Data
  - Formato: DD/MM/YYYY HH:MM
  - Preview automático do resultado

**Sistema de Notas Pessoais**

- ✅ **Notas Privadas por Usuário**
  - `/note_add <título> <conteúdo> [tags]` - Criar nota
  - `/notes [tag]` - Listar notas (filtro por tag opcional)
  - `/note_view <id>` - Ver nota completa
  - `/note_delete <id>` - Apagar nota
  - Sistema de tags para organização
  - Notas privadas (apenas visível para o autor)
  - Suporte para notas fixadas (pin)

**Contador de Membros em Voz**

- ✅ **Voice Tracker Completo**

  - Rastreamento automático de tempo em canais de voz
  - Estatísticas por usuário:
    - Tempo total em voz
    - Número de sessões
    - Média por sessão
    - Última sessão
  - Histórico de sessões por data
  - Tempo mínimo configurável (padrão: 60s)
  - Mudanças de canal rastreadas separadamente

- ✅ **Comandos de Estatísticas**
  - `/voicestats [membro]` - Ver estatísticas individuais
  - `/voiceleaderboard` - Top 10 usuários por tempo
  - Dados persistentes em database
  - Formato legível (horas, minutos)

**Starboard (Hall da Fama)**

- ✅ **Sistema de Mensagens Favoritas**

  - Mensagens com X⭐ vão para canal especial
  - Threshold configurável (padrão: 3 reações)
  - Emoji personalizável
  - Contador de stars atualizado em tempo real
  - Preservação de imagens e anexos
  - Link direto para mensagem original

- ✅ **Configuração do Starboard**
  - `/setup_starboard <canal> [threshold] [emoji] [self_star]`
  - Permitir/bloquear self-starring
  - Atualização automática de contadores
  - Embeds bonitos no canal starboard

**Sistema AFK**

- ✅ **Status AFK Automático**
  - `/afk [razão]` - Definir status AFK
  - Auto-resposta quando mencionado
  - Remoção automática ao enviar mensagem
  - Contagem de tempo AFK
  - Notificações temporárias (auto-delete)
  - Razão personalizada opcional

### 🗄️ Base de Dados - Novas Tabelas

- `suggestions` - Sugestões da comunidade
- `suggestion_votes` - Votos em sugestões
- `giveaways` - Giveaways ativos/terminados
- `giveaway_entries` - Participantes em giveaways
- `personal_notes` - Notas pessoais privadas
- `voice_stats` - Histórico de sessões de voz
- `voice_totals` - Totais agregados de voz
- `starboard` - Mensagens no starboard
- `starboard_stars` - Reações de star individuais
- `starboard_config` - Configuração do starboard
- `afk_status` - Status AFK dos usuários

### 📊 Índices de Performance

- `idx_suggestions_guild` - Busca rápida por servidor
- `idx_suggestions_user` - Busca por autor
- `idx_giveaways_status` - Filtro por status/data
- `idx_notes_user` - Notas por usuário
- `idx_voice_user` - Estatísticas de voz
- `idx_voice_date` - Histórico por data
- `idx_starboard_guild` - Starboard por servidor
- `idx_starboard_msg` - Busca por mensagem
- `idx_afk_guild` - Status AFK por servidor

### 📝 Novos Comandos (23 no total)

**Sugestões:**

- `/suggest` - Criar sugestão
- `/approve_suggestion` - Aprovar (mod)
- `/deny_suggestion` - Recusar (mod)
- `/setup_suggestions` - Configurar canal

**Giveaways:**

- `/giveaway` - Criar giveaway (mod)

**Timestamps:**

- `/timestamp` - Gerar timestamp formatado

**Notas:**

- `/note_add` - Adicionar nota
- `/notes` - Listar notas
- `/note_view` - Ver nota completa
- `/note_delete` - Apagar nota

**Voz:**

- `/voicestats` - Ver estatísticas
- `/voiceleaderboard` - Top 10

**Starboard:**

- `/setup_starboard` - Configurar starboard

**AFK:**

- `/afk` - Definir status AFK

### 🎯 Event Listeners Adicionados

- `on_message` - Sistema AFK (detecção e remoção)
- `on_raw_reaction_add` - Starboard (contagem de stars)
- `on_voice_state_update` - Voice Tracker (join/leave/switch)

### ⏱️ Tasks em Background

- `check_giveaways` - Verificar término de giveaways (1 min)

### 🔧 Ficheiros de Configuração

**`config/utilities_config.json` - Novas Secções:**

```json
{
  "suggestions": {
    "channel_id": 0,
    "review_role_id": 0,
    "auto_approve": false,
    "min_upvotes_auto_approve": 10
  },
  "starboard": {
    "channel_id": 0,
    "star_threshold": 3,
    "emoji": "⭐",
    "enabled": false,
    "self_star": false
  },
  "giveaways": {
    "default_duration": 86400,
    "ping_role_id": 0
  },
  "voice_tracker": {
    "enabled": true,
    "leaderboard_channel": 0,
    "min_session_time": 60
  }
}
```

---

## [2.7.2] - 2025-11-27

### 🛡️ Sistema de Moderação - Extensões Avançadas

**Filtro de Links Maliciosos**

- ✅ **Deteção de Links Perigosos**

  - Bloqueio de convites do Discord (discord.gg, discord.com/invite)
  - Deteção de domínios de phishing conhecidos
  - Whitelist/blacklist de domínios personalizável
  - Whitelist de canais onde links são permitidos
  - Ações configuráveis: delete, warn, timeout, kick
  - Integração com sistema de strikes

- ✅ **Configuração de Links**
  - Comando `/setup_linkfilter` para gestão
  - Adicionar/remover canais da whitelist
  - Ativar/desativar bloqueio de convites
  - Ativar/desativar bloqueio de phishing

**Sistema de Strikes (3 Strikes = Ban)**

- ✅ **Gestão de Infrações Progressivas**

  - Strike automático em violações (links maliciosos, mention spam)
  - Strike manual com comando `/strike <user> <reason>`
  - 3 strikes = ban automático
  - Expiração automática de strikes (padrão: 30 dias)
  - Histórico completo de strikes por usuário

- ✅ **Ações Progressivas**

  - Strike 1: Aviso em DM
  - Strike 2: Timeout de 24 horas
  - Strike 3: Ban automático permanente

- ✅ **Comandos de Gestão**
  - `/strike <membro> <motivo>` - Adicionar strike manualmente
  - `/strikes [membro]` - Ver strikes (próprios ou de outro usuário)
  - `/clearstrikes <membro>` - Limpar todos os strikes (admin)
  - `/setup_strikes` - Configurar sistema (threshold, expiração)

**Proteção Contra Mention Spam**

- ✅ **Limites de Menções**

  - Máximo de menções de usuários (padrão: 5)
  - Máximo de menções de roles (padrão: 2)
  - Bloqueio de @everyone/@here não autorizados
  - Auto-delete de mensagens violadoras
  - Bypass para moderadores

- ✅ **Ações Automáticas**
  - Timeout automático (padrão: 10 minutos)
  - Integração com sistema de strikes
  - Logs detalhados de violações
  - Comando `/setup_mentionspam` para configuração

**Auto-Slowmode durante Raids**

- ✅ **Ativação Inteligente**

  - Threshold de mensagens configurável (padrão: 20 mensagens em 10s)
  - Duração de slowmode ajustável (padrão: 10s)
  - Tempo de slowmode configurável (padrão: 5 minutos)
  - Remoção automática após expiração
  - Tracking por canal individual

- ✅ **Configuração**
  - Comando `/setup_slowmode` para ajustes
  - Notificação automática no canal
  - Logs de ativação/desativação

**Backup de Roles em Bans**

- ✅ **Preservação de Roles**

  - Backup automático de roles ao banir usuário
  - Restauração automática ao desbanir (configurável)
  - Restauração manual disponível
  - Verificação de hierarquia de roles
  - Suporte para múltiplos bans/unbans

- ✅ **Comandos Atualizados**
  - `/ban` agora faz backup de roles automaticamente
  - `/unban` restaura roles se configurado
  - `/setup_rolebackup` para ativar/desativar sistema

### 🗄️ Base de Dados

**Novas Tabelas**

- `moderation_strikes` - Armazenamento de strikes com expiração
- `role_backups` - Backup de roles JSON para restauração

**Índices para Performance**

- `idx_strikes_user` - Busca rápida de strikes por usuário
- `idx_strikes_active` - Filtragem eficiente de strikes ativos
- `idx_role_backups_user` - Busca rápida de backups de roles

---

## [2.7.1] - 2025-11-26

### 🛡️ Sistema de Moderação Avançado

**Anti-Spam com Whitelist de Canais**

- ✅ **Deteção Inteligente de Spam**

  - Limite de mensagens por intervalo de tempo (configurável)
  - Deteção de mensagens duplicadas/idênticas
  - Sistema de warnings acumulativos
  - Auto-delete de mensagens de spam
  - Bypass automático para moderadores

- ✅ **Whitelist de Canais**
  - Adicionar/remover canais onde spam é permitido
  - Comando `/setup_antispam` com ações: add, remove, list
  - Configuração por canal (não global)

**Anti-Raid Protection**

- ✅ **Monitoramento de Joins Suspeitos**

  - Threshold configurável (X membros em Y segundos)
  - Ação automática quando raid é detetado (kick por padrão)
  - Logs detalhados com timestamps dos joins
  - Limpeza automática da lista após deteção

- ✅ **Configuração Flexível**
  - Comando `/setup_antiraid` para ajustar thresholds
  - Intervalo de tempo personalizável
  - Sistema ativa automaticamente ao detetar padrões

**NSFW Detection**

- ✅ **Análise de Imagens com IA**

  - Integração com DeepAI API
  - Confidence threshold ajustável (0.0-1.0)
  - Suporte para: PNG, JPG, JPEG, GIF, WEBP
  - Ações automáticas: delete, warn, timeout, kick

- ✅ **Whitelist de Canais NSFW**
  - Permitir conteúdo NSFW em canais específicos
  - Comando `/setup_nsfw` com gestão de whitelist
  - API key configurável via comando

**Comandos Adicionados**

- `/setup_antispam [enable] [channel] [action]` - Configurar anti-spam e whitelist
- `/setup_antiraid [enable] [threshold] [interval]` - Configurar proteção anti-raid
- `/setup_nsfw [enable] [channel] [action] [api_key]` - Configurar deteção NSFW

**Melhorias na Configuração**

- ✅ Config JSON expandido com novas opções:

  - `anti_spam`: message_threshold, time_window, duplicate_threshold, whitelisted_channels
  - `anti_raid`: join_threshold, time_window, action, lockdown_duration
  - `nsfw_detection`: api_key, confidence_threshold, whitelisted_channels, action

- ✅ Todas as features suportam configuração por canal
- ✅ Logs detalhados enviados para canal de moderação
- ✅ Sistema integrado nos listeners `on_message` e `on_member_join`

### 🌍 Tradução para Inglês

- ✅ Todos os novos comandos traduzidos no branch `en`
- ✅ Descrições e mensagens em inglês
- ✅ Help atualizado em ambas as versões (PT e EN)

---

## [2.7.0] - 2025-11-24

### 🌍 Internacionalização

**Nova Branch: `en` (English)**

- ✅ Sistema completo de tradução implementado

  - Branch `main` = Português de Portugal (padrão)
  - Branch `en` = English
  - Infraestrutura i18n completa em `config/i18n.py`

- ✅ Versão em inglês disponível
  - Todos os comandos traduzidos
  - Documentação em inglês (README.md no branch en)
  - Sistema de configuração de idioma

**Como usar:**

- Para Português: `git checkout main`
- Para English: `git checkout en`

> Ver branch [en](https://github.com/Droppers02/Discord-Community-Bot/tree/en) para versão em inglês

---

## [2.6.1] - 2025-11-24

### ✨ Novos Comandos de Emoji

**Comandos de Utilidades**

- ✅ **`/emoji <emoji>`** - Ampliar emoji customizado

  - Mostra emoji em tamanho grande (até 1024x1024)
  - Suporta emojis animados (GIF) e estáticos (PNG)
  - Links para download em múltiplos tamanhos
  - Deteta automaticamente tipo de emoji

- ✅ **`/emojiinfo <emoji>`** - Informações técnicas do emoji
  - ID, nome e tipo do emoji
  - Data de criação e criador (se disponível)
  - Status de disponibilidade e gestão
  - Roles com acesso (se restrito)
  - URL direto e markdown para copiar
  - Thumbnail com preview do emoji

**Melhorias**

- Validação automática de emojis customizados
- Suporte completo para emojis animados
- Interface intuitiva com embeds informativos
- Links diretos para CDN do Discord

### 🐛 Correções de Bugs

- ✅ **Blackjack desaparecido** - Corrigido erro de sintaxe que impedia o carregamento do comando `/blackjack`
  - Removido bloco `try` duplicado no comando `/quiz`
  - Todos os comandos de jogos agora carregam corretamente

---

## [2.6.0] - 2025-11-20

### 💰 Sistema de Economia Avançado

**Nova Base de Dados (9 tabelas adicionadas)**

- ✅ **Custom Roles** (`custom_roles`)

  - Roles personalizadas compradas por utilizadores
  - Suporte para cores customizadas (hex ou nomes)
  - Uma role por utilizador, editável a qualquer momento

- ✅ **Trading P2P** (`trades`, `auction_bids`)

  - Sistema completo de trocas entre utilizadores
  - Propostas com botões interativos (Aceitar/Recusar)
  - Histórico de trades pendentes e completos

- ✅ **Achievements** (`achievements`, `user_achievements`)

  - 7 conquistas pré-definidas com recompensas
  - Sistema de unlock automático baseado em ações
  - Rewards: 10k-50k coins por achievement

- ✅ **Leilões** (`auctions`, `auction_bids`)

  - Criar leilões de itens raros
  - Sistema de lances competitivo
  - Preço de "Compra Já" opcional
  - Duração configurável (1-168h)

- ✅ **Eventos Especiais** (`active_events`)

  - 4 tipos: Happy Hour, Super Sorte, Chuva de Ouro, Dailies Especiais
  - Multiplicadores de coins customizáveis
  - Administradores podem ativar eventos temporários

- ✅ **Inventário de Itens** (`inventory_items`)
  - Sistema de itens raros colecionáveis
  - 6 raridades: Comum, Incomum, Raro, Épico, Lendário, Mítico
  - Itens tradeáveis vs não-tradeáveis

**Novos Comandos de Economia (16 total)**

- ✅ `/trabalho` - Trabalhar por coins (cooldown 1h)

  - 8 profissões diferentes com recompensas variadas (300-650 coins)
  - 10% chance de bónus aleatório (100-300 coins)
  - Cooldown visual com barra de progresso

- ✅ `/crime` - Crimes arriscados (cooldown 2h)
  - 5 tipos de crime com riscos/recompensas diferentes
  - Taxas de sucesso: 40-55%
  - Ganhos: 500-1800 coins (sucesso) ou multas: 250-1000 coins (falha)
  - 5% chance de jackpot (500-1000 coins extra)

**Custom Roles:**

- ✅ `/comprar_role <nome> <cor>` - Comprar role personalizada (50,000 coins)
- ✅ `/editar_role [nome] [cor]` - Editar role existente (grátis)
- ✅ `/remover_role` - Remover role permanentemente

**Trading:**

- ✅ `/propor_trade <@user> <tuas_coins> <pedes_coins>` - Propor troca
- ✅ `/trades_pendentes` - Ver trades pendentes (enviados e recebidos)

**Achievements:**

- ✅ `/conquistas [@user]` - Ver conquistas desbloqueadas
- Conquistas disponíveis:
  - 💰 Primeiro Milhão (1M coins) - 50k reward
  - 💸 Grande Gastador (500k gastos) - 25k reward
  - 🍀 Sorte 7 (7 apostas seguidas) - 10k reward
  - 🎒 Colecionador (50 itens) - 30k reward
  - 🤝 Trader Pro (20 trades) - 15k reward
  - 🔨 Mestre dos Leilões (10 vitórias) - 20k reward
  - ⚔️ Guerreiro Diário (30 dias streak) - 40k reward

**Leilões:**

- ✅ `/criar_leilao <item> <desc> <lance> [compra_ja] [horas]` - Criar leilão
- ✅ `/leiloes` - Ver leilões ativos
- ✅ `/dar_lance <id> <valor>` - Dar lance
- Sistema de lance mínimo: 5% do lance atual ou 100 coins

**Eventos (Admin):**

- ✅ `/criar_evento <tipo> <horas> [multiplicador]` - Ativar evento
- ✅ `/eventos_ativos` - Ver eventos em curso

**Melhorias no Sistema Existente**

- ✅ **Cooldowns Visuais Avançados**

  - Barras de progresso `[████░░░░░░]` com percentagem
  - Timestamps Discord `<t:timestamp:R>` (formato relativo)
  - Display de tempo restante em HH:MM:SS

- ✅ **22 Novos Métodos na Database** (`utils/database.py`)
  - `create_custom_role()`, `get_custom_role()`, `delete_custom_role()`
  - `create_trade()`, `get_trade()`, `update_trade_status()`, `get_pending_trades()`
  - `add_achievement()`, `unlock_achievement()`, `get_user_achievements()`, `claim_achievement_reward()`
  - `create_auction()`, `place_bid()`, `get_auction()`, `get_active_auctions()`, `complete_auction()`
  - `create_event()`, `get_active_events()`
  - `add_inventory_item()`, `get_user_inventory()`, `remove_inventory_item()`

**Documentação**

- ✅ Atualizado `/help` com comandos de economia avançada
- ✅ Atualizado `README.md` com todas as features
- ✅ Atualizado `TODO.md` marcando 6 tarefas completas
- ✅ Novo ficheiro: `cogs/economy_advanced.py` (1000+ linhas)

**Estatísticas da Versão**

- **1,436 linhas** de código adicionadas
- **5 ficheiros** modificados
- **9 tabelas** de database
- **16 comandos** novos
- **22 métodos** de database

---

## [2.5.0] - 2025-11-20

### 🎮 Sistema de Jogos v2 - Completo Overhaul

**Correções**

- ✅ **Jogo do Galo**: Corrigido bug "this application did not respond" (timeout error)
  - Adicionado proper `interaction.response` handling nas callbacks
  - Jogo agora responde instantaneamente sem timeouts

**Novos Jogos**

- ✅ **4 em Linha** (`/4emlinha`)

  - Jogo clássico Connect Four com IA bot
  - Tabuleiro 6x7 interativo com botões
  - Bot AI com estratégia: ganhar > bloquear > centro > aleatório
  - Detecção automática de vitória (horizontal, vertical, diagonal)

- ✅ **Mini-Jogos de Reação** (3 novos jogos):
  - `/reacao` - Clica no emoji correto o mais rápido possível (10s)
  - `/matematica` - Resolve cálculos simples (+, -, ×) contra o tempo (15s)
  - `/memoria` - Jogo de memória com pares de emojis (30s)
  - Recompensas dinâmicas baseadas na velocidade de reação
  - Sistema de múltipla escolha com botões

**Melhorias em Jogos Existentes**

- ✅ **Forca** (`/forca`)
  - Interface completamente redesenhada com botões
  - 26 botões alfabéticos em grid 5x5+1
  - 20 palavras novas com sistema de dicas
  - Display visual do boneco da forca (ASCII art)
  - UX muito melhorada vs sistema antigo de texto

**Sistema de Estatísticas**

- ✅ **Base de Dados de Stats** (`utils/database.py`)

  - Nova tabela `game_stats`: tracking completo por jogo e utilizador
  - Campos: wins, losses, draws, total_games, total_earnings, best_streak, current_streak
  - Nova tabela `tournaments` (estrutura pronta para futuro)
  - Métodos: `update_game_stats()`, `get_game_stats()`, `get_game_leaderboard()`
  - Indexes otimizados para performance

- ✅ **Comandos de Estatísticas**:
  - `/gamestats [@user] [jogo]` - Ver stats detalhadas
    - Win rate, total de jogos, earnings, streaks
    - Filtro por jogo específico ou visão geral
  - `/gameleaderboard <jogo>` - Top 10 rankings
    - Leaderboards por tipo de jogo
    - Medals (🥇🥈🥉) para top 3
    - Jogos suportados: galo, 4emlinha, forca, quiz, blackjack, reacao, matematica, memoria

**Documentação**

- ✅ Atualizado `/help` com 3 seções de jogos (Principais, Mini-Jogos, Estatísticas)
- ✅ Atualizado `README.md` com todos os novos comandos
- ✅ Atualizado `TODO.md` marcando features completas

**Resumo**

- **9 jogos** totais disponíveis (4 clássicos + 2 aposta + 3 mini-jogos)
- **Sistema completo de stats** com tracking automático
- **Leaderboards** competitivos por jogo
- **Todas as features** do TODO completadas (exceto Poker/Torneios)

---

## [2.4.0] - 2025-11-20

### 🛡️ Sistema de Moderação Avançado

**Logs Detalhados de Moderação**

- ✅ Comando `/setup_modlogs` para configurar canal de logs
- ✅ Logs automáticos para todas as ações (kick, ban, timeout, warn, unban)
- ✅ Embeds formatados com informações completas (usuário, moderador, motivo, timestamp)
- ✅ Logs de filtro de palavras e sistema de quarentena
- ✅ Thumbnails com avatar do usuário afetado

**Filtro de Palavras Proibidas**

- ✅ `/setup_wordfilter` - Ativar/desativar e configurar ação
- ✅ `/addword` - Adicionar palavras à lista proibida
- ✅ `/removeword` - Remover palavras da lista
- ✅ `/listwords` - Listar palavras (com spoiler)
- ✅ Detecção automática em mensagens (regex boundary)
- ✅ Ações configuráveis: warn, timeout (10min), kick, ban
- ✅ Moderadores têm bypass automático
- ✅ Logs detalhados de violações

**Sistema de Quarentena para Novos Membros**

- ✅ `/setup_quarantine` - Configurar sistema
- ✅ Role automática aplicada ao entrar no servidor
- ✅ Duração configurável em minutos (padrão: 10min)
- ✅ Remoção automática via task periódica
- ✅ Logs de aplicação e remoção
- ✅ Sistema de tracking interno

**Sistema de Appeals**

- ✅ `/setup_appeals` - Configurar canal de appeals
- ✅ `/appeal` - Comando em DM para pedir unban
- ✅ Validação de servidor e permissões
- ✅ Embeds formatados enviados para canal de moderação
- ✅ Prevenção de spam de appeals

**Timeout com Presets**

- ✅ Comando `/timeout` reformulado com presets rápidos
- ✅ 10 presets: 1m, 5m, 10m, 30m, 1h, 6h, 12h, 1d, 3d, 1w
- ✅ Select menu integrado para escolha fácil
- ✅ Formatação automática de duração
- ✅ Logs com duração formatada

**Configuração**

- 📝 Novo arquivo `config/moderation_config.json`
- 📝 Configurações centralizadas (logs, filtro, quarentena, appeals, presets)
- 📝 Fácil personalização sem modificar código

**Melhorias nos Comandos Existentes**

- 🔧 Logs adicionados aos comandos kick e ban
- 🔧 Melhor formatação de embeds
- 🔧 Validações aprimoradas

### 📝 Documentação

- 📖 README atualizado com todos os novos comandos de moderação
- 📖 Seção expandida com exemplos e explicações
- 📖 TODO.md atualizado com tarefas concluídas

---

## [2.3.1] - 2025-11-20

### 🔒 Sistema de Verificação 2FA - Melhorias e Correções

**Sistema de Configuração JSON**

- ✅ Novo ficheiro `config/utilities_config.json` para personalização de IDs
- ✅ Suporte para configurar todas as roles e canais sem modificar código
- ✅ Ficheiro commitado no git para fácil deploy
- ✅ Documentação integrada no README.md

**Correções Críticas do 2FA**

- 🐛 **Fix**: Role de membro agora removida ao iniciar verificação (evita bypass do Discord Onboarding)
- 🐛 **Fix**: Corrigido erro "Something went wrong" no modal matemático
- 🐛 **Fix**: Erro 400 ao enviar DM com código resolvido (timestamp removido)
- 🐛 **Fix**: Modal dentro de modal substituído por botão intermediário
- 🐛 **Fix**: Ordem correta de operações (modal → DM em vez de DM → modal)

**Melhorias no Fluxo de Verificação**

- 🎯 Nova UI com botão "🔐 Inserir Código" após fase matemática
- 🔍 Logs detalhados em cada etapa do processo
- ✅ Verificação de permissões do bot antes de remover/adicionar roles
- 📊 Confirmação visual de atribuição de role com fetch_member()
- ⚠️ Error handlers para melhor tratamento de exceções

**Melhorias Técnicas**

- 🔧 `VerificationView` agora recebe config como parâmetro
- 🔧 Auto-criação de utilities_config.json a partir do exemplo (removido posteriormente)
- 🔧 Remoção de código duplicado e mal indentado em `cogs/help.py`
- 🔧 Logs DEBUG removidos após resolução dos problemas

### 📝 Documentação

- 📖 Instruções de configuração consolidadas no README.md
- 📖 Seção "Configuração de IDs Personalizados" adicionada
- 📖 Guia passo-a-passo para obter IDs do Discord

---

## [2.3.0] - 2025-11-19

### 🎉 Sistema Avançado de Utilidades

- **Novo Cog** - `utilities_advanced.py` com 6 sistemas integrados

### 📌 Lembretes Inteligentes

- **Lembretes Simples e Recorrentes** - Suporte para s, m, h, d
- **Comando /lembrete** - Criar lembretes com tempo customizado
- **Comando /meus_lembretes** - Ver todos os lembretes ativos
- **Sistema Automático** - Verificação periódica e envio automático
- **Persistência** - Dados guardados em JSON

### 📊 Sistema de Polls/Votações

- **Polls Interativas** - Até 5 opções por votação
- **Interface com Botões** - Votar com um clique
- **Estatísticas em Tempo Real** - Percentagens e barras visuais
- **Prevenção de Duplicados** - Um voto por utilizador
- **Comando /poll** - Criar polls facilmente

### 📢 Anúncios Agendados

- **Agendar Anúncios** - Envio futuro ou imediato
- **Comando /anuncio** - Apenas para administradores
- **Verificação Automática** - Sistema de tasks periódicas
- **Múltiplos Canais** - Agendar para qualquer canal

### 🎮 Auto-Roles em 3 Painéis (30 Roles!)

- **3 Painéis Separados** - Melhor organização visual
- **Painel 1: Jogos (Azul)** - 15 roles de jogos populares
  - Gacha, CSGO, Valorant, Overwatch, LoL, Anime, Ark, Runeterra
  - GTA V RP, Rocket League, Marvel Rivals, Minecraft, DBD, Fortnite, Roblox
- **Painel 2: Plataformas (Verde)** - 4 plataformas de gaming
  - PlayStation, Xbox, PC, Mobile
- **Painel 3: DM (Laranja)** - 3 preferências de mensagens
  - Podem enviar DM, Perguntar para DM, Não enviar DM
- **Botões Cinzentos** - Estilo secondary em todos os botões
- **Toggle Automático** - Adicionar/Remover com um clique
- **Persistent Views** - Botões funcionam após restart
- **Comando /setup_autoroles** - Cria os 3 painéis automaticamente
- **IDs Configurados** - Canal recomendado: 869989783856877618

### ✅ Sistema de Verificação 2FA

- **Verificação em 2 Fases** - Segurança contra bots
- **Fase 1: Desafio Matemático** - Conta aleatória (soma ou subtração)
- **Fase 2: Código DM** - Código de 8 dígitos enviado por mensagem privada
- **Role Automática** - ID: 870001773648171178
- **Welcome Message** - Mensagem personalizada após verificação completa
- **Logs Detalhados** - Rastreio de cada fase do processo
- **Proteção de DM** - Aviso se utilizador tem DMs desativadas
- **Comando /setup_verificacao** - Configuração com embed informativo
- **Comando /setup_verificacao** - Configuração instantânea
- **Canal Dedicado** - ID: 688416170998497347

### 🚀 Deploy & Hosting

- **Suporte Railway.app** - Configuração completa
- **Arquivos Criados** - railway.json, Procfile, runtime.txt, nixpacks.toml
- **FFmpeg Incluído** - Comandos de música funcionam
- **512MB RAM** - 5x mais que Discloud
- **Deploy Automático** - Via GitHub
- **Região Europa** - Menor latência para Portugal

### 🔧 Melhorias Técnicas

- **Views Persistentes** - Botões funcionam após restart
- **Tasks Periódicas** - Verificação automática de lembretes e anúncios
- **Error Handling** - Tratamento completo de erros
- **Logs Detalhados** - Registo de todas as ações
- **Persistência JSON** - Dados guardados automaticamente

### 🐛 Correções

- **Level Up Duplicado** - Corrigido envio de 2 embeds ao subir de nível
- **Nixpacks.toml** - Formato corrigido para Railway
- **Cache Python** - Sistema de limpeza implementado

### 📚 Documentação

- **README Atualizado** - Instruções de deploy Railway
- **Help Command** - Novos comandos documentados
- **TODO.md** - Tarefas marcadas como concluídas

---

## [2.2.0] - 2025-11-16

### 🎫 Sistema de Tickets Profissional

- **Refatoração Completa** - Sistema de tickets totalmente reconstruído do zero
- **Painel com Categorias** - Dropdown com 5 categorias (Suporte Técnico, Dúvidas, Reports, Sugestões, Outros)
- **Formato Melhorado** - Tickets agora seguem formato `🎫┃username-0001` com ID sequencial
- **Limite de Tickets** - Utilizadores limitados a 1 ticket aberto por vez
- **Comando /rename** - Staff pode renomear tickets facilmente
- **Embeds Personalizados** - Cada categoria tem embed único com dicas específicas
- **Otimização** - Sistema ultrarrápido sem timeouts, usando defer() e criação assíncrona

### 🔧 Melhorias Técnicas

- **Configuração via .env** - `TICKET_CATEGORY_ID` movido para variáveis de ambiente
- **Sistema de IDs** - Contador sequencial por servidor para tickets organizados
- **Validação** - Verificação automática de tickets duplicados por utilizador
- **Logs Detalhados** - Registo completo de criação, renomeação e fecho de tickets

### 🐛 Correções

- Corrigido import do config nos tickets
- Removido cache Python que causava erros
- Otimizada criação de canais (sem overwrites iniciais)

---

## [2.1.0] - 2025-11-16

### 🚀 Lançamento Público

- **Repositório Público** - Bot publicado no GitHub como open-source
- **Documentação Completa** - README.md expandido com instruções detalhadas de instalação
- **Limpeza de Código** - Remoção de referências a versões e branding "profissional"
- **Sanitização de Dados** - Remoção de IDs e dados sensíveis do código

### 🎮 Novos Comandos

- `/shipadm` - Comando admin para trollar com percentagens customizadas de ship

### 🔧 Melhorias

- **Ship Command** - Agora totalmente aleatório (removido seed por IDs)
- **Timeouts Fixes** - Adicionado `defer()` nos comandos ship para evitar timeouts
- **Português de Portugal** - Toda a documentação convertida para PT-PT
- **FFmpeg External** - Binários do FFmpeg removidos do repositório (utilizadores instalam manualmente)

### 🧹 Código Limpo

- Removidas referências a "v2.0" e "Profissional" de todos os ficheiros
- Simplificados docstrings e comentários
- `__version__` removido dos módulos `__init__.py`
- Pasta `backup_v1/` excluída do repositório

### 📚 Documentação

- **README.md** - Instruções completas de instalação, configuração e troubleshooting
- **TODO.md** - Ficheiro de tarefas futuras adicionado
- **CHANGELOG.md** - Histórico de versões atualizado
- **.gitignore** - Configurado para proteger dados sensíveis e backups

### 🛡️ Segurança

- IDs hardcoded removidos (SERVER_ID, MOD_ROLE_ID)
- Configuração 100% via `.env`
- Disclaimers legais adicionados
- Avisos sobre conhecimentos necessários

---

## [2.0.0] - 2024-12

### 🎉 Principais Mudanças

Esta é uma **reescrita completa** do bot com foco em escalabilidade e manutenibilidade.

### ✨ Novos Sistemas

#### 💾 Database & Storage

- **SQLite Database** - Migração completa de JSON para SQLite
- **Migração Automática** - Sistema de migração de dados JSON antigos
- **Backup Automático** - Backups automáticos a cada 24h com retenção de 7 dias
- **Async I/O** - Operações de ficheiros assíncronas com aiofiles

#### 🛡️ Moderação Completa

- `/kick` - Expulsar membros com razão e notificação
- `/ban` - Banir membros com logging completo
- `/unban` - Desbanir utilizadores
- `/timeout` - Aplicar timeout temporário
- `/untimeout` - Remover timeout
- `/warn` - Sistema de avisos com histórico
- `/warnings` - Ver avisos de utilizadores
- `/clear` - Limpeza de mensagens em massa

#### 📊 Monitoramento

- `/status` - Status completo do bot (uptime, CPU, RAM, latência)
- `/ping` - Verificação de latência
- `/serverinfo` - Informações detalhadas do servidor
- `/userinfo` - Informações de utilizadores

#### 🎫 Sistema de Tickets

- **Categorias** - 5 categorias (Técnico, Geral, Report, Sugestão, Outros)
- **Limite de Tickets** - 3 tickets ativos por utilizador
- **Transcrições HTML** - Geração de transcrições completas
- **Database** - Armazenamento em SQLite
- **Botões Interativos** - Interface moderna com Discord UI
- **Auto-arquivamento** - Tickets fechados são arquivados automaticamente

#### 🎨 Interface & UX

- **EmbedBuilder** - Sistema padronizado de embeds com cores consistentes
- **Paginação** - Sistema de paginação com botões para listas longas
- **Error Handling** - Gestão centralizada de erros
- **Views Persistentes** - Buttons e selects que persistem após restart

#### 📝 Logging Avançado

- **RotatingFileHandler** - Rotação automática de logs (5MB, 5 backups)
- **Níveis de Log** - INFO, WARNING, ERROR, CRITICAL
- **Formatação** - Logs formatados com timestamp e contexto
- **Cores no Console** - Logs coloridos para melhor leitura

### 🔄 Melhorias em Sistemas Existentes

#### 💰 Economia

- Migração para database SQLite
- Sistema de backup ao salvar
- Error handling melhorado
- Preparação para uso de embeds padronizados

#### ⭐ Social (XP & Níveis)

- Integração com EmbedBuilder
- Mensagens de level up aprimoradas
- Sistema de reputação
- Leaderboards melhorados

#### 🎮 Jogos

- Validações aprimoradas
- Mensagens de erro consistentes
- Melhor feedback visual

#### 🎵 Música

- Estrutura mantida
- Preparação para melhorias futuras

### 🔧 Infraestrutura

#### Configuração

- **Variáveis de Ambiente** - Configuração via .env
- **Config Class** - Classe centralizada de configuração
- **Validação** - Validação de configurações na inicialização
- **.env.example** - Template de configuração

#### Segurança

- **.gitignore** - Proteção de dados sensíveis
- **Sanitização de IDs** - Remoção de IDs hardcoded
- **Token Protection** - Token apenas em .env

#### Scripts

- **install.bat** - Instalação automática (Windows)
- **start.bat** - Início rápido do bot

### 📚 Documentação

#### Novos Documentos

- **README.md** - Documentação completa
- **CHANGELOG.md** - Este ficheiro
- **Disclaimers** - Avisos sobre conhecimentos necessários
- **Licença MIT** - Termos de uso claros

#### Guias Removidos

- INSTALL.md (consolidado no README)
- TROUBLESHOOTING.md (consolidado no README)
- MELHORIAS_APLICADAS.md (substituído por CHANGELOG)
- ATUALIZACAO_COMPLETA.md (substituído por CHANGELOG)

### 🐛 Correções

- Corrigido sistema de permissões em comandos de moderação
- Corrigido race conditions em operações de database
- Corrigido memory leaks em operações de música
- Corrigido formatação inconsistente de embeds

### 🗑️ Removido

- Dependência de JSON para dados principais
- IDs hardcoded do servidor
- Documentação redundante
- Código legacy não utilizado

### ⚡ Performance

- **Database** - SQLite muito mais rápido que JSON
- **Async Operations** - Todas operações I/O agora são assíncronas
- **Connection Pooling** - Gestão eficiente de conexões de database
- **Lazy Loading** - Cogs carregados sob demanda

### 📦 Dependências Adicionadas

```
aiosqlite>=0.19.0    # Database assíncrono
psutil>=5.9.0        # Monitoramento de sistema
aiofiles>=23.0.0     # I/O assíncrono de ficheiros
python-dotenv>=1.0.0 # Gestão de .env
```

---

## [1.0.0] - Versão Inicial - 2023

### Características Iniciais

- Sistema básico de economia (JSON)
- Jogos simples (blackjack, slots)
- Player de música básico
- Sistema de XP e níveis
- Comandos de utilidades
- Sistema de tickets básico

---

## Formato

O changelog segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere a [Semantic Versioning](https://semver.org/lang/pt-BR/).

### Tipos de Mudanças

- `✨ Novos Sistemas` - Novas funcionalidades principais
- `🔄 Melhorias` - Melhorias em funcionalidades existentes
- `🐛 Correções` - Correções de bugs
- `🗑️ Removido` - Funcionalidades removidas
- `⚡ Performance` - Melhorias de performance
- `🔧 Infraestrutura` - Mudanças na estrutura do projeto
- `📚 Documentação` - Mudanças na documentação
- `🔒 Segurança` - Correções de segurança

---

**[2.0.0]**: Atual  
**[1.0.0]**: Inicial (legacy)
