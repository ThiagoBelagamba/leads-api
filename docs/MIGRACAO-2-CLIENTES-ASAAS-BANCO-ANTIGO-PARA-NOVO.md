# Migrar os 2 clientes novos (Asaas) do banco antigo para o novo

**Cenário:** Você já migrou os 17 da Eduzz para o **novo** Supabase. No **banco antigo** (produção atual) entraram mais **2 clientes** pelo fluxo Asaas. Ao subir a API apontando para o **novo** banco, esses 2 precisam existir no novo com os **mesmos IDs** e `asaas_subscription_id` para os webhooks do Asaas continuarem encontrando a assinatura certa.

**Objetivo:** Copiar do banco **antigo** para o **novo** as linhas desses 2 clientes **preservando** `empresa_id`, `asaas_subscription_id` e dados de login (email, `password_hash`), para:
- Login na extensão continuar funcionando (mesmo email/senha).
- Webhooks do Asaas (pagamento confirmado, etc.) continuarem atualizando a empresa/assinatura certa no novo banco.

---

## 1. Identificar os 2 clientes no banco antigo

No **Supabase antigo** (produção atual), rode no SQL Editor:

```sql
-- Assinaturas que NÃO são migração Eduzz (são do fluxo Asaas real)
-- Ajuste a data se quiser só os que criaram após a migração dos 17
SELECT s.id AS subscription_id,
       s.empresa_id,
       s.asaas_subscription_id,
       s.status,
       s.billing_cycle,
       s.next_due_date,
       e.nome AS empresa_nome,
       e.email AS empresa_email
FROM subscriptions s
JOIN empresas e ON e.id = s.empresa_id
WHERE s.asaas_subscription_id NOT LIKE 'migrado_eduzz_%'
  AND s.status IN ('active', 'trialing')
ORDER BY s.created_at DESC
LIMIT 10;
```

Anote os **2** `empresa_id` (e os `asaas_subscription_id`) que são os clientes novos que você quer levar para o novo banco.

---

## 2. Exportar dados do banco antigo (por empresa)

Para **cada um** dos 2 `empresa_id`, rode no banco **antigo** as queries abaixo. Você vai usar o resultado para montar os INSERTs no novo banco.

Substitua `:empresa_id` pelo UUID da empresa (ex.: `'a1b2c3d4-...'`).

### 2.1 Empresa

```sql
SELECT id, nome, cnpj, email, telefone, api_key, plano_atual, status_empresa, empresa_client_type, saldo_creditos, created_at, updated_at
FROM empresas
WHERE id = :empresa_id;
```

### 2.2 Usuário Disparo Rápido

```sql
SELECT id, empresa_id, email, cpf_cnpj, nome, password_hash, status, email_confirmed_at, created_at, updated_at
FROM users_disparo_rapido
WHERE empresa_id = :empresa_id;
```

### 2.3 Assinatura(s)

```sql
SELECT id, empresa_id, produto_id, asaas_subscription_id, status, billing_cycle, value, start_date, next_due_date,
       has_trial, trial_days, first_payment_date, last_payment_date, payments_count, description, external_reference, created_at, updated_at
FROM subscriptions
WHERE empresa_id = :empresa_id;
```

### 2.4 Limites de sessão

```sql
SELECT empresa_id, data_inicio, data_expiracao, plano, produto_id, status, asaas_subscription_id, max_web_sessions, max_extension_sessions, created_at, updated_at
FROM empresa_session_limits
WHERE empresa_id = :empresa_id;
```

Guarde os resultados (ou copie linha a linha) para montar os INSERTs/UPDATE no novo banco. O importante é **manter os mesmos IDs** (empresa, user, subscription) e o **mesmo** `asaas_subscription_id`.

---

## 3. Inserir no banco novo (na ordem)

No **novo** Supabase (SQL Editor), para **cada um** dos 2 clientes:

### 3.1 INSERT empresa

Use os valores exportados. Exemplo (substitua pelos dados reais):

```sql
INSERT INTO empresas (id, nome, cnpj, email, telefone, api_key, plano_atual, status_empresa, empresa_client_type, saldo_creditos, created_at, updated_at)
VALUES (
  'uuid-empresa-igual-ao-antigo',
  'Nome da Empresa',
  'cnpj ou cpf',
  'email@empresa.com',
  'telefone ou null',
  COALESCE('api_key_do_antigo', encode(gen_random_bytes(16), 'hex')),
  'premium',
  'ativa',
  'disparo_rapido',
  0,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
```

- **id**: use o **mesmo** `empresa_id` do banco antigo.
- **plano_atual**: deve ser um dos permitidos: `freemium`, `basico`, `premium`, `enterprise`.

### 3.2 INSERT users_disparo_rapido

