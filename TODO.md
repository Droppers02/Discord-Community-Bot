# 📝 TODO - EPA BOT

Lista de tarefas, melhorias e correções planeadas para versões futuras.

---

## 🐛 Bugs Conhecidos

### Alta Prioridade

- [ ] Resolver bloqueio do YouTube em extração de músicas (bot detection)
- [ ] Verificar estabilidade do player de música em sessões longas
- [ ] Corrigir possível memory leak em comandos de música com fila grande

### Média Prioridade

- [ ] Melhorar tratamento de erros em comandos de economia
- [ ] Validar comportamento do sistema de tickets com múltiplos utilizadores simultâneos

### Baixa Prioridade

- [ ] Optimizar queries da base de dados para servidores grandes
- [ ] Melhorar mensagens de erro para utilizadores (mais user-friendly)

---

## ✨ Funcionalidades Planeadas

### Sistema de Economia

- [x] Loja de roles customizadas com cores
- [x] Sistema de trading entre utilizadores
- [x] Eventos especiais com bónus de moedas
- [x] Cooldowns visuais nos comandos (trabalho, crime)
- [x] Sistema de achievements/conquistas
- [x] Leilões de itens raros
- [ ] Inventário visual com itens colecionáveis
- [ ] Sistema de crafting de itens
- [ ] Missões diárias automáticas
- [ ] Sistema de ações/investimentos (stock market)
- [ ] Seguro de itens raros
- [ ] Sistema de impostos progressivo

### Sistema Social

- [x] Sistema de badges personalizados
- [x] Perfis customizáveis (bio, cor, banner, campos personalizados)
- [x] Sistema de casamento entre utilizadores
- [x] Histórico de atividade (últimas 20 ações)
- [x] Sistema de streaks (daily, mensagens, jogos)
- [x] Migração de XP para base de dados SQLite
- [x] Badges automáticos por níveis (10, 25, 50, 100)
- [x] Sistema de reputação integrado em SQLite
- [x] Top utilizadores por categoria (implementar queries completas)
- [x] Sistema de recompensas automáticas por streaks
- [x] Badges por achievements específicos
- [x] Sistema de aniversários de casamento
- [x] Ring tier upgrades (premium)
- [x] Sistema de amizades/friend list
- [x] Gráficos de atividade (charts de XP/mensagens)

### Jogos

- [ ] Adicionar poker Texas Hold'em
- [ ] Sistema de torneios automatizados
- [x] Estatísticas detalhadas por jogo
- [x] Leaderboards semanais/mensais
- [x] Mini-jogos de reação rápida
- [ ] Sistema de apostas em eventos
- [ ] Modo competitivo ranked
- [ ] Seasons com resets de leaderboard
- [ ] Battle royale (último a responder ganha)

### Música

- [x] Estratégias avançadas de extração YouTube (Android, iOS, TV clients)
- [ ] Implementar cookies/OAuth para bypass de bot detection
- [ ] Suporte para Spotify (via API)
- [ ] Playlists guardadas por utilizador
- [ ] Sistema de votação para skip (maioria vota)
- [ ] Equalizer com presets (bass boost, treble, etc.)
- [ ] Loop de fila completa
- [ ] Histórico de músicas tocadas
- [ ] Radio mode (auto-play similar tracks)
- [ ] Lyrics display (integração com Genius/MusixMatch)
- [ ] Queue shuffling
- [ ] Soundcloud/Bandcamp support

### Moderação

- [x] Logs detalhados de ações de moderação
- [x] Sistema de appeals para bans
- [x] Tempo de timeout customizável
- [x] Filtro de palavras proibidas
- [x] Sistema de quarentena para novos membros
- [x] Subcomandos /clear (quantidade, apartir, intervalo)
- [ ] Sistema de auto-moderação (anti-spam, anti-raid)
- [ ] Detecção de links maliciosos/phishing
- [ ] Sistema de strikes (3 strikes = ban automático)
- [ ] Moderação de imagens (NSFW detection)
- [ ] Auto-slowmode em raids
- [ ] Backup automático de roles ao banir (restaurar ao desbanir)

