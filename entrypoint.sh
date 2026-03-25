#!/bin/sh

# Script de inicialização para containers de produção
# Executa migrations antes de iniciar a aplicação

set -e

# Força resolução DNS IPv4 para evitar problemas de conectividade
export NODE_OPTIONS="--dns-result-order=ipv4first"

# echo "🚀 Iniciando container..."
# ## inserir comandos de debug:
# echo "🖧 Hostname: $(hostname)"
# echo "🖧 Data/Hora: $(date)"
# echo "🖧 IPs locais:"
# ip addr || ifconfig || echo "ifconfig não disponível"
# echo "🖧 Rotas:"
# ip route || route -n || echo "route não disponível"
# echo "🖧 DNS resolv.conf:"
# cat /etc/resolv.conf
# echo "🖧 Teste de DNS para host do banco:"
# DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\\([^:]*\\):.*/\\1/p')
# getent hosts $DB_HOST || nslookup $DB_HOST || host $DB_HOST || echo "DNS tools não disponíveis"
# echo "🖧 Teste de conexão TCP (porta 5432):"
# # nc -vz $DB_HOST 5432 || echo "nc não disponível ou conexão falhou"
# echo "🖧 Variáveis de ambiente relevantes:"
# env | grep -E 'DATABASE|NODE_ENV|HOST|PORT|PG|SUPABASE'

# npm run migrate:prod

# Verificar se estamos em produção e DATABASE_URL está definida
if [ "$NODE_ENV" = "production" ] && [ -n "$DATABASE_URL" ] && [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "📊 Executando migrations de produção..."
    
    # Tentar resolver o hostname para IPv4 primeiro
    echo "🔍 Testando conectividade..."
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    echo "🔍 Database host detectado: $DB_HOST"
    
    # Tentar obter IP IPv4 do hostname usando múltiplos métodos
    IPV4=""
    
    # Método 1: getent hosts (mais confiável)
    if command -v getent >/dev/null 2>&1; then
        echo "🔍 Resolvendo DNS com getent para $DB_HOST..."
        IPV4=$(getent hosts "$DB_HOST" | grep -E "([0-9]{1,3}\.){3}[0-9]{1,3}" | head -1 | awk '{print $1}')
    fi
    
    # Método 2: nslookup (fallback)
    if [ -z "$IPV4" ] && command -v nslookup >/dev/null 2>&1; then
        echo "🔍 Resolvendo DNS com nslookup para $DB_HOST..."
        IPV4=$(nslookup "$DB_HOST" | grep -A 10 "Non-authoritative answer:" | grep "Address:" | grep -E "([0-9]{1,3}\.){3}[0-9]{1,3}" | head -1 | awk '{print $2}')
    fi
    
    # Método 3: host command (outro fallback)
    if [ -z "$IPV4" ] && command -v host >/dev/null 2>&1; then
        echo "🔍 Resolvendo DNS com host para $DB_HOST..."
        IPV4=$(host "$DB_HOST" | grep "has address" | head -1 | awk '{print $4}')
    fi
    
    if [ -n "$IPV4" ]; then
        echo "✅ IPv4 encontrado: $IPV4"
        # Substituir hostname por IP na DATABASE_URL temporariamente
        export DATABASE_URL_ORIGINAL="$DATABASE_URL"
        export DATABASE_URL=$(echo "$DATABASE_URL" | sed "s/$DB_HOST/$IPV4/g")
        echo "🔄 DATABASE_URL modificada: $(echo "$DATABASE_URL" | sed 's/:.*@/:***@/g')"
    else
        echo "⚠️ Não foi possível resolver IPv4, usando configuração hardcoded no knexfile"
    fi
    
    npm run migrate:latest
    MIGRATION_EXIT_CODE=$?
    
    # Restaurar DATABASE_URL original se foi modificada
    if [ -n "$DATABASE_URL_ORIGINAL" ]; then
        export DATABASE_URL="$DATABASE_URL_ORIGINAL"
        echo "🔄 DATABASE_URL restaurada para aplicação"
    fi
    
    if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
        echo "✅ Migrations executadas com sucesso"
    else
        echo "❌ Erro ao executar migrations"
        exit 1
    fi
else
    if [ "$SKIP_MIGRATIONS" = "true" ]; then
        echo "⏭️ Pulando migrations (SKIP_MIGRATIONS=true)"
    else
        echo "⏭️ Pulando migrations (ambiente: $NODE_ENV)"
    fi
fi

# Iniciar a aplicação baseada no SERVICE_TYPE
if [ "$SERVICE_TYPE" = "worker" ]; then
    echo "🔧 Iniciando Worker..."
    exec node dist/main/infrastructure/worker/WorkerServer.js
else
    echo "🌐 Iniciando API Server..."
    exec node dist/main/infrastructure/web/ApiServer.js
fi