```sql
INSERT INTO users_disparo_rapido (id, empresa_id, email, cpf_cnpj, nome, password_hash, status, email_confirmed_at, created_at, updated_at)
VALUES (
  'uuid-user-igual-ao-antigo',
  'uuid-empresa-igual-ao-antigo',
  'email@empresa.com',
  'cpf_cnpj',
  'Nome do Usuário',
  '$2b$10$...',  -- mesmo hash do banco antigo
  'active',
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
```

- **id**: mesmo `id` do user no banco antigo.
- **password_hash**: **copie exatamente** do banco antigo para a senha continuar a mesma.

### 3.3 INSERT subscriptions

```sql
INSERT INTO subscriptions (id, empresa_id, produto_id, asaas_subscription_id, status, billing_cycle, value, start_date, next_due_date, has_trial, trial_days, first_payment_date, last_payment_date, payments_count, description, external_reference, created_at, updated_at)
VALUES (
  'uuid-subscription-igual-ao-antigo',
  'uuid-empresa-igual-ao-antigo',
  'uuid-produto-mensal-ou-anual',
  'sub_xxxxx',  -- mesmo asaas_subscription_id do Asaas
  'active',
  'MONTHLY',
  39.9,
  '2026-01-XX',
  '2026-02-XX',
  false,
  null,
  '2026-01-XX',
  '2026-01-XX',
  1,
  'Descrição',
  'external_ref',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
```

- **id**: mesmo `id` da subscription no banco antigo.
- **asaas_subscription_id**: **tem que ser exatamente** o mesmo que está no Asaas (e no banco antigo), senão o webhook não acha a assinatura.
- **produto_id**: use o mesmo do antigo (ex.: mensal `6073e213-e90b-46bd-9332-5fcd9da3726b`, anual `2d06dac6-3791-41dd-b469-65eccd082938`).

### 3.4 UPDATE empresa_session_limits

No novo banco, o **trigger** já criou uma linha em `empresa_session_limits` quando você fez o INSERT em `empresas`. Só precisa **atualizar** com os dados do antigo (e com os valores permitidos pelo banco):

```sql
UPDATE empresa_session_limits
SET
  data_inicio = '2026-01-XX'::date,
  data_expiracao = '2026-02-XX'::date,
  plano = 'pro',
  produto_id = '6073e213-e90b-46bd-9332-5fcd9da3726b',
  status = 'ativo',
  asaas_subscription_id = 'sub_xxxxx',
  updated_at = now()
WHERE empresa_id = 'uuid-empresa-igual-ao-antigo';
```

- **plano**: só pode ser `freemium`, `starter`, `pro`, `business`, `enterprise`.
- **status**: só pode ser `ativo`, `expirado`, `cancelado`.
- **asaas_subscription_id**: mesmo da subscription (para consistência).

---

## 4. Ordem e conflitos

1. **Empresas** primeiro (o trigger cria `empresa_session_limits`).
2. **users_disparo_rapido** (depende de `empresa_id`).
3. **subscriptions** (depende de `empresa_id` e `produto_id`).
4. **UPDATE** em `empresa_session_limits` (já existe por causa do trigger).

Se rodar de novo por engano, use `ON CONFLICT (id) DO NOTHING` nos INSERTs para não dar erro de chave duplicada.

---

## 5. Conferência rápida

No **novo** banco, depois de inserir os 2 clientes:

```sql
SELECT e.id, e.nome, e.email,
       (SELECT count(*) FROM users_disparo_rapido u WHERE u.empresa_id = e.id) AS users,
       (SELECT count(*) FROM subscriptions s WHERE s.empresa_id = e.id) AS subs,
       (SELECT asaas_subscription_id FROM subscriptions s WHERE s.empresa_id = e.id AND s.status = 'active' LIMIT 1) AS asaas_sub_id
FROM empresas e
WHERE e.id IN ('uuid-1', 'uuid-2');
```

- Cada empresa deve ter 1 user e pelo menos 1 subscription com o `asaas_subscription_id` igual ao do Asaas.

---

## 6. Resumo

| O que | Onde | Por quê |
|-------|------|--------|
| Mesmo `empresa_id` | empresas + FKs | Ligar user, subscription e session_limits à mesma empresa. |
| Mesmo `password_hash` | users_disparo_rapido | Cliente continua entrando com a mesma senha. |
| Mesmo `asaas_subscription_id` | subscriptions + empresa_session_limits | Webhooks do Asaas encontram a assinatura no novo banco. |
| Mesmo `id` da subscription | subscriptions | Evitar duplicidade e manter referências. |

Depois que a API de produção apontar para o **novo** Supabase, os 2 clientes vão logar normalmente e os eventos do Asaas (pagamento, renovação) vão atualizar os dados certos nesse banco.