### Tickets

- [ ] Templates de respostas rápidas (FAQ)
- [ ] Sistema de prioridades (baixa, média, alta, urgente)
- [ ] Atribuição automática de staff disponível
- [ ] Estatísticas de tickets em tempo real (tempo médio, taxa de resolução)
- [ ] Sistema de feedback após fechamento (rating 1-5 estrelas)
- [ ] Integração com sistema de logs
- [ ] Optimizar queries da base de dados no comando /setup_tickets
- [ ] Transcrições de tickets salvos em arquivo
- [ ] Tags/categorias personalizáveis
- [ ] Notificações push para staff

### Utilidades

- [x] Sistema de lembretes recorrentes
- [x] Polls/votações avançadas
- [x] Sistema de anúncios agendados
- [x] Welcome messages customizáveis
- [x] Auto-roles em 3 painéis separados (Jogos, Plataformas, DM)
- [x] Sistema de verificação 2FA (desafio matemático + código DM)
- [x] Sistema de configuração JSON para roles/canais personalizáveis
- [x] Documentação de setup integrada no README
- [x] Correções do sistema 2FA (remoção de role, modals, DMs)
- [ ] Sistema de sugestões da comunidade (upvote/downvote)
- [ ] Sistema de giveaways automatizado com requisitos
- [ ] Comandos de utilidade para timestamps (<t:timestamp:F>)
- [ ] Sistema de notas pessoais privadas
- [ ] Contador de membros em voz (voice tracker)
- [ ] Starboard (mensagens com X reações vão para canal especial)
- [ ] AFK system (auto-resposta quando mencionado)

### Interface & UX

- [ ] Dashboard web para configuração (Flask/Django)
- [ ] Comandos com autocomplete inteligente
- [ ] Menus contextuais (apps de clique direito)
- [ ] Tutoriais interativos para novos utilizadores
- [ ] Temas de cores customizáveis por servidor
- [ ] Preview de comandos antes de executar
- [ ] Paginação com botões em todos os comandos longos
- [ ] Modal forms para inputs complexos
- [ ] Confirmações com botões (substituir reações)

---

## 🔧 Melhorias Técnicas

### Performance

- [ ] Implementar caching para queries frequentes (Redis)
- [ ] Optimizar carregamento de cogs (lazy loading)
- [ ] Reduzir uso de memória em operações de música
- [ ] Implementar rate limiting interno (cooldown manager)
- [ ] Lazy loading de recursos pesados
- [ ] Connection pooling para database
- [ ] Async everywhere (eliminar operações síncronas)

### Database

- [ ] Migração para PostgreSQL (opcional para produção)
- [ ] Sistema de backups incrementais automáticos
- [ ] Compressão de logs antigos (>30 dias)
- [ ] Índices optimizados para queries comuns
- [ ] Limpeza automática de dados antigos (GDPR compliance)
- [ ] Sharding para múltiplos servidores
- [ ] Migrations system (Alembic)

### Código

- [ ] Adicionar testes unitários (pytest)
- [ ] Implementar CI/CD (GitHub Actions)
- [ ] Melhorar documentação inline
- [ ] Refactoring de código duplicado
- [ ] Type hints completos em todos os módulos
- [ ] Docstrings em todos os comandos (Google style)
- [ ] Pre-commit hooks (black, isort, flake8)
- [ ] Code coverage reports

### Segurança

- [ ] Implementar rate limiting por utilizador (antiabuse)
- [ ] Sistema de permissões mais granular (role hierarchy)
- [ ] Audit log para ações críticas (admin actions)
- [ ] Encriptação de dados sensíveis (tokens, passwords)
- [ ] Validação de inputs mais rigorosa (sanitização)
- [ ] 2FA para comandos de admin críticos
- [ ] IP whitelisting para comandos owner
- [ ] Proteção contra SQL injection (prepared statements)

### Logging & Monitoring

