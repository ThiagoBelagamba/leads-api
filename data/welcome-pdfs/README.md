# PDFs de boas-vindas (teste local)

Coloque aqui os **3 PDFs** que são anexados ao e-mail de boas-vindas. Use exatamente estes nomes:

- `agentes-ia-disparo-rapido.pdf`
- `guia-pratico-para-vendas-no-whatsapp.pdf`
- `manual-antibanimento.pdf`

No `.env` da API, defina:

```env
WELCOME_PDFS_PATH=./data/welcome-pdfs
```

Depois suba a API (`pnpm dev:api`) e dispare um fluxo que envia o e-mail de boas-vindas para testar.

Ver **docs/VOLUME-PDFs-PORTAINER.md** para teste local e configuração em produção (Portainer).
