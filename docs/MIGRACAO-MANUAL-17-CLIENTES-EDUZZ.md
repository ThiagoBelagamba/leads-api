# Migração manual: 17 clientes Eduzz (respeitando período já pago)

**Objetivo:** Colocar os 17 clientes que ainda têm tempo pago na Eduzz (anual ou renovação recente) **neste Supabase**, com acesso até a **data em que o pagamento deles vence** — sem cobrar de novo. Depois dessa data, o job de assinaturas expiradas suspende o acesso e eles re-assinam pelo novo checkout (Asaas).

---

## 1. Dados que você precisa por cliente

Monte uma planilha (ou lista) com **uma linha por cliente**:

| Campo | Exemplo | Observação |
|-------|---------|------------|
| **nome_empresa** | Empresa XYZ Ltda | Razão social ou nome fantasia |
| **nome_pessoa** | João Silva | Nome do responsável |
| **email** | joao@empresa.com | E-mail de login (único) |
| **cpf_cnpj** | 12345678000199 | Só dígitos (11 ou 14) |
| **telefone** | 11999998888 | Opcional, só dígitos |
| **plano** | anual ou mensal | O que ele tem na Eduzz |
| **data_fim_pago** | 2025-12-31 | **Até quando** ele já pagou na Eduzz (último dia de acesso) |

- **Quem pagou 1 ano:** `data_fim_pago` = data do pagamento + 1 ano (ex.: pagou em 01/12/2024 → 2025-11-30 ou 2025-12-01).
- **Quem acabou de renovar (mensal):** `data_fim_pago` = data da renovação + 1 mês.

Essa data (`data_fim_pago`) será usada como **next_due_date** da assinatura e **data_expiracao** dos limites de sessão. Depois dela, o sistema trata como assinatura expirada (empresa suspensa) e o cliente precisa re-assinar pelo novo checkout.

---

## 2. Como fica a linha na tabela `subscriptions`

Cada cliente migrado da Eduzz vira **uma linha** em `subscriptions`. Exemplo (valores que você preenche ou o sistema gera):

| Coluna | Exemplo (cliente anual, vence 2025-12-31) | Observação |
|--------|--------------------------------------------|------------|
| **id** | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | UUID gerado pelo banco (gen_random_uuid()) |
| **empresa_id** | `b2c3d4e5-f6a7-8901-bcde-f12345678901` | ID da empresa que você inseriu no passo 1 |
| **produto_id** | `2d06dac6-3791-41dd-b469-65eccd082938` | Anual; mensal = `6073e213-e90b-46bd-9332-5fcd9da3726b` |
| **asaas_subscription_id** | `migrado_eduzz_b2c3d4e5-f6a7-8901-bcde-f12345678901` | Marca que veio da Eduzz (não é ID do Asaas) |
| **status** | `active` | Assinatura ativa até next_due_date |
| **billing_cycle** | `YEARLY` | Ou `MONTHLY` |
| **value** | `249` | Anual 249; mensal 39.90 |
| **start_date** | `2025-01-30` | Data de “início” da migração (ex.: hoje) |
| **next_due_date** | **`2025-12-31`** | **Até quando o cliente já pagou na Eduzz** — depois disso o job suspende |
| **has_trial** | `false` | Migração não é trial |
| **trial_days** | `null` | |
| **trial_end_date** | `null` | |
| **first_payment_date** | `2025-01-30` | Mesmo que start_date |
| **last_payment_date** | `2025-01-30` | |
| **payments_count** | `1` | |
| **description** | `Extensão Disparo Rápido - Migrado Eduzz (anual)` | Ou `(mensal)` |
| **external_reference** | `migrado_eduzz` | Identificador da migração |
| **metadata** | `null` ou `{}` | Opcional |
| **created_at** | `2025-01-30T12:00:00Z` | |
| **updated_at** | `2025-01-30T12:00:00Z` | |
| **canceled_at** | `null` | |
| **suspended_at** | `null` | |
| **end_date** | `null` | |
| **max_payments** | `null` | |
| **asaas_invoice_url** | `null` | |

O job **CheckExpiredSubscriptionsJob** usa `next_due_date < hoje` e `status` não suspenso/cancelado para marcar assinatura expirada e suspender a empresa. Por isso **next_due_date** deve ser exatamente a **data_fim_pago** (último dia de acesso já pago na Eduzz).

---

## 3. IDs fixos usados no sistema

Use estes valores nos inserts (já usados pelo webhook/checkout):

| Uso | Valor |
|-----|--------|
| **Produto mensal** (extensao_chrome) | `6073e213-e90b-46bd-9332-5fcd9da3726b` |
| **Produto anual** (extensao_chrome) | `2d06dac6-3791-41dd-b469-65eccd082938` |

Confirme no Supabase que existem linhas em `produtos` com esses `id` e `categoria = 'extensao_chrome'`.

---

## 4. Ordem das operações (por cliente)

Para **cada** um dos 17 clientes, na ordem:

