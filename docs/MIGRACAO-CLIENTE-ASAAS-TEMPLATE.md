# Template: migrar 1 cliente Asaas (banco antigo → novo)

Use este formato para gerar o SQL de migração do **próximo** cliente. Baseado no que funcionou para a MentalMe no banco novo.

---

## 1. INSERT empresas (todas as colunas do banco novo)

Substituir os placeholders pelos dados do cliente. Manter **mesmo id** (empresa_id do banco antigo) e **asaas_customer_id** (ex.: `cus_000159471948`).

```sql
INSERT INTO "public"."empresas" (
  "id", "nome", "cnpj", "email", "telefone", "site",
  "plano_atual", "limite_leads_mes", "limite_acesso_base_geral", "creditos_disponiveis", "saldo_creditos",
  "webhook_url", "configuracoes_crm", "configuracoes_notificacoes", "timezone",
  "api_key", "api_rate_limit", "status_empresa", "data_ultimo_acesso",
  "created_at", "updated_at",
  "plano", "modelo_cobranca_campanha", "debitar_mudanca_estagio",
  "asaas_customer_id", "afiliado_indicacao_codigo", "empresa_client_type", "user_id"
) VALUES (
  ':empresa_id',
  ':nome',
  ':cnpj',
  ':email',
  ':telefone',
  null,
  'premium',
  '100',
  '10',
  '100',
  '0',
  null,
  '{}',
  '{}',
  'America/Sao_Paulo',
  ':api_key',
  '1000',
  'ativa',
  null,
  ':created_at',
  ':updated_at',
  'freemium',
  'mudanca_estagio',
  'true',
  ':asaas_customer_id',
  null,
  'disparo_rapido',
  null
)
ON CONFLICT (id) DO NOTHING;
```

**Valores fixos usados:** `plano_atual` = `'premium'`, `plano` = `'freemium'`, `status_empresa` = `'ativa'`, `empresa_client_type` = `'disparo_rapido'`, `modelo_cobranca_campanha` = `'mudanca_estagio'`, `debitar_mudanca_estagio` = `'true'`, limites 100/10/100/0.

---

## 2. INSERT users_disparo_rapido

Mesmo **password_hash** do banco antigo (auth.users ou users_disparo_rapido) para a senha continuar igual.

```sql
INSERT INTO users_disparo_rapido (id, empresa_id, email, cpf_cnpj, nome, password_hash, status, email_confirmed_at, created_at, updated_at)
VALUES (
  ':user_id',
  ':empresa_id',
  ':email',
  ':cpf_cnpj',
  ':nome',
  ':password_hash',
  'active',
  ':email_confirmed_at',
  ':created_at',
  ':updated_at'
)
ON CONFLICT (id) DO NOTHING;
```

---

## 3. INSERT subscriptions (formato banco novo)

- **status** só `'active'` (não existe mais `trialing`).
- **value** como string: `'39.90'` (mensal) ou `'249'` (anual).
- **produto_id** mensal: `6073e213-e90b-46bd-9332-5fcd9da3726b`; anual: `2d06dac6-3791-41dd-b469-65eccd082938`.
- **asaas_subscription_id** = mesmo do Asaas/banco antigo (para webhooks).
- **next_due_date** = próxima cobrança; **data_expiracao** do empresa_session_limits deve bater com essa data ou com a vigência do acesso.

```sql
INSERT INTO "public"."subscriptions" (
  "id", "empresa_id", "produto_id", "asaas_subscription_id",
  "status", "billing_cycle", "value",
  "has_trial", "trial_days", "trial_end_date",
  "next_due_date", "first_payment_date", "last_payment_date", "max_payments", "payments_count",
  "description", "external_reference", "metadata",
  "start_date", "end_date", "canceled_at", "suspended_at",
  "created_at", "updated_at", "asaas_invoice_url"
) VALUES (
  ':subscription_id',
  ':empresa_id',
  '6073e213-e90b-46bd-9332-5fcd9da3726b',
  ':asaas_subscription_id',
  'active',
  'MONTHLY',
  '39.90',
  'false',
  null,
  null,
  ':next_due_date',
  ':first_payment_date',
  ':last_payment_date',
  null,
  '1',
  'Extensão Disparo Rápido - Plano mensal',
  'extensao_mensal',
  '{}',
  ':start_date',
  null,
  null,
  null,
  ':created_at',
  ':updated_at',
  ':asaas_invoice_url'
)
ON CONFLICT (id) DO NOTHING;
```

Para **plano anual:** `billing_cycle` = `'YEARLY'`, `value` = `'249'`, `produto_id` = `'2d06dac6-3791-41dd-b469-65eccd082938'`, description/external_reference ajustados para “Plano anual” / `extensao_anual`.

---

## 4. UPDATE empresa_session_limits

Trigger já cria a linha ao inserir em **empresas**. Só atualizar com dados da assinatura.

- **plano**: um de `freemium`, `starter`, `pro`, `business`, `enterprise` (ex.: `'pro'` para pago).
- **status**: `'ativo'` (não `'active'`).

```sql
UPDATE empresa_session_limits
SET
  data_inicio = ':start_date'::date,
  data_expiracao = ':next_due_date'::date,
  plano = 'pro',
  produto_id = '6073e213-e90b-46bd-9332-5fcd9da3726b',
  status = 'ativo',
  asaas_subscription_id = ':asaas_subscription_id',
  updated_at = now()
WHERE empresa_id = ':empresa_id';
```

---

## Ordem de execução

1. INSERT empresas  
2. INSERT users_disparo_rapido  
3. INSERT subscriptions  
4. UPDATE empresa_session_limits  

Referência completa de um cliente que já rodou: `scripts/sql-migracao-mentalme.sql`.
