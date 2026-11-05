# EPA BOTCHI

Bot **privado** de gestão e mini-jogos do servidor da EPA. Feito em **TypeScript** sobre o
[`@constatic/base`](https://constatic-docs.vercel.app) (discord.js 14), com toda a interface em
**Components V2 (containers)** e os emojis próprios da aplicação — a mesma base e o mesmo visual do
PixelTickets, sem licenças, sem painel web e sem nada de venda.

## O que faz

**Gestão do servidor**
- **Tickets** — painéis, categorias, formulários (texto, escolhas, ficheiros), painel da equipa,
  prioridades, respostas rápidas, pedidos de fecho, fecho por inatividade, avaliação, horário de
  atendimento, avisos de tickets parados, blacklist e voz privada por ticket.
- **Transcripts em ficheiro** — ao fechar, a conversa vira um `.html` anexado ao log do fecho.
- **Verificação à entrada** — captcha de figuras, cargo de verificado/não verificado, expulsão de
  quem não se verifica, regra de contas recentes.
- **Moderação** — `/mod` com casos numerados (avisar, castigo, expulsar, banir), castigos
  automáticos por avisos acumulados e registo próprio.
- **Limpeza de mensagens** — `/limpar` com as últimas N (até 1000), desde uma mensagem, um
  intervalo, por tempo ou de um membro (num canal ou em todos), com filtros (bots/pessoas, links,
  convites, imagens, ficheiros, texto, fixadas…). Pré-visualização antes de apagar, mensagens com
  mais de 14 dias uma a uma, e uma cópia HTML (com as imagens) no registo de moderação. No botão
  direito: **Limpar a partir daqui**, **Limpar intervalo** e **Limpar mensagens 24h** (num membro).
- **Revisão de bans (ban appeal)** — quem é banido recebe por DM um link para **adicionar o bot à
  conta** (User Install: o Discord não entrega ao bot os cliques nem os comandos de quem já não
  partilha nenhum servidor com ele) e depois usa o `/apelo` na DM com o bot. A equipa recebe o pedido
  com as respostas, o motivo do ban e o histórico, discute numa thread, vota 👍/👎, faz perguntas e
  aprova (desbane e dá um convite de uso único) ou recusa (com motivo e espera até ao próximo pedido).
  O membro vê tudo no `/apelo` — perguntas, decisão e convite. Requer **User Install** ligado no
  Developer Portal (Installation → Installation Contexts).
- **Proteção** — filtro de palavras (acentos, maiúsculas e "l33t" não escapam), links de conteúdo
  adulto, anti-raid (pausa os convites ou expulsa a vaga) e slowmode automático.
- **Anti-spam**, **logs do servidor**, **log de entradas/saídas** com convites, **boas-vindas e
  despedidas** com texto próprio, DM e cargos automáticos.
- **Anúncios agendados** (`/anuncio`) — a uma hora certa ou daqui a X minutos, com repetição.
- **Modmail**, **sugestões**, **sorteios**, **starboard**, **auto-cargos**, **cargos temporários**,
  **salas de voz temporárias**, **canais de estatísticas**, **alertas sociais** e **publicação automática**.

**Comunidade**
- **Níveis e XP** por mensagens e por tempo em voz, cargos de recompensa e multiplicadores.
- **Economia (EPA Coins)** — diário com sequência, trabalho, transferências, trocas, loja de cargos,
  cargo pessoal (nome e cor), eventos (happy hour, super sorte, chuva de ouro, diário especial) e extrato.
- **Social** — perfil com bio/cor/aniversário, conquistas, amigos, casamentos com anéis e
  "mesversários", reputação, atividade diária em gráfico, sequências e rankings.
- **Utilidades** — lembretes, notas pessoais, AFK, timestamps, emojis em grande, sondagens.
- **Música** — YouTube, SoundCloud e links do Spotify; fila, pausa, repetir, baralhar, votar para
  pular, letras e playlists pessoais.

## Requisitos

- Node.js **24+** (o Docker usa o Node 26 LTS).
- PostgreSQL (Neon, Supabase ou o do `docker-compose.yml`).
- No [Discord Developer Portal](https://discord.com/developers/applications) → **Bot**, ligar os
  *Privileged Gateway Intents*: **Server Members Intent** e **Message Content Intent**.
- Convidar o bot com `bot` + `applications.commands`. Sendo privado, o mais simples é dar-lhe
  **Administrador**: `https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot+applications.commands&permissions=8`.
  O cargo do bot deve ficar **acima** dos cargos que ele vai dar (loja, níveis, verificação).

## Configuração

1. `cp .env.example .env` e preencher (`BOT_TOKEN`, `DATABASE_URL`, `GUILD_ID`, `OWNER_IDS`…).
2. `npm install`
3. `npm run dev` (desenvolvimento) ou `npm run build && npm start`.
4. No Discord, `/config` → configurar cada sistema (tudo começa do zero; a economia e os jogos vêm
   ligados com valores por omissão, o resto liga-se lá).

Os comandos são registados **só** nos servidores do `.env` (`GUILD_ID` + `EXTRA_GUILD_IDS`), na
hora. Noutros servidores o bot fica inativo.

### Vindo do bot antigo (Python, v2.x)

No primeiro arranque contra a mesma base de dados, as tabelas antigas são **movidas** (não
apagadas) para o esquema `epa_legacy`, e o progresso dos membros é importado: **XP e mensagens,
tempo em voz, EPA Coins, reputação e estatísticas dos jogos**. As configurações antigas não passam —
configura-se tudo de novo em `/config`. **Desliga o bot antigo antes** de ligar este.

O nível é recalculado com a curva nova (5N² + 50N + 100 XP por nível), por isso pode não bater
certo com o nível que aparecia no bot antigo — o XP total é o mesmo.

## Deploy

**Railway** (o deploy atual): cada push para o `main` no GitHub faz a Railway reconstruir e
reiniciar o bot. O [railway.json](railway.json) manda usar o [Dockerfile](Dockerfile) (compila o
TypeScript lá dentro) e arrancar com `node build/index.js`. As variáveis vêm do painel da Railway;
os nomes do bot antigo (`DISCORD_TOKEN`, `SQL_DATABASE_URL`, `SERVER_ID`, `SERVER_TESTES`) continuam a
ser aceites, por isso não é preciso mudar nada lá.

**Música**: a imagem Docker instala o `ffmpeg` e o `yt-dlp` (sempre o mais recente a cada build).
Fora do Docker, aponta `YTDLP_PATH` e `FFMPEG_PATH` para eles. Se o YouTube recusar o servidor
("Sign in to confirm you're not a bot"), a pesquisa passa para o SoundCloud; para o YouTube voltar a
funcionar, põe cookies de uma conta em `YTDLP_COOKIES_B64` (ficheiro cookies.txt em base64).

**Docker** local (bot + PostgreSQL): `npm run docker:up` · logs: `npm run docker:logs`.

**Discloud** (alternativa): `npm run build` e depois "Commit app". Sobem o `build/`, o `assets/`, o
`.env`, `package.json`, `package-lock.json` e `constants.json` — ver [.discloudignore](.discloudignore).

Os ícones de `assets/emojis/` são enviados como **emojis da aplicação** no primeiro arranque
(todos, ~240) e reutilizados depois.

## Scripts

| Script | O quê |
| --- | --- |
| `npm run dev` / `npm run watch` | correr com tsx (com/sem recarregar) |
| `npm run build` | compilar para `build/` (tsup) |
| `npm start` | correr o build |
| `npm run check` | verificação de tipos |
| `npm run lint` | oxlint |
| `npm test` | testes (vitest) |

## Estrutura

```text
src/
├── discord/          # comandos, responders e eventos (convenções do constatic)
├── modules/          # lógica por sistema: tickets, games, economy, moderation, levels, …
├── repositories/     # acesso à base de dados
├── database/         # pool, TLS e esquema (migrations.ts)
├── lib/              # containers CV2, emojis, i18n (t()), logs, …
└── services/         # emojis da aplicação, auditoria
assets/emojis/        # ícones enviados como emojis da aplicação
tests/                # vitest
```

## Licença

MIT — ver [LICENSE](LICENSE).
