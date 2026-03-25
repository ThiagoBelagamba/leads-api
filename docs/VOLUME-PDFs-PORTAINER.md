# Volume para PDFs de boas-vindas (Docker / Portainer)

Este guia explica como criar um **volume** no Portainer para armazenar os 3 PDFs que são anexados ao e-mail de boas-vindas e como montar esse volume no container da API.

---

## 1. PDFs utilizados

Os arquivos devem ter exatamente estes nomes:

| Arquivo | Descrição |
|--------|-----------|
| `agentes-ia-disparo-rapido.pdf` | Material sobre agentes de IA |
| `guia-pratico-para-vendas-no-whatsapp.pdf` | Guia prático de vendas no WhatsApp |
| `manual-antibanimento.pdf` | Manual antibanimento |

Eles serão anexados automaticamente aos e-mails **Bem-vindo ao Disparo Rápido** (credenciais e conta ativada), desde que existam no caminho configurado dentro do container.

---

## 2. Testar localmente (antes de subir para produção)

Assim você valida o envio do e-mail com os 3 PDFs anexados na sua máquina.

### 2.1 Pasta local com os PDFs

1. Crie a pasta `data/welcome-pdfs` na raiz do projeto da API (se ainda não existir):
   ```bash
   cd disparorapido_api
   mkdir -p data/welcome-pdfs
   ```
2. Copie os 3 PDFs para dentro de `data/welcome-pdfs` com **exatamente** estes nomes:
   - `agentes-ia-disparo-rapido.pdf`
   - `guia-pratico-para-vendas-no-whatsapp.pdf`
   - `manual-antibanimento.pdf`

### 2.2 Variável de ambiente no `.env`

No seu `.env` (na raiz de `disparorapido_api`), adicione:

```env
# Caminho dos PDFs de boas-vindas (local = pasta do projeto; produção = volume no Portainer)
WELCOME_PDFS_PATH=./data/welcome-pdfs
```

No Windows, se preferir caminho absoluto:

```env
WELCOME_PDFS_PATH=C:\workspace\workspace2\disparorapido_api\data\welcome-pdfs
```

### 2.3 Subir a API e disparar o e-mail

1. Suba a API localmente (ex.: `pnpm dev:api`).
2. Dispare um dos fluxos que enviam o e-mail de boas-vindas:
   - **E-mail com credenciais (senha temporária):** cadastro/registro que chama `sendWelcomeEmail` (ex.: fluxo de criação de empresa/usuário que envia boas-vindas).
   - **E-mail “conta ativada”:** simular o webhook de pagamento confirmado do Asaas que chama `sendAccountActivatedEmail` (ex.: usar o script `test-webhook-simulation.ps1` ou enviar POST para o endpoint do webhook com payload de pagamento confirmado).

3. Confira na caixa de entrada do e-mail de destino: o e-mail deve vir **com os 3 anexos** em PDF.

### 2.4 Logs

Nos logs da API você deve ver algo como:

- `PDFs de boas-vindas anexados ao email` com `count: 3` e a lista dos arquivos.

Se `WELCOME_PDFS_PATH` não existir ou estiver vazio, o e-mail sai sem anexos e pode aparecer algo como `WELCOME_PDFS_PATH não existe, email sem anexos`.

Depois de validar localmente, use a **Seção 3** em diante para configurar o volume no Portainer em produção.

---

## 3. Criar o volume no Portainer

1. Acesse o **Portainer** e vá em **Volumes** (menu lateral).
2. Clique em **+ Add volume**.
3. Preencha:
   - **Name:** `disparorapido_welcome_pdfs` (ou outro nome de sua preferência).
   - **Driver:** `local` (padrão).
4. Clique em **Create the volume**.

---

## 4. Colocar os PDFs dentro do volume

Há três formas. A mais simples é usar o **Volume browser** do Portainer (quando disponível).

### Opção A – Volume browser (recomendado, se disponível)

1. No Portainer, vá em **Volumes** e clique no volume `disparorapido_welcome_pdfs`.
2. Abra **Browse** (ou **Volume browser**).
3. Use o **botão de upload** (ícone de seta para cima) no canto superior direito.
4. Envie os 3 PDFs com os nomes exatos: `agentes-ia-disparo-rapido.pdf`, `guia-pratico-para-vendas-no-whatsapp.pdf`, `manual-antibanimento.pdf`.
5. Os arquivos ficarão na raiz do volume; ao montar o volume no container em `/data/welcome-pdfs`, a API encontrará os arquivos nesse caminho.

### Opção B – Container temporário para popular o volume

1. No Portainer, vá em **Containers** → **+ Add container**.
2. **Name:** `temp-pdfs` (qualquer nome).
3. **Image:** `alpine` (ou `busybox`).
4. Em **Volumes**, clique em **map additional volume**:
   - **Volume:** selecione `disparorapido_welcome_pdfs`.
   - **Container:** `/data` (caminho dentro do container).
5. **Command:** algo que mantém o container rodando por um tempo, por exemplo:  
   `sh -c "sleep 300"`  
   (só para o volume ficar montado; você vai copiar os arquivos no passo seguinte).
