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
- **Transcripts em ficheiro** — ao fechar, a conversa vira um `.html` anexado ao log do fecho
  (abre em qualquer browser, sem site).
- **Verificação à entrada** — captcha de figuras (tocar nas formas pela ordem da imagem), cargo de
  verificado/não verificado, expulsão de quem não se verifica, regra de contas recentes.
- **Moderação** — `/mod` com casos numerados (avisar, castigo, expulsar, banir, limpar), castigos
  automáticos por avisos acumulados e registo próprio.
- **Anti-spam**, **logs do servidor** por categoria, **entradas e saídas**, **rastreio de convites**.
- **Modmail**, **sugestões** com votos e threads, **sorteios**, **auto-cargos**, **cargos
  temporários** e cargos que voltam ao regressar, **salas de voz temporárias**, **canais de
  estatísticas**, **alertas sociais** (YouTube, TikTok, Twitch, Kick) e **publicação automática**.

**Comunidade**
- **Níveis e XP** por mensagens **e por tempo em voz**, cargos de recompensa e multiplicadores.
- **Economia (EPA Coins)** — diário com sequência e marcos, trabalho, transferências, loja de
  cargos (permanentes ou por dias), extrato.
- **Perfil**, **reputação**, **rankings** (XP, moedas, jogos, reputação, voz, mensagens).

**Mini-jogos** (`/jogos`)
| Jogo | Comando | Notas |
| --- | --- | --- |
| Jogo do Galo | `/galo` | contra um amigo (desafio) ou o bot (fácil/normal/impossível), apostas, desforra |
| 4 em Linha | `/4emlinha` | contra um amigo ou o bot (IA com 3 dificuldades), apostas, desforra |
| Pedra, Papel, Tesoura | `/ppt` | à melhor de 1/3/5, escolhas escondidas |
| Forca | `/forca` | sozinho ou aberta ao canal, 10 categorias |
| Quiz | `/quiz` | para o canal inteiro, ~100 perguntas em 7 categorias, pontos por rapidez |
| Termo | `/termo` | palavra do dia (em privado, resultado partilhado sem spoilers) ou livre |
| Blackjack | `/blackjack` | pedir, ficar, dobrar; blackjack paga 3:2 |
| Minas | `/minas` | 20 casas, levanta quando quiseres |
| Apostas rápidas | `/apostar` | moeda, dados, slots, roleta |
| Ship | `/ship` | compatibilidade (a administração pode "forçar" 😈) |

As apostas ficam em caução enquanto o jogo decorre: um jogo abandonado devolve-as.

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
