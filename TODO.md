# 📝 TODO - EPA BOT

Lista de tarefas, melhorias e correções planeadas para versões futuras.

---

## 🐛 Bugs Conhecidos

### Alta Prioridade

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

- [ ] Loja de roles customizadas com cores
- [ ] Sistema de trading entre utilizadores
- [ ] Eventos especiais com bónus de moedas
- [ ] Cooldowns visuais nos comandos
- [ ] Sistema de achievements/conquistas
- [ ] Leilões de itens raros

### Sistema Social

- [ ] Sistema de badges personalizados
- [ ] Perfis customizáveis
- [ ] Sistema de casamento entre utilizadores
- [ ] Histórico de atividade
- [ ] Top utilizadores por categoria
- [ ] Sistema de recompensas por streak

### Jogos

- [ ] Adicionar poker Texas Hold'em
- [ ] Sistema de torneios
- [ ] Estatísticas detalhadas por jogo
- [ ] Leaderboards semanais/mensais
- [ ] Mini-jogos de reação rápida
- [ ] Sistema de apostas em eventos

### Música

- [ ] Suporte para Spotify
- [ ] Playlists guardadas
- [ ] Sistema de votação para skip
- [ ] Equalizer com presets
- [ ] Loop de fila completa
- [ ] Histórico de músicas tocadas

### Moderação

- [ ] Sistema de auto-moderação (anti-spam, anti-raid)
- [ ] Logs detalhados de ações de moderação
- [ ] Sistema de appeals para bans
- [ ] Tempo de timeout customizável
- [ ] Filtro de palavras proibidas
- [ ] Sistema de quarentena para novos membros

### Tickets

- [ ] Templates de respostas rápidas
- [ ] Sistema de prioridades
- [ ] Atribuição automática de staff
- [ ] Estatísticas de tickets (tempo médio, etc.) - Adicionar estatísticas em tempo real ao painel setup_tickets
- [ ] Sistema de feedback após fechamento
- [ ] Integração com sistema de logs
- [ ] Optimizar queries da base de dados no comando /setup_tickets para evitar timeouts

### Utilidades

- [x] Sistema de lembretes recorrentes
- [x] Polls/votações avançadas
- [x] Sistema de anúncios agendados
- [x] Welcome messages customizáveis
- [x] Auto-roles por reação
- [x] Sistema de verificação (captcha)

### Interface & UX

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

### Versão 2.2 (Próximo Release)

1. Corrigir bugs conhecidos de alta prioridade
2. Sistema de auto-moderação básico
3. Melhorias no sistema de economia (loja de roles)
4. Adicionar testes unitários básicos

### Versão 2.3

1. Dashboard web
2. Sistema de achievements
3. Melhorias de performance
4. Multi-idioma (EN + PT)

### Versão 3.0 (Futuro)

1. Refactoring completo da arquitetura
2. PostgreSQL como opção de database
3. API pública
4. Sistema de plugins

---

**Última Atualização:** 2025-11-16  
**Responsável:** Droppers

> 💡 **Nota:** Esta lista é dinâmica e pode ser alterada conforme as prioridades e feedback da comunidade.
