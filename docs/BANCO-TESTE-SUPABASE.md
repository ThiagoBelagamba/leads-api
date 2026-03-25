# Banco de teste – novo projeto Supabase

Como o banco que era usado para teste local virou produção, você pode usar um **novo projeto Supabase** só para testes. As tabelas são criadas pelas **migrações Knex** (não há um único SQL estático).

## Opção 1: Rodar as migrações (recomendado)

1. **Crie um novo projeto** no [Supabase](https://supabase.com/dashboard) (ex.: "Disparo Rápido – Teste").

2. **Pegue a connection string do Postgres:**
   - No projeto: **Settings** → **Database**.
   - Em **Connection string** use **URI** (não o pooler).
   - Exemplo: `postgresql://postgres.[PROJECT_REF]:[SENHA]@aws-0-[REGIAO].pooler.supabase.com:6543/postgres`
   - Para migrações, o ideal é a conexão **direta** (porta **5432**), não o pooler (6543). Exemplo:
   - `postgresql://postgres:[SENHA]@db.[PROJECT_REF].supabase.co:5432/postgres`

3. **No projeto da API**, crie um arquivo de env só para teste (ex.: `.env.test`) ou use variáveis no terminal:
   ```bash
   DATABASE_URL="postgresql://postgres:SUA_SENHA@db.XXXX.supabase.co:5432/postgres"
   ```

4. **Rode as migrações** apontando para esse banco:
   - **Importante:** use sempre `npm run migrate:latest` (ou `migrate:test` com `.env.test`). Não use `npx knex migrate:latest` sozinho — o Knex não encontra o `knexfile.cjs`.
   - Com variável no terminal:
   ```bash
   cd disparorapido_api
   set DATABASE_URL=postgresql://postgres:SUA_SENHA@db.XXXX.supabase.co:5432/postgres
   npm run migrate:latest
   ```
   No PowerShell:
   ```powershell
   $env:DATABASE_URL="postgresql://postgres:SUA_SENHA@db.XXXX.supabase.co:5432/postgres"
   npm run migrate:latest
   ```
   - Com `.env.test` (recomendado para banco de teste):
   ```powershell
   npm run migrate:test
   ```

5. **(Opcional)** Rodar seeds (produtos iniciais, etc.):
   ```bash
   npm run migrate:seed
   ```
   Ou com env de teste:
   ```powershell
   $env:DATABASE_URL="postgresql://..."
   npm run seed:dev
   ```
   (se existir seed que use `.env.dev`)

6. **Conferir:** no Supabase do teste, em **Table Editor**, devem aparecer as tabelas (empresas, users_disparo_rapido, subscriptions, user_sessions, etc.).

---

## Opção 2: Usar `.env.test` (já criado para o projeto de teste)

Foi criado o arquivo **`.env.test`** na raiz do `disparorapido_api` com as variáveis do Supabase de teste (projeto `jllbapebrfguigctulhy`). O arquivo está no `.gitignore` e não será commitado.

1. **Rodar migrações** usando esse env:
   ```bash
   cd disparorapido_api
   npm run migrate:test
   ```

2. **Rodar seeds** (produtos, etc.):
   ```bash
   npx dotenv -e .env.test -- npm run migrate:seed
   ```

3. **Para a API usar este banco** (localmente): no `.env.test` descomente e preencha `SUPABASE_SERVICE_KEY` com a chave **service_role** do dashboard (Settings → API → service_role secret). Ao subir a API, use `dotenv -e .env.test` se quiser apontar tudo para o teste.

---

## Observações

- **Não** existe um único arquivo `.sql` que crie todas as tabelas: o schema é aplicado pelas migrações em `supabase/migrations/` (ordem importa).
- A **primeira** vez que rodar no projeto novo, todas as migrações serão executadas em sequência.
- O Supabase já cria o schema `auth` e a tabela `auth.users`; as migrações que referenciam `auth.users` (ex.: `user_sessions`) dependem disso.
- Para **produção**, use o mesmo processo em outro projeto Supabase (ou o mesmo) com `DATABASE_URL` de produção.

---

## Comandos úteis

| Comando | Descrição |
|--------|-----------|
| `npm run migrate:latest` | Sobe todas as migrações pendentes |
| `npm run migrate:status` | Lista migrações já aplicadas e pendentes |
| `npm run migrate:rollback` | Desfaz a última migração |
| `npm run migrate:rollback:all` | Desfaz todas as migrações |

Se quiser, na raiz do repositório podemos adicionar um script `scripts/migrate-test.sh` (ou `.ps1`) que só defina `DATABASE_URL` e chame `npm run migrate:latest` no `disparorapido_api`.