- [ ] Integração com serviços de monitoring (Sentry/DataDog)
- [ ] Métricas de uso de comandos (analytics)
- [ ] Alertas para erros críticos (Discord webhook)
- [ ] Dashboard de estatísticas em tempo real
- [ ] Logs estruturados (JSON format)
- [ ] Rotation de logs automático
- [ ] Health check endpoint
- [ ] Performance profiling

---

## 📚 Documentação

- [x] README.md completo em português
- [x] README_EN.md em inglês
- [x] I18N_GUIDE.md para desenvolvimento bilíngue
- [ ] Guia de contribuição (CONTRIBUTING.md)
- [ ] Documentação de API interna
- [ ] Exemplos de uso de todos os comandos
- [ ] FAQ expandido (Troubleshooting comum)
- [ ] Vídeo tutorial de instalação (YouTube)
- [ ] Wiki com guias detalhados (GitHub Wiki)
- [ ] Changelog detalhado por versão
- [ ] Architecture decision records (ADR)

---

## 🌐 Internacionalização

- [x] Sistema de multi-idioma (config/i18n.py)
- [x] Português (PT-PT) - Branch main
- [x] Inglês (EN) - Branch en
- [ ] Espanhol (ES)
- [ ] Francês (FR)
- [ ] Alemão (DE)
- [ ] Italiano (IT)
- [ ] Russo (RU)
- [ ] Japonês (JA)
- [ ] Sistema de detecção automática de idioma por servidor
- [ ] Comandos traduzidos em todos os idiomas

---

## 🎨 Design & Branding

- [ ] Logo oficial do bot (vector SVG)
- [ ] Banner para README (GitHub header)
- [ ] Screenshots de comandos para documentação
- [ ] Ícones customizados para embeds
- [ ] Tema visual consistente (palette de cores)
- [ ] Emoji pack customizado
- [ ] Avatar profissional do bot
- [ ] Website oficial (landing page)

---

## 💡 Ideias em Consideração

- [ ] Sistema de economia global entre servidores
- [ ] API pública para integrações (REST + WebSocket)
- [ ] Bot premium com funcionalidades extras (Patreon)
- [ ] Sistema de plugins/extensões (marketplace)
- [ ] Suporte para Discord threads (thread-aware commands)
- [ ] Integração com serviços externos:
  - [ ] Twitch (notificações de live)
  - [ ] YouTube (uploads, streams)
  - [ ] Twitter (tweets automáticos)
  - [ ] GitHub (commits, releases)
- [ ] Voice commands (speech recognition)
- [ ] AI chatbot integration (GPT/Claude)
- [ ] Mini-games com canvas/imagens (captcha, memes)
- [ ] NFT/Blockchain integration (Web3)
- [ ] Mobile app companion (React Native)

---

## 🚀 Funcionalidades Avançadas

### IA & Machine Learning

- [ ] Auto-moderação com ML (spam detection)
- [ ] Sentiment analysis em mensagens
- [ ] Chatbot inteligente com contexto
- [ ] Recomendação de músicas baseada em histórico
- [ ] Detecção de toxicidade em tempo real

### Automação

- [ ] Workflows customizáveis (if/then rules)
- [ ] Agendamento de tarefas complexas (cron-like)
- [ ] Webhooks incoming/outgoing
- [ ] Integração com Zapier/IFTTT
- [ ] Bot actions triggered by events

### Analytics

- [ ] Dashboards de engagement por membro
- [ ] Heatmaps de atividade por hora/dia
- [ ] Growth metrics (novos membros, retenção)
- [ ] Command usage analytics
- [ ] Export de dados (CSV, JSON)

---

## 📊 Prioridades

### Versão 2.8 (Próximo)

1. ✅ Resolver bloqueio YouTube (cookies/OAuth)
2. Implementar sugestões da comunidade
3. Sistema de giveaways automatizado
4. Starboard funcional
5. Dashboard web básico

### Versão 2.9

1. Poker Texas Hold'em
2. Torneios automatizados
3. Spotify integration
4. Auto-moderação avançada
5. Testes unitários (>50% coverage)

### Versão 3.0 (Futuro)

