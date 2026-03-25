# Subir a API para produção – guia rápido

Siga na ordem. O deploy usa **Docker** e **Portainer** (imagem no GitHub Container Registry).

---

## 1. Escolher a tag da imagem

Exemplo: `1.6.2` (incremente em relação à última, ex.: `1.6.1` no `stack-producao.yml`).

---

## 2. Build da imagem (na sua máquina)

No PowerShell ou CMD, na raiz do projeto:

```bash
cd c:\workspace\workspace2\disparorapido_api

docker build -f docker/Dockerfile -t ghcr.io/thiagobelagamba/disparorapido-api:1.6.2 .
```

Troque `1.6.2` pela tag que escolheu.  
Se o repositório for outro, troque `thiagobelagamba/disparorapido-api` pelo seu `usuario/repo`.

---

## 3. Login no GitHub Container Registry

Só é necessário se ainda não estiver logado:

```bash
echo SEU_GITHUB_PAT | docker login ghcr.io -u SEU_USUARIO_GITHUB --password-stdin
```

Substitua `SEU_GITHUB_PAT` por um Personal Access Token com permissão **write:packages** e `SEU_USUARIO_GITHUB` pelo seu usuário.

---

## 4. Push da imagem

```bash
docker push ghcr.io/thiagobelagamba/disparorapido-api:1.6.2
```

(Use a mesma tag do passo 2.)

---

## 5. Atualizar no Portainer

1. Acesse o Portainer e abra a **stack** onde está o serviço da API (ex.: `leads_prod_api`).
2. Altere a **imagem** do serviço para a nova tag, por exemplo:
   - De: `ghcr.io/thiagobelagamba/disparorapido-api:1.6.1`
   - Para: `ghcr.io/thiagobelagamba/disparorapido-api:1.6.2`
3. **Salve** a stack e faça **Redeploy** do serviço (ou “Update the stack”).

Se a stack for editada por **arquivo YAML** (como `docs/stack-producao.yml`), mude só a linha `image` do serviço `leads_prod_api` para a nova tag e faça o deploy da stack de novo.

---

## 6. Conferir

- **Logs:** no Portainer, abra o container do serviço e confira os logs (ex.: “API listening on port 3000”).
- **Health:**  
  `https://api.disparorapido.com.br/api/health`  
  `https://api.disparorapido.com.br/api/v1/version`
- **Login:** testar login da extensão/site contra a API de produção.

---

## Variáveis importantes em produção

Na stack (Portainer) devem estar definidas, entre outras:

| Variável | Uso |
|----------|-----|
| `NODE_ENV=production` | Ativa modo produção |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Banco Supabase de produção |
| `SUPABASE_JWT_SECRET` | **Obrigatório** para login da extensão (JWT) |
| `DATABASE_URL` | Conexão Postgres (migrations/ Knex) |
| `ASAAS_*` | Asaas produção e webhook |
| `FRONTEND_URL` | CORS (ex.: https://disparorapido.com.br) |
| `SITE_URL` | Links em e-mails (ex.: https://disparorapido.com.br) |

O `docs/stack-producao.yml` já traz um exemplo de configuração.

---

## Rollback

No Portainer, volte a **imagem** do serviço para a tag anterior (ex.: `1.6.1`), salve e faça **Redeploy**.

---

Documentação completa: `docs/DEPLOY-PRODUCAO-PASSO-A-PASSO.md`.
