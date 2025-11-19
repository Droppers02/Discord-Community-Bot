# 📋 CHANGELOG

Todas as mudanças notáveis neste projeto serão documentadas neste ficheiro.

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

### 🎮 Auto-Roles Completo (23 Roles!)

- **Painel Permanente** - Botões sempre disponíveis
- **Toggle Automático** - Adicionar/Remover com um clique
- **23 Roles de Jogos** - Gacha, CSGO, Valorant, Overwatch, LoL, Anime, Ark, Runeterra, GTA V RP, Rocket League, Marvel Rivals, Minecraft, Dead by Daylight, Fortnite, Roblox
- **4 Roles de Plataformas** - PlayStation, Xbox, PC, Mobile
- **3 Roles de DM** - Podem DM, Perguntar, Não DM
- **Comando /setup_autoroles** - Configuração rápida
- **IDs Configurados** - Canal: 869989783856877618

### ✅ Sistema de Verificação

- **Verificação por Botão** - Sistema simples e eficaz
- **Role Automática** - ID: 870001773648171178
- **Welcome Message** - Mensagem personalizada após verificação
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
