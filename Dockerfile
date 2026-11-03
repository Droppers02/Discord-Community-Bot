# ─── Build ────────────────────────────────────────────────────────────────────
FROM node:26-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsup.config.ts constants.json ./
COPY src ./src
RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:26-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Música: ffmpeg (converte para Opus) e yt-dlp (YouTube, SoundCloud, …), sempre na versão
# mais recente a cada build — o YouTube muda muitas vezes e o yt-dlp acompanha.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build
COPY constants.json ./
COPY assets ./assets

USER node
CMD ["node", "build/index.js"]
