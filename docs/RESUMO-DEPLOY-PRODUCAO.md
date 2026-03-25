# Resumo: o que fazer para colocar em produção

Checklist consolidado para subir as alterações recentes (e-mail de boas-vindas com PDFs, botões Chrome Web Store, página Confirmar Email, fallback webhook) em produção.

---

## 1. API (Docker + Portainer)

### 1.1 Build e push da imagem

Na pasta do projeto da API:

```bash
cd C:\workspace\workspace2\disparorapido_api

# Defina a tag (ex.: 1.6.2 ou a próxima)
docker build -f docker/Dockerfile -t ghcr.io/thiagobelagamba/disparorapido-api:SUA_TAG .

# Login no GHCR (uma vez)
echo SEU_GITHUB_PAT | docker login ghcr.io -u ThiagoBelagamba --password-stdin

# Push
docker push ghcr.io/thiagobelagamba/disparorapido-api:SUA_TAG
```

### 1.2 Volume dos PDFs no Portainer

Para o e-mail de boas-vindas enviar os 3 PDFs anexados:

1. **Criar o volume**  
   Portainer → Volumes → **Add volume** → Nome: `disparorapido_welcome_pdfs`.

2. **Colocar os 3 PDFs no volume**  
   Nomes exatos: `agentes-ia-disparo-rapido.pdf`, `guia-pratico-para-vendas-no-whatsapp.pdf`, `manual-antibanimento.pdf`.  
   Opções: container temporário com o volume montado em `/data` e upload/cópia dos arquivos para `/data/`, ou depois de montar no serviço da API, enviar os PDFs para `/data/welcome-pdfs/` (Console/Exec ou upload do Portainer).  
   Detalhes: **docs/VOLUME-PDFs-PORTAINER.md**.

3. **Montar o volume no container da API**  
   No serviço da API (ex.: `leads_prod_api`):
   - **Volumes:** mapear o volume `disparorapido_welcome_pdfs` → **Container:** `/data/welcome-pdfs`.
   - **Variável de ambiente:** `WELCOME_PDFS_PATH=/data/welcome-pdfs`.

### 1.3 Atualizar o serviço da API no Portainer

1. Abra a stack que contém o serviço da API.
2. Altere a **imagem** do serviço para a nova tag (ex.: `ghcr.io/thiagobelagamba/disparorapido-api:1.6.2`).
3. Confirme/adicione a variável **WELCOME_PDFS_PATH** = `/data/welcome-pdfs` (seção acima).
4. Confirme o mapeamento do volume (seção acima).
5. **Redeploy** do serviço.

---

## 2. Site (Netlify ou onde estiver hospedado)

O site tem alterações na página **Confirmar Email** (botão “Baixar Ferramenta” com link para a Chrome Web Store).

- Faça o **deploy** do projeto `site-disparo-rapido` (push para o repositório conectado ao Netlify ou deploy manual).
- Garanta que em produção a variável **VITE_API_URL** aponte para a API de produção (ex.: `https://api.disparorapido.com.br/api/v1`), conforme já configurado no build do site.

---

## 3. Banco de dados (opcional, evita fallback)

Se a **subscription** não for criada no PAYMENT_CONFIRMED por causa de FK em `produto_id`, o código usa **fallback** (busca empresa por `customerId` e envia o e-mail de boas-vindas mesmo assim). Para que a subscription seja gravada e o fluxo fique “normal”:

- Garanta que na tabela **produtos** existam registros com os IDs usados pelo checkout:
  - Plano mensal: `6073e213-e90b-46bd-9332-5fcd9da3726b`
  - Plano anual: `2d06dac6-3791-41dd-b469-65eccd082938`

Se esses produtos já existirem em produção, nada a fazer. Se não, insira-os (ou ajuste o código que define `produto_id` para usar produtos que já existem).

---

## 4. Checklist rápido

| O quê | Onde | Ação |
|-------|------|------|
| **Imagem da API** | Local + GHCR | Build, push com nova tag |
| **Volume PDFs** | Portainer | Criar volume `disparorapido_welcome_pdfs`, colocar os 3 PDFs |
| **Mount + env** | Portainer (serviço API) | Volume → `/data/welcome-pdfs`, env `WELCOME_PDFS_PATH=/data/welcome-pdfs` |
| **Imagem do serviço** | Portainer | Atualizar para nova tag e redeploy |
| **Site** | Netlify/repo | Deploy do `site-disparo-rapido` (Confirmar Email + botão Baixar Ferramenta) |
| **Produtos (opcional)** | Supabase/produção | Garantir produtos mensal/anual se quiser subscription sempre criada |

---

## 5. O que já está no código (só precisa do deploy)

- E-mail de boas-vindas: botão verde centralizado, link Chrome Web Store, texto com “ferramenta” em vez de “extensão”.
- E-mail “conta ativada”: mesmo botão e link.
- Anexos dos 3 PDFs quando existirem em `WELCOME_PDFS_PATH`.
- Fallback no webhook: se a subscription não for encontrada, busca empresa por `customerId` e envia o e-mail de boas-vindas.
- Página Confirmar Email: botão “Baixar Ferramenta” com link para a Chrome Web Store.

Nada disso exige configuração extra além do que está neste resumo (volume, env, deploy da API e do site).

---

## 6. Referências

- **Volume e PDFs:** `docs/VOLUME-PDFs-PORTAINER.md`
- **Deploy da API (build, push, Portainer):** `docs/DEPLOY-PRODUCAO-PASSO-A-PASSO.md`
- **Fluxo checkout e produção:** `docs/PRODUCAO-CHECKOUT-FLUXO.md`