1. **Inserir empresa** → o trigger `auto_create_empresa_session_limits` cria um registro em `empresa_session_limits` (limites 1/1).
2. **Inserir usuário** em `users_disparo_rapido` (vinculado à empresa).
3. **Inserir subscription** com `next_due_date = data_fim_pago` e `asaas_subscription_id` marcando migração (ex.: `migrado_eduzz_<uuid>`).
4. **Atualizar empresa** (plano e status) e **atualizar empresa_session_limits** (data_expiracao, plano, produto_id, limites do plano se quiser).

---

## 5. Senha temporária do usuário

A tabela `users_disparo_rapido` exige `password_hash` (bcrypt). Você tem duas opções:

- **Opção A (recomendada):** Gerar **um** hash para uma senha temporária comum (ex.: `TrocarSenha123!`) e usar o mesmo hash nos 17 usuários. Depois envie e-mail para cada um com: “Seu acesso: e-mail X, senha temporária Y. Troque no primeiro login.”  
  Gerar o hash (Node, no diretório da API):
  ```bash
  node -e "const bcrypt=require('bcrypt'); bcrypt.hash('TrocarSenha123!',10).then(h=>console.log(h));"
  ```
  Use a string impressa no `INSERT` em `password_hash`.

- **Opção B:** Criar um script que, para cada cliente, gera um hash único e já faz os inserts (veja seção 7).

---

## 6. SQL de exemplo para **um** cliente

Substitua os placeholders pelos dados reais de **um** cliente. Execute na ordem.

### 6.1 Inserir empresa

```sql
-- Gere um novo UUID para esta empresa (ou use gen_random_uuid() no INSERT)
-- Exemplo: emp_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

INSERT INTO empresas (
  id,
  nome,
  cnpj,
  email,
  telefone,
  api_key,
  plano_atual,
  status_empresa,
  empresa_client_type,
  saldo_creditos,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),                    -- id (guarde para os próximos passos!)
  'Nome da Empresa',                    -- nome
  '12345678000199',                     -- cnpj (só dígitos)
  'email@cliente.com',                  -- email
  '11999998888',                        -- telefone (ou NULL)
  encode(gen_random_bytes(16), 'hex'),  -- api_key
  'premium_anual',                      -- plano_atual: 'premium' (mensal) ou 'premium_anual' (anual)
  'ativa',
  'disparo_rapido',
  0,
  now(),
  now()
)
RETURNING id;
```

**Guarde o `id` retornado** — use como `empresa_id` nos passos seguintes.

### 6.2 Inserir usuário (users_disparo_rapido)

```sql
-- Substitua:
-- :empresa_id   = id da empresa (RETURNING do passo 6.1)
-- :password_hash = resultado do bcrypt (ex.: $2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)

INSERT INTO users_disparo_rapido (
  empresa_id,
  email,
  cpf_cnpj,
  nome,
  password_hash,
  status,
  email_confirmed_at,
  created_at,
  updated_at
) VALUES (
  ':empresa_id',           -- id da empresa
  'email@cliente.com',     -- mesmo email da empresa
  '12345678000199',        -- mesmo cpf_cnpj da empresa
  'Nome do Responsável',   -- nome da pessoa
  ':password_hash',        -- hash bcrypt da senha temporária
  'active',
  now(),
  now(),
  now()
);
```

Se a tabela não tiver `email_confirmed_at`, remova essa coluna do `INSERT`.

### 6.3 Inserir subscription (até data_fim_pago)

```sql
-- Substitua:
-- :empresa_id = id da empresa
-- :data_fim_pago = até quando ele já pagou (ex.: '2025-12-31')
-- :produto_id = 6073e213-e90b-46bd-9332-5fcd9da3726b (mensal) ou 2d06dac6-3791-41dd-b469-65eccd082938 (anual)

INSERT INTO subscriptions (
  empresa_id,
  produto_id,
  asaas_subscription_id,
  status,
  billing_cycle,
  value,
  start_date,
  next_due_date,
  has_trial,
  trial_days,
  first_payment_date,
  last_payment_date,
  payments_count,
  description,
  external_reference,
  created_at,
  updated_at
) VALUES (
  ':empresa_id',
  ':produto_id',
  'migrado_eduzz_' || :empresa_id,   -- ou gen_random_uuid()::text
  'active',
  'YEARLY',                          -- ou 'MONTHLY'
  249,                               -- anual 249; mensal 39.90
  current_date,                      -- start_date
  ':data_fim_pago',                  -- CRÍTICO: último dia de acesso
  false,
  null,
  current_date,
  current_date,
  1,
  'Extensão Disparo Rápido - Migrado Eduzz (anual)',  -- ou '(mensal)'
  'migrado_eduzz',
  now(),
  now()
);
```

### 6.4 Atualizar empresa_session_limits

O trigger já criou uma linha em `empresa_session_limits` ao inserir a empresa. Ajuste **data_expiracao**, **plano**, **produto_id** e, se quiser, limites de sessão (ex.: plano pago com mais sessões):

