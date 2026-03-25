# Análise e checklist: Checkout Transparente → Produção

**Contexto:** Deploy no Portainer com sistema de imagens. Fluxo desejado: cliente contrata em CheckoutTransparente → cria user no Supabase → após confirmação de pagamento vincula subscription na tabela `subscriptions` e ativa a empresa.

---

## 0. Pronto para produção? (resumo)

| Área | Status | Observação |
|------|--------|------------|
| **Fluxo de código** | ✅ Pronto | Validação CPF/CNPJ, user só após Asaas, rollback empresa, nextDueDate=hoje, webhook ativa user existente |
| **Segurança webhook** | ✅ Pronto | Em `NODE_ENV=production` o bypass está desativado; exige `ASAAS_WEBHOOK_SECRET` |
| **CORS** | ⚠️ Configurar | Em produção a API usa `FRONTEND_URL` (e origens fixas); definir URL do site |
| **Env API** | ⚠️ Configurar | Supabase, Asaas, `ASAAS_WEBHOOK_SECRET`, `FRONTEND_URL`/`DISPARO_RAPIDO_SITE_URL` |
| **Env Site** | ⚠️ Configurar | `VITE_API_URL` no build com URL da API em produção |
| **Webhook Asaas** | ⚠️ Configurar | No painel Asaas: URL `https://<sua-api>/api/v1/webhooks/asaas/subscription` + token |
| **Produtos Supabase** | ⚠️ Verificar | IDs fixos no webhook: mensal `6073e213-...`, anual `2d06dac6-...` devem existir em `produtos` |
| **Deploy (Portainer)** | ⚠️ Fazer | Build da imagem da API e do site; stack com env e rede |

**Conclusão:** O código está pronto para produção. Falta **configurar ambiente** (env, webhook Asaas, CORS, produtos no banco) e **fazer o deploy** (imagens + Portainer). Use o checklist da seção 4 abaixo.

---

## 1. Fluxo desejado (alvo)

| Etapa | Ação |
|-------|------|
| 1 | Cliente acessa **CheckoutTransparente** (site) |
| 2 | Preenche dados + cartão e envia |
| 3 | **API:** Cria usuário no Supabase (users_disparo_rapido) |
| 4 | **API:** Cria empresa (status pendente) e cliente no Asaas |
| 5 | **API:** Cobra no cartão **na hora** (primeira cobrança imediata) |
| 6 | **Após confirmação de pagamento:** Vincula subscription na tabela `subscriptions` e **ativa a empresa** |

---

## 2. O que já está feito (código)

- **Cobrança imediata:** `nextDueDate` = hoje no Asaas (primeira cobrança no mesmo dia).
- **Subscription na nossa base:** Criada **apenas no webhook** `PAYMENT_CONFIRMED` (handleCheckoutPaymentConfirmed); não é criada no checkout (evita coluna `asaas_customer_id` inexistente).
- **User só após Asaas:** User e email de confirmação são criados **somente** depois de sucesso em `createCustomer` + `createSubscription` no Asaas; em falha, a empresa é removida (rollback) e nenhum user é criado.
- **Validação CPF/CNPJ:** Validação (formato + dígitos verificadores) antes de criar empresa/user; CPF/CNPJ enviado ao Asaas sempre só dígitos (incluindo no `creditCardHolderInfo`).
- **Webhook – user existente:** No PAYMENT_CONFIRMED do checkout, se já existir user para a empresa, ele é **ativado** (status + email_confirmed_at); user novo só é criado quando não existir.

---

## 3. O que mudar (referência – já implementado ou não aplicável)

### 3.1 Cobrança instantânea (API)

**Arquivo:** `disparorapido_api/src/main/usecase/checkout/RegisterWithCheckoutUseCase.ts`

