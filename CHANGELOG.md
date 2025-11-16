# 📋 CHANGELOG

Todas as mudanças notáveis neste projeto serão documentadas neste ficheiro.

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
