# 📋 CHANGELOG

Todas as mudanças notáveis neste projeto serão documentadas neste ficheiro.

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