- Trocar a data da primeira cobrança de “amanhã” para **hoje**:
  - Hoje: `nextDueDate = formatDate(new Date(Date.now() + 24 * 60 * 60 * 1000))` (+1 dia)
  - Alvo: `nextDueDate = formatDate(new Date())` (hoje)
- Assim o Asaas gera o primeiro payment para hoje e tende a cobrar o cartão na hora (ou no mesmo dia).

### 3.2 Criar subscription na nossa base no checkout (API)

**Arquivo:** `RegisterWithCheckoutUseCase.ts`

- Após criar a subscription no Asaas com sucesso:
  - Buscar o **produto** (extensao_chrome – mensal ou anual, conforme `plano`).
  - Inserir um registro na tabela **subscriptions** com:
    - `empresa_id` = empresa criada
    - `produto_id` = id do produto (mensal/anual)
    - `asaas_subscription_id` = id retornado pelo Asaas
    - `status` = `pending_payment_method` (ou `active` só após confirmação, conforme regra desejada)
    - Demais campos (billing_cycle, value, next_due_date, etc.) alinhados ao plano
- Dependências: usar `IProdutoRepository` (ou query por categoria) e `ISubscriptionRepository` (ou inserção via Supabase), já que hoje o use case não os utiliza.

### 3.3 Webhook PAYMENT_CONFIRMED: atualizar em vez de só inserir (API)

**Arquivo:** `disparorapido_api/src/main/controller/WebhookController.ts` → **handleCheckoutPaymentConfirmed**

- Se a subscription já for criada no checkout (item 3.2):
  - No webhook **não** fazer `insert` novo em `subscriptions`.
  - Fazer **update** na subscription existente (por `asaas_subscription_id`):
    - `status` = `active`
    - `payments_count`, `first_payment_date`, `last_payment_date`, etc.
- Manter a lógica de **ativar a empresa** (status/plano) após confirmação.

### 3.4 Usuário no webhook: ativar em vez de criar (API)

**Arquivo:** `WebhookController.ts` → **createUserDisparoRapidoFromPayment** (ou fluxo chamado no PAYMENT_CONFIRMED do checkout)

- Para pagamentos do tipo **checkout** (extensao_mensal / extensao_anual):
  - Se já existir usuário para a empresa (criado no checkout): **apenas atualizar** (ex.: `status` = `active`, e `email_confirmed_at` se for o caso).
  - Só criar usuário se **não** existir (evitar duplicidade e conflito com o fluxo do checkout transparente).

---

## 4. Checklist de produção (Portainer + imagens)

### 4.1 Ambiente e rede

- [ ] **VITE_API_URL** (site): apontar para a URL pública da API (ex.: `https://api.seudominio.com` ou a URL do serviço no Portainer).
- [ ] **CORS:** API com `FRONTEND_URL` / origem do site configurada para o domínio de produção.
- [ ] Portainer: stack/serviço da API com porta exposta (ex.: 3000) e rede correta para o site acessar.

### 4.2 Variáveis de ambiente – API (container)

- [ ] `NODE_ENV=production`
- [ ] `PORT` (ex.: 3000)
- [ ] `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` (produção)
- [ ] `ASAAS_API_URL` e `ASAAS_API_KEY` (produção)
- [ ] `ASAAS_ENVIRONMENT=production`
- [ ] `ASAAS_WEBHOOK_SECRET` (mesmo configurado no painel Asaas para o webhook)
- [ ] `DISPARO_RAPIDO_SITE_URL` ou `FRONTEND_URL` (URL do site para links de email e redirects)
- [ ] `JWT_SECRET` (produção)
- [ ] Opcional: `DATABASE_URL` se usar migrations no container (entrypoint já usa em produção)
- [ ] Opcional: Split Asaas – `ASAAS_SPLIT_*` se for usar

### 4.3 Variáveis de ambiente – Site (build/container)

- [ ] **VITE_API_URL** definida no build da imagem do site (ou em runtime se suportado) com a URL da API em produção.

### 4.4 Webhook Asaas

