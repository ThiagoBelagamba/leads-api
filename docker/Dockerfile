# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=20-alpine
# ARG SERVICE_TYPE=api

# 1) Deps (com dev)
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package*.json pnpm-lock.yaml* knexfile.cjs ./
RUN npm i -g pnpm && pnpm install

# 2) Build (usa dev deps)
FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm build  # executa "tsc && tsc-alias"

# 3) Prod deps (podado) - executar antes do build para evitar conflitos
FROM deps AS prod-deps
WORKDIR /app
# Desabilitar scripts de hooks que dependem de devDependencies
ENV HUSKY=0
RUN pnpm prune --prod --ignore-scripts

# 4) Runtime
FROM node:${NODE_VERSION} AS runtime
ARG SERVICE_TYPE=api
ENV NODE_ENV=production \
    SERVICE_TYPE=${SERVICE_TYPE} \
    NODE_OPTIONS="--dns-result-order=ipv4first" \
    # Configurações do Puppeteer para usar Chromium do sistema
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/bin/chromium-browser

# utilitários, init e dependências do Puppeteer/Chrome
RUN addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001 \
 && apk add --no-cache \
    dumb-init \
    curl \
    bind-tools \
    # Dependências necessárias para o Puppeteer/Chrome no Alpine
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    # Dependências adicionais para estabilidade do Chrome no Alpine
    libxrandr \
    alsa-lib \
    at-spi2-core \
    cups-libs \
    gtk+3.0 \
    libdrm \
    libxcomposite \
    libxdamage \
    libxfixes \
    mesa-gbm
WORKDIR /app

# Copia artefatos de build e deps podados
COPY --from=build     --chown=nodejs:nodejs /app/dist ./dist
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build     --chown=nodejs:nodejs /app/package*.json ./
COPY --from=build     --chown=nodejs:nodejs /app/knexfile.cjs ./

# Copia diretório de migrations necessário para produção
COPY --from=build     --chown=nodejs:nodejs /app/supabase ./supabase

# Copia script de inicialização (normaliza CRLF→LF para evitar "No such file or directory" no Alpine)
COPY --chown=nodejs:nodejs entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

# Criar diretório cache do Puppeteer para o usuário nodejs
RUN mkdir -p /home/nodejs/.cache/puppeteer \
 && chown -R nodejs:nodejs /home/nodejs/.cache

USER nodejs

# Configurar cache do Puppeteer para o usuário nodejs
ENV PUPPETEER_CACHE_DIR=/home/nodejs/.cache/puppeteer

# Healthcheck por tipo de serviço
# HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  # CMD sh -lc 'if [ "$SERVICE_TYPE" = "api" ]; then curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null; else pgrep -f "WorkerServer" >/dev/null; fi'

ENTRYPOINT ["dumb-init","--"]

# Comando condicional
# CMD sh -lc 'if [ "$SERVICE_TYPE" = "api" ]; then \
#                node dist/main/infrastructure/web/ApiServer.js; \
#              else \
#                node dist/main/infrastructure/worker/WorkerServer.js; \
#              fi'
# Script de inicialização que executa migrations e start da aplicação
CMD [ "./entrypoint.sh" ]
