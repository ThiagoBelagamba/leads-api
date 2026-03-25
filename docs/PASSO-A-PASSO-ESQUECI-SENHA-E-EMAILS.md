# Passo a passo: Esqueci minha senha + emails (verde/azul)

Siga na ordem abaixo para colocar em produção o fluxo "Esqueci minha senha" (email Hostinger → página no site) e os emails com cores Disparo Rápido.

---

## 1. API (disparorapido_api)

### 1.1 Banco de dados – nova migration

A API precisa das colunas de reset de senha em `users_disparo_rapido`.

**Opção A – Rodar migrations (recomendado se você usa Knex no deploy):**

- No servidor/container onde a API roda, **não** use `SKIP_MIGRATIONS=true` na próxima vez que subir (ou rode as migrations manualmente).
- A migration `20260204000000_add_password_reset_to_users_disparo_rapido.js` vai criar:
  - `password_reset_token` (string, nullable)
  - `password_reset_expires_at` (timestamp, nullable)
  - índice em `password_reset_token`

**Opção B – Aplicar SQL à mão (se continuar com SKIP_MIGRATIONS=true):**

Execute no banco (Supabase SQL Editor ou `psql`):

```sql
ALTER TABLE users_disparo_rapido
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_disparo_rapido_password_reset_token
  ON users_disparo_rapido(password_reset_token)
  WHERE password_reset_token IS NOT NULL;
```

### 1.2 Variável de ambiente

No ambiente da API (`.env` local ou variáveis do Portainer/stack):

- Adicione:
  - `SITE_URL=https://disparorapido.com.br`  
  (sem barra no final; é a base usada no link do email de “redefinir senha”.)

Se usar `docs/stack-producao.yml`, inclua na seção `environment`:

```yaml
- SITE_URL=https://disparorapido.com.br
```

### 1.3 Deploy da API

- Build da imagem (versão nova, ex.: 1.3.4).
- Push para o registry (ex.: GHCR).
- No Portainer: atualizar o stack/serviço para usar a nova imagem e fazer pull/redeploy.

---

## 2. Site (site-disparo-rapido)

### 2.1 Variável de ambiente

No painel da Netlify (ou onde o site estiver):

- Confirme que existe:
  - `VITE_API_URL=https://api.disparorapido.com.br/api/v1`  
  (para a página de redefinir senha chamar a API em produção.)

### 2.2 Deploy do site

- Commit e push das alterações (nova página `RedefinirSenha`, rota `/redefinir-senha` no `App.tsx`).
- Aguardar o deploy na Netlify (ou refazer deploy manual).

### 2.3 Teste rápido

- Abrir no navegador:  
  `https://disparorapido.com.br/redefinir-senha`  
- Deve carregar a página (sem token deve mostrar a mensagem para usar o link do email).
- Opcional: abrir com um token fake para ver o formulário:  
  `https://disparorapido.com.br/redefinir-senha?token=teste`

---

## 3. Extensão (extensao-disparo-rapido)

### 3.1 Build da extensão

- No projeto da extensão: `pnpm build` (ou `npm run build`).
- Recarregar a extensão no Chrome: `chrome://extensions` → Disparo Rápido → ícone de recarregar.

### 3.2 (Opcional) Publicar na Chrome Web Store

- A versão que aparece na loja é a do **último pacote enviado** (não a do código atual). Para publicar esta versão:
  1. Atualize a versão em `public/manifest.json` e em `package.json` (ex.: 2.2.1 → 2.2.2).
  2. Rode `pnpm run build`, compacte o **conteúdo** da pasta `dist/` em um .zip e faça upload no [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
- Guia detalhado: `extensao-disparo-rapido/docs/PUBLICAR-CHROME-WEB-STORE.md`.

---

## 4. Testar o fluxo “Esqueci minha senha”

1. Abrir a extensão Disparo Rápido.
2. Clicar em **“Esqueci a senha”**.
3. Informar um **email cadastrado** em `users_disparo_rapido` e enviar.
4. Verificar o **email** (Hostinger): deve chegar um email com assunto “Redefinir senha - Disparo Rápido” e um **botão “Redefinir minha senha”** (link para o site).
5. Clicar no link (ou copiar e colar no navegador): deve abrir  
   `https://disparorapido.com.br/redefinir-senha?token=...`
6. Na página do site: informar **nova senha** e **confirmar**; enviar.
7. Deve aparecer mensagem de sucesso; em seguida fazer **login na extensão** com o mesmo email e a **nova senha**.

Se em qualquer passo der erro (API, site ou extensão), confira: URL da API no site, `SITE_URL` na API, e se a migration/SQL foi aplicada no banco.

---

## 5. Resumo rápido

| Onde        | O que fazer |
|------------|-------------|
| **Banco**  | Rodar migration ou executar o SQL das colunas de reset em `users_disparo_rapido`. |
| **API**    | Definir `SITE_URL=https://disparorapido.com.br`; build + deploy da nova imagem. |
| **Site**   | Garantir `VITE_API_URL` de produção; deploy com a página `/redefinir-senha`. |
| **Extensão** | Build + recarregar no Chrome (e publicar nova versão na loja se for o caso). |

Depois disso, “Esqueci minha senha” envia o email da Hostinger com link para o site, e os emails transacionais (boas-vindas, confirmação, reset, pagamento, vencimento, suspensão) passam a usar o layout verde/azul Disparo Rápido.