- [ ] No painel Asaas (produção): URL do webhook apontando para a API pública, ex.: `https://api.seudominio.com/api/v1/webhooks/asaas/subscription` (ou a rota exata do projeto).
- [ ] Método POST; header/secret conforme usado em `AsaasWebhookVerifier` (ex.: `asaas-access-token` = `ASAAS_WEBHOOK_SECRET`).
- [ ] Em produção **não** usar bypass de verificação (`NODE_ENV=production` já desativa o bypass no código atual).

### 4.5 Banco e tabelas (Supabase)

- [ ] Tabelas existentes e migrações aplicadas: `empresas`, `users_disparo_rapido`, `subscriptions`, `produtos`, `webhooks_asaas`, etc.
- [ ] Produtos “extensao” (mensal/anual) cadastrados e IDs corretos no código (ou busca por categoria).
- [ ] RLS/policies do Supabase permitindo acesso com `SUPABASE_SERVICE_KEY` para os fluxos da API (criação de user, empresa, subscription, etc.).

### 4.6 Imagem e deploy (Portainer)

- [ ] Build da imagem da API a partir do `Dockerfile` (ex.: `docker/Dockerfile`) com `pnpm build` e artefatos corretos.
- [ ] Build da imagem do site com `VITE_API_URL` de produção.
- [ ] Portainer: deploy da API usando a imagem; variáveis de ambiente configuradas no serviço/stack.
- [ ] Portainer: deploy do site (se for container); ou publicação do build estático no mesmo host/CDN.
- [ ] Healthcheck da API (ex.: `/api/health` ou equivalente) configurado no Portainer, se disponível.

### 4.7 Pós-deploy

- [ ] Teste de ponta a ponta: acessar CheckoutTransparente → preencher e enviar → verificar cobrança no Asaas e registro em `subscriptions` e ativação da empresa após confirmação.
- [ ] Verificar logs da API (e do container) em caso de falha no checkout ou no webhook.
- [ ] Confirmar que o webhook está sendo chamado (logs ou tabela `webhooks_asaas`) e que não há rejeição por assinatura.

---

## 5. Resumo das alterações de código (por agora)

| Onde | O que fazer |
|------|-------------|
| **RegisterWithCheckoutUseCase** | (1) `nextDueDate` = hoje. (2) Após criar subscription no Asaas, inserir subscription na tabela `subscriptions` (status `pending_payment_method`) com empresa_id e produto_id. |
| **WebhookController.handleCheckoutPaymentConfirmed** | Se subscription já existir por `asaas_subscription_id`, **atualizar** (status `active`, datas, payments_count) em vez de inserir; manter ativação da empresa. |
| **WebhookController** (createUser no PAYMENT_CONFIRMED checkout) | Para checkout: se já existir usuário da empresa, **ativar** (status, email); só criar se não existir. |

---

## 6. Referência rápida para produção

- **URL do webhook Asaas:** `https://<DOMÍNIO-DA-API>/api/v1/webhooks/asaas/subscription`  
  (Header: `asaas-access-token` = valor de `ASAAS_WEBHOOK_SECRET`.)

- **IDs de produto no webhook (handleCheckoutPaymentConfirmed):**
  - Plano mensal: `6073e213-e90b-46bd-9332-5fcd9da3726b`
  - Plano anual: `2d06dac6-3791-41dd-b469-65eccd082938`  
  Esses registros devem existir na tabela `produtos` (categoria `extensao_chrome`).

- **CORS (ApiServer):** Em produção as origens permitidas vêm de `FRONTEND_URL` e de uma lista fixa; definir `FRONTEND_URL` com a URL do site (ex.: `https://app.seudominio.com`).

- **Site (CheckoutTransparente):** `VITE_API_URL` deve apontar para a API em produção (ex.: `https://api.seudominio.com/api/v1`). Definir no **build** da imagem do site (variável de ambiente no build).