6. Inicie o container.
7. Abra o **Console** do container `temp-pdfs` (ou use **Exec**).
8. Por exemplo com **Upload** (se o Portainer tiver): envie os 3 PDFs para `/data/` com os nomes exatos da tabela acima.  
   **Ou**, no seu PC (com Docker instalado), use:

   ```bash
   # No seu PC, na pasta onde estão os 3 PDFs
   docker cp agentes-ia-disparo-rapido.pdf temp-pdfs:/data/
   docker cp guia-pratico-para-vendas-no-whatsapp.pdf temp-pdfs:/data/
   docker cp manual-antibanimento.pdf temp-pdfs:/data/
   ```

9. Pare e remova o container `temp-pdfs`. O volume `disparorapido_welcome_pdfs` continua com os arquivos.

### Opção C – Copiar depois que a API já estiver com o volume montado

1. Primeiro conclua a **Seção 5** (montar o volume no serviço da API).
2. Faça **Redeploy** do serviço da API.
3. No Portainer, abra o container da API → **Console** (ou **Exec**).
4. Verifique o ponto de montagem, por exemplo:  
   `ls /data/welcome-pdfs`  
   (o caminho é o que você configurou em **Container** na seção 4).
5. Se o Portainer permitir **Upload**, envie os 3 PDFs para esse caminho (`/data/welcome-pdfs/`) com os nomes exatos.
6. **Alternativa no servidor:** se você tem SSH no host, pode copiar para o volume assim (ajuste `NOME_DO_VOLUME` e a pasta de origem):

   ```bash
   # No servidor (host), descobrir onde o Docker montou o volume
   docker volume inspect disparorapido_welcome_pdfs
   # Copiar os PDFs para o path "Mountpoint" que aparecer (ex.: /var/lib/docker/volumes/disparorapido_welcome_pdfs/_data)
   sudo cp /caminho/local/agentes-ia-disparo-rapido.pdf /var/lib/docker/volumes/disparorapido_welcome_pdfs/_data/
   sudo cp /caminho/local/guia-pratico-para-vendas-no-whatsapp.pdf /var/lib/docker/volumes/disparorapido_welcome_pdfs/_data/
   sudo cp /caminho/local/manual-antibanimento.pdf /var/lib/docker/volumes/disparorapido_welcome_pdfs/_data/
   ```

---

## 4. Montar o volume no container da API

Você precisa que o **mesmo volume** seja montado no container do serviço da API no caminho que a aplicação espera.

### 5.1 Variável de ambiente na stack/serviço

No Portainer, no **serviço da API** (ex.: `leads_prod_api`):

- Adicione (ou edite) a variável de ambiente:
  - **Name:** `WELCOME_PDFS_PATH`
  - **Value:** `/data/welcome-pdfs`

Esse é o caminho **dentro do container** onde os PDFs devem estar.

### 4.2 Volume no serviço (Portainer UI)

1. Abra a **Stack** que contém o serviço da API (ou o **Container** da API, se for criado direto).
2. Edite o serviço/container e vá na parte de **Volumes**.
3. **Map additional volume:**
   - **Volume:** `disparorapido_welcome_pdfs` (o volume que você criou).
   - **Container:** `/data/welcome-pdfs`  
     (tem que ser exatamente o mesmo valor de `WELCOME_PDFS_PATH`).
4. Salve e faça **Redeploy** do serviço.

### 5.3 Se você usa YAML (docker-compose / stack)

Inclua o volume e o mount no serviço da API. Exemplo:

```yaml
services:
  leads_prod_api:
    image: ghcr.io/thiagobelagamba/disparorapido-api:1.6.0
    environment:
      WELCOME_PDFS_PATH: /data/welcome-pdfs
      # ... outras variáveis (SUPABASE_URL, ASAAS_*, etc.)
    volumes:
      - disparorapido_welcome_pdfs:/data/welcome-pdfs
    # ... restante (ports, networks, etc.)

volumes:
  disparorapido_welcome_pdfs:
    external: true
```

Se o volume foi criado pelo Portainer com o nome `disparorapido_welcome_pdfs`, use `external: true`. Se for criar pelo próprio YAML, use:

```yaml
volumes:
  disparorapido_welcome_pdfs:
```

e remova o `external: true`.

---

## 6. Conferir se está tudo certo

1. **Redeploy** do serviço da API.
2. Abra o **Console/Exec** do container da API e rode:
   ```bash
   ls -la /data/welcome-pdfs
   ```
   Deve listar os 3 arquivos `.pdf` com os nomes exatos.
3. Dispare um e-mail de boas-vindas (novo cadastro ou conta ativada) e confira na caixa de entrada se os 3 PDFs vêm anexados.

Se `WELCOME_PDFS_PATH` não estiver definido ou os arquivos não existirem nesse caminho, o e-mail é enviado normalmente, só sem anexos.

---

## 7. Resumo rápido

| O quê | Onde |
|-------|------|
| Criar volume | Portainer → Volumes → Add volume → nome: `disparorapido_welcome_pdfs` |
| Colocar PDFs | Container temporário com volume montado em `/data` e upload/copy dos 3 PDFs para `/data/`; ou depois de montar no serviço da API, upload/copy para `/data/welcome-pdfs/` |
| Montar no container da API | Volume `disparorapido_welcome_pdfs` → **Container path:** `/data/welcome-pdfs` |
| Variável de ambiente | `WELCOME_PDFS_PATH=/data/welcome-pdfs` no serviço da API |

Nomes exatos dos arquivos: `agentes-ia-disparo-rapido.pdf`, `guia-pratico-para-vendas-no-whatsapp.pdf`, `manual-antibanimento.pdf`.