1. Refactoring completo da arquitetura
2. PostgreSQL como opção de database
3. API pública documentada
4. Sistema de plugins
5. Mobile app companion
6. AI chatbot integration

---

## 🔄 Manutenção Contínua

- [ ] Atualizar dependências mensalmente
- [ ] Review de segurança trimestral
- [ ] Backups testados semanalmente
- [ ] Performance audit mensal
- [ ] User feedback review semanal
- [ ] Bug triage diário
- [ ] Code review para todos os PRs

---

**Última Atualização:** 2025-11-25  
**Responsável:** Droppers  
**Versão Atual:** 2.7.x

> 💡 **Nota:** Esta lista é dinâmica e pode ser alterada conforme as prioridades e feedback da comunidade.
>
> 📝 **Convenção de Commits:**
>
> - Branch `main` (PT): Commits em português
> - Branch `en` (EN): Commits em inglês
>
> 🎯 **Foco Atual:** Resolver YouTube blocking, implementar cookies/OAuth, expandir sistema de moderação

- [ ] Dashboard web para configuração
- [ ] Comandos com autocomplete
- [ ] Menus contextuais (apps)
- [ ] Tutoriais interativos para novos utilizadores
- [ ] Temas de cores customizáveis
- [ ] Preview de comandos antes de executar

---

## 🔧 Melhorias Técnicas

### Performance

- [ ] Implementar caching para queries frequentes
- [ ] Optimizar carregamento de cogs
- [ ] Reduzir uso de memória em operações de música
- [ ] Implementar rate limiting interno
- [ ] Lazy loading de recursos pesados

### Database

- [ ] Migração para PostgreSQL (opcional)
- [ ] Sistema de backups incrementais
- [ ] Compressão de logs antigos
- [ ] Índices optimizados para queries comuns
- [ ] Limpeza automática de dados antigos

### Código

- [ ] Adicionar testes unitários
- [ ] Implementar CI/CD
- [ ] Melhorar documentação inline
- [ ] Refactoring de código duplicado
- [ ] Type hints completos
- [ ] Docstrings em todos os comandos

### Segurança

- [ ] Implementar rate limiting por utilizador
- [ ] Sistema de permissões mais granular
- [ ] Audit log para ações críticas
- [ ] Encriptação de dados sensíveis
- [ ] Validação de inputs mais rigorosa

### Logging & Monitoring

- [ ] Integração com serviços de monitoring (Sentry, etc.)
- [ ] Métricas de uso de comandos
- [ ] Alertas para erros críticos
- [ ] Dashboard de estatísticas
- [ ] Logs estruturados (JSON)

---

## 📚 Documentação

- [ ] Guia de contribuição (CONTRIBUTING.md)
- [ ] Documentação de API interna
- [ ] Exemplos de uso de todos os comandos
- [ ] FAQ expandido
- [ ] Vídeo tutorial de instalação
- [ ] Wiki com guias detalhados

---

## 🌐 Internacionalização

- [ ] Sistema de multi-idioma
- [ ] Inglês (EN)
- [ ] Espanhol (ES)
- [ ] Francês (FR)
- [ ] Alemão (DE)

---

## 🎨 Design & Branding

- [ ] Logo oficial do bot
- [ ] Banner para README
- [ ] Screenshots de comandos
- [ ] Ícones customizados para embeds
- [ ] Tema visual consistente

---

## 💡 Ideias em Consideração

- [ ] Sistema de economia global entre servidores
- [ ] API pública para integrações
- [ ] Bot premium com funcionalidades extras
- [ ] Sistema de plugins/extensões
- [ ] Suporte para Discord threads
- [ ] Integração com serviços externos (Twitch, YouTube, etc.)

---

## 📊 Prioridades

### Versão 3.0 (Futuro)

1. Refactoring completo da arquitetura
2. PostgreSQL como opção de database
3. API pública
4. Sistema de plugins

---

**Última Atualização:** 2025-11-16  
**Responsável:** Droppers

> 💡 **Nota:** Esta lista é dinâmica e pode ser alterada conforme as prioridades e feedback da comunidade.
