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
    NODE_OPTIONS="--dns-result-order=ipv4first"

# utilitários mínimos de runtime para API
RUN addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001 \
 && apk add --no-cache \
    dumb-init \
    curl \
    bind-tools \
    ca-certificates
WORKDIR /app

# Copia artefatos de build e deps podados
COPY --from=build     --chown=nodejs:nodejs /app/dist ./dist
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build     --chown=nodejs:nodejs /app/package*.json ./
COPY --from=build     --chown=nodejs:nodejs /app/knexfile.cjs ./

# Copia script de inicialização (normaliza CRLF→LF para evitar "No such file or directory" no Alpine)
COPY --chown=nodejs:nodejs entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

USER nodejs

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