```sql
-- :empresa_id = id da empresa
-- :data_fim_pago = mesmo valor usado na subscription
-- :produto_id = mesmo da subscription

UPDATE empresa_session_limits
SET
  data_inicio = current_date,
  data_expiracao = ':data_fim_pago',
  plano = 'anual',                  -- ou 'mensal'
  produto_id = ':produto_id',
  status = 'active',
  asaas_subscription_id = 'migrado_eduzz_' || ':empresa_id',
  updated_at = now()
WHERE empresa_id = ':empresa_id';
```

Se o plano pago tiver mais sessões que o padrão (1/1), ajuste também:

```sql
UPDATE empresa_session_limits
SET max_web_sessions = 1, max_extension_sessions = 3  -- ex.: 3 sessões extensão
WHERE empresa_id = ':empresa_id';
```

(Valores típicos do seu plano: confira em `produtos` ou no código que aplica produto à empresa.)

---

## 6. Resumo por cliente

| Passo | Tabela | O que fazer |
|-------|--------|-------------|
| 1 | `empresas` | INSERT; guardar `id`. |
| 2 | `users_disparo_rapido` | INSERT com `empresa_id`, `password_hash` (bcrypt da senha temporária). |
| 3 | `subscriptions` | INSERT com `next_due_date = data_fim_pago`, `asaas_subscription_id = 'migrado_eduzz_' || empresa_id`. |
| 4 | `empresa_session_limits` | UPDATE na linha do trigger com `data_expiracao`, `plano`, `produto_id`, `status`. |

Depois disso, o cliente acessa com **e-mail + senha temporária** até **data_fim_pago**. Após essa data, o job de assinaturas expiradas marca a empresa como suspensa e ele precisa re-assinar pelo novo checkout (Asaas).

---

## 8. Gerar SQL a partir da planilha (Excel ou CSV)

O projeto tem um script que lê sua planilha e gera o SQL completo com senha temporária.

**Passos:**

1. **Copie o arquivo para o projeto** (uma das opções):
   - Copie `EMPRESAS DR CONCILIAÇÃO.xlsx` para `disparorapido_api/scripts/empresas-migracao.xlsx`, **ou**
   - No Excel: Arquivo > Salvar como > **CSV UTF-8** e salve como `disparorapido_api/scripts/empresas-migracao.csv`.

2. **Se for usar .xlsx**, instale o pacote (no diretório da API):
   ```bash
   pnpm add -D xlsx
   ```

3. **Execute o script** (no diretório `disparorapido_api`):
   ```bash
   # Se colocou o arquivo em scripts/ com nome empresas-migracao.csv ou empresas-migracao.xlsx:
   node scripts/gerar-sql-migracao-eduzz.js

   # Ou passe o caminho completo do arquivo:
   node scripts/gerar-sql-migracao-eduzz.js "C:\Users\mfsil\OneDrive\Desktop\EMPRESAS DR CONCILIAÇÃO.xlsx"
   ```

4. **Senha temporária:** por padrão é `TrocarSenha123!`. Para outra:
   ```bash
   set SENHA_TEMP=OutraSenha123!
   node scripts/gerar-sql-migracao-eduzz.js scripts/empresas-migracao.csv
   ```

5. **Arquivo gerado:** `disparorapido_api/scripts/sql-migracao-eduzz-17-clientes.sql`  
   Abra no Supabase (SQL Editor) e execute na ordem.

**Colunas esperadas na planilha (nomes aproximados, o script normaliza):**

| Obrigatório | Nome no Excel/CSV (exemplos) |
|-------------|------------------------------|
| Nome empresa | Nome Empresa, Empresa, Razão Social |
| Nome pessoa | Nome, Responsável, Contato |
| Email | Email, E-mail |
| CPF/CNPJ | CPF/CNPJ, CNPJ, Documento |
| Data fim pago | Data Fim, Vencimento, Validade, Até |

Opcional: Telefone, Plano (mensal/anual). Se Plano não existir, assume mensal.

---

## 9. Opcional: script Node (referência) para os 17

Se preferir não rodar SQL manual 17 vezes, dá para fazer um script que:

1. Lê um CSV com as colunas da planilha (nome_empresa, nome_pessoa, email, cpf_cnpj, telefone, plano, data_fim_pago).
2. Para cada linha: gera `empresa_id` (uuid), insere empresa, gera hash bcrypt para uma senha temporária (única ou igual), insere user, insere subscription com `next_due_date = data_fim_pago`, atualiza `empresa_session_limits`.
3. Usa o mesmo Supabase (variáveis de ambiente da API) e as mesmas tabelas/colunas acima.

Se quiser, na próxima iteração dá para esboçar esse script (ex.: `scripts/migrar-17-eduzz.js`).

---

## 10. Comunicação aos clientes

Sugestão de e-mail (adaptar):

- “Mudamos o sistema de pagamento. Seu acesso foi migrado e vale até [data_fim_pago]. Para entrar: use o e-mail [email] e a senha temporária [senha]. Troque a senha no primeiro acesso. Após [data_fim_pago], para continuar será preciso re-assinar pelo novo link: [link do CheckoutTransparente].”

Assim você usa este Supabase limpo, respeita o período já pago (anual ou renovação) e depois do vencimento eles passam naturalmente para o fluxo Asaas.
