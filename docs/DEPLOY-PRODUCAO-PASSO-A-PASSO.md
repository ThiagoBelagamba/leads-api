# Deploy para produção – Passo a passo

Este guia descreve como subir **sua versão** da API (código local) para produção usando a stack atual (Docker + Portainer/Traefik), com imagem no GitHub Container Registry (ghcr.io).

---

## Pré-requisitos

- [ ] Código commitado e testado localmente
- [ ] Acesso ao GitHub com permissão para publicar no GHCR (ou ao registry que você usa)
- [ ] Acesso ao Portainer/servidor onde a stack está rodando
- [ ] Variáveis de produção já definidas (Supabase, Asaas, etc.) – a stack que você enviou já tem a maioria

---

## 1. Definir a versão da imagem

A stack em produção usa uma imagem no GHCR. Com o repositório em **ThiagoBelagamba/disparorapido-api**, a imagem passa a ser `ghcr.io/thiagobelagamba/disparorapido-api:TAG`. Para subir uma nova versão:

**Opção A – Nova tag (recomendado)**  
Escolha uma tag nova, ex.: `1.6.0` ou `1.5.1`. Assim você pode voltar à anterior se precisar.

**Opção B – Mesma tag**  
Se quiser continuar com `1.5.0`, após o push você fará “pull” da imagem no Portainer e recriará o serviço (a imagem antiga será substituída).

No `package.json` a versão está como `1.1.0`; isso é independente da tag da imagem. Pode atualizar o `package.json` com `pnpm run release:patch` (ou manualmente) se quiser que a API responda com essa versão em `/api/v1/version`.

---

## 2. Build da imagem Docker (local)

Na raiz do projeto (onde está `package.json`, `docker/`, `entrypoint.sh`):

```bash
cd C:\workspace\workspace2\disparorapido_api

# Build (contexto = raiz do projeto; Dockerfile em docker/Dockerfile)
docker build -f docker/Dockerfile -t ghcr.io/thiagobelagamba/disparorapido-api:1.6.0 .
```

Troque `1.6.0` pela tag que escolheu. O build vai rodar `pnpm build`, copiar `dist/`, `node_modules` (prod), `supabase/` e `entrypoint.sh`.

Se der erro de contexto (arquivo não encontrado), confira se `entrypoint.sh` está na raiz e se `.dockerignore` não está excluindo algo necessário.

---

## 3. Testar a imagem localmente (opcional)

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e SUPABASE_URL=https://nzgmbwtpvhtxxcgwvunn.supabase.co \
  -e SUPABASE_SERVICE_KEY=<sua-service-key> \
  ghcr.io/thiagobelagamba/disparorapido-api:1.6.0
```

Depois: `curl http://localhost:3000/api/v1/version` ou `curl http://localhost:3000/api/health`. Ctrl+C para parar.

---

## 4. Login no GitHub Container Registry

```bash
# Login no GHCR (use um PAT com permissão write:packages)
echo SEU_GITHUB_PAT | docker login ghcr.io -u ThiagoBelagamba --password-stdin
```

Substitua `SEU_GITHUB_PAT` por um Personal Access Token do GitHub com permissão **write:packages** (conta do dono do repositório, ex.: ThiagoBelagamba).

---

## 5. Push da imagem

```bash
docker push ghcr.io/thiagobelagamba/disparorapido-api:1.6.0
```

Se a imagem for privada, no Portainer/servidor também será preciso fazer `docker login ghcr.io` (ou configurar o registry no Portainer) para conseguir fazer pull.

---

## 6. Atualizar a stack no Portainer

1. Acesse o Portainer e abra a stack que contém `leads_prod_api`.
2. No serviço **leads_prod_api**, altere a **imagem** de  
   `ghcr.io/johnnyvaz/leadsrapido_backend:1.5.0`  
   para  
   `ghcr.io/thiagobelagamba/disparorapido-api:1.6.0`  
   (ou a tag que você usou no build/push).
3. **Variáveis de ambiente**  
   Mantenha as que já estão na stack que você enviou (SUPABASE_*, ASAAS_*, FRONTEND_URL, API_BASE_URL, etc.). Não é necessário mudar nada aqui só por causa da nova imagem, a menos que você queira ajustar configs.
4. Salve a stack e faça **Redeploy** do serviço `leads_prod_api` (ou “Update the stack”). O Portainer vai fazer pull da nova imagem e recriar o container.

Se você usa **arquivo YAML** (docker-compose / stack):

- Altere a linha `image` do serviço `leads_prod_api` para a nova tag.
- Faça o deploy da stack de novo (Portainer “Stack” → “Editor” → colar YAML → Deploy, ou via `docker stack deploy` no servidor).

Exemplo no YAML:

```yaml
services:
  leads_prod_api:
    image: ghcr.io/thiagobelagamba/disparorapido-api:1.6.0
    # ... resto igual
```

---

## 7. Verificar o deploy

1. **Logs no Portainer**  
   Abra o container do serviço `leads_prod_api` e veja os logs. Deve aparecer algo como “API listening on port 3000” e, se `SKIP_MIGRATIONS=false`, a execução das migrations.

2. **Health/Version**  
   - `https://api.disparorapido.com.br/api/health`  
   - `https://api.disparorapido.com.br/api/v1/version`  
   Devem responder 200 e o body com a versão/status.

3. **Login**  
   Teste o login da extensão/site contra a API de produção para garantir que Supabase e JWT estão ok.

---

## 8. Checklist rápido (produção)

| Item | Onde | Status |
|------|------|--------|
| **Supabase** | Stack env | ✅ URL/keys já na stack (nzgmbwtpvhtxxcgwvunn) |
| **Asaas** | Stack env | ✅ API key, base URL, environment, webhook secret |
| **FRONTEND_URL** | Stack env | ✅ https://disparorapido.com.br |
| **API_BASE_URL** | Stack env | ✅ https://api.disparorapido.com.br |
| **Webhook Asaas** | Painel Asaas | URL: `https://api.disparorapido.com.br/api/v1/webhooks/asaas/subscription` e token = `ASAAS_WEBHOOK_SECRET` |
| **CORS** | API | Em produção a API usa `FRONTEND_URL`; com o valor acima o site já está permitido |
| **Migrations** | Container | Com `SKIP_MIGRATIONS=false`, o entrypoint roda migrations ao subir; banco já migrado (17 clientes Eduzz) |

---

## 9. Resumo dos comandos (copiar/colar)

```bash
# 1. Ir para o projeto
cd C:\workspace\workspace2\disparorapido_api

# 2. Build (troque 1.6.0 pela tag desejada)
docker build -f docker/Dockerfile -t ghcr.io/thiagobelagamba/disparorapido-api:1.6.0 .

# 3. Login no GHCR (uma vez; use PAT com write:packages)
echo SEU_GITHUB_PAT | docker login ghcr.io -u ThiagoBelagamba --password-stdin

# 4. Push
docker push ghcr.io/thiagobelagamba/disparorapido-api:1.6.0
```

Depois: no Portainer, alterar a imagem do serviço para `ghcr.io/thiagobelagamba/disparorapido-api:1.6.0` e redeploy.

---

## 10. Rollback (se der problema)

No Portainer, altere de volta a imagem do serviço para a tag anterior (ex.: `ghcr.io/johnnyvaz/leadsrapido_backend:1.5.0` ou a que estava antes), salve e redeploy. O serviço voltará a usar a imagem antiga.
