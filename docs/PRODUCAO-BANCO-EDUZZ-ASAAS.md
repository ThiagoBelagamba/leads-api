# Produção: Banco de testes como produção e convivência Eduzz + Asaas

**Contexto:**
- Você usa **outro Supabase** para produção (clientes reais).
- O Supabase **deste workspace** é só para testes locais (fluxo 100% Asaas).
- Está cogitando **transformar este banco de testes em produção**.
- Na produção atual: a transição de pagamento foi da **Eduzz** para o **Asaas**, mas ainda há clientes ativos na Eduzz.

Este doc ajuda a **pensar cenários e opções** sem decidir por você.

---

## 0. Cenário: poucos clientes Eduzz (ex.: 17) — caminho simples

**Se você tem poucos clientes na Eduzz (ex.: 17) e quer usar este Supabase (limpo) como produção**, o caminho mais direto é:

1. **Este Supabase vira produção**  
   API e site passam a apontar para **este** projeto Supabase (o que você limpou). Env de produção: `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` deste projeto.

2. **Os 17 clientes Eduzz não são “migrados” no banco**  
   Eles **re-assinam pelo novo fluxo** (CheckoutTransparente → Asaas). Quando cada um acessar o novo link, preencher dados e pagar, o sistema cria empresa + usuário + assinatura **neste** Supabase. Nenhuma migração de dados do banco antigo é necessária.

3. **Comunicação aos 17**  
   Envie um e-mail (ou mensagem) explicando que o meio de pagamento mudou e que, para continuar com acesso, precisam **re-assinar pelo novo link** (ex.: link do CheckoutTransparente). Opcional: prazo (ex.: 30 dias), oferta de primeiro mês ou desconto para quem migrar no prazo.

4. **Banco antigo (produção atual)**  
   Depois do prazo que você definir, pode ficar só para consulta histórica ou ser desligado. Não precisa manter dois bancos em uso para o dia a dia.

**Resumo:** Use este Supabase como produção. Os 17 clientes Eduzz continuam tendo acesso **re-assinando pelo novo checkout**; quando fizerem isso, entram neste banco já no Asaas. Sem convivência Eduzz no código, sem migração de dados — só comunicação e um link novo.

**Checklist rápido (cenário 17 clientes):**

| Passo | Ação |
|-------|------|
| 1 | Configurar env de **produção** da API com `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` **deste** projeto Supabase. |
| 2 | Fazer backup deste Supabase antes de apontar produção para ele. |
| 3 | Garantir migrations aplicadas neste banco (`pnpm run migrate:latest`). Produtos em `produtos`, webhook Asaas configurado (ver `PRODUCAO-CHECKOUT-FLUXO.md`). |
| 4 | Fazer deploy da API e do site apontando para este Supabase (e para o Asaas de produção). |
| 5 | Redigir e-mail/mensagem para os 17: “Pagamento mudou para novo sistema. Para continuar, re-assine aqui: [link do checkout].” Definir prazo e oferta (ex.: primeiro mês ou desconto) se quiser. |
| 6 | Após o prazo, desligar ou deixar só leitura no Supabase antigo; operação do dia a dia fica 100% neste Supabase. |

**Clientes que já pagaram 1 ano ou acabaram de renovar:** para não cobrar de novo, faça a **migração manual** deles neste Supabase com acesso até a data em que o pagamento deles vence na Eduzz. Passo a passo e exemplos de SQL: **[MIGRACAO-MANUAL-17-CLIENTES-EDUZZ.md](./MIGRACAO-MANUAL-17-CLIENTES-EDUZZ.md)**.

---

## 1. Entendendo o problema

| Onde | Situação |
|------|----------|
| **Produção (outro Supabase)** | Clientes reais; parte paga via **Eduzz**, parte via **Asaas**. Dois meios de pagamento ativos. |
| **Testes (este Supabase)** | Só Asaas; schema “limpo” para extensão + fatura; sem histórico Eduzz. |

Perguntas centrais:

1. **O que “transformar este banco em produção” significa para você?**
   - **(A)** Daqui pra frente **só novos clientes** usam este Supabase + Asaas; o outro continua para quem já está lá (Eduzz + Asaas).
   - **(B)** **Migrar todos** os dados/dados relevantes do outro Supabase para este e passar a usar **só este** como produção (incluindo lógica para quem ainda paga na Eduzz).
   - **(C)** Outro (ex.: este vira produção só para um produto/segmento).

2. **O que fazer com os clientes que ainda pagam na Eduzz?**
   - Mantê-los na Eduzz até o fim do ciclo e depois migrar para Asaas?
   - Forçar migração (re-cadastro de cartão/assinatura no Asaas)?
   - Suportar os dois gateways em paralelo por um tempo (convivência)?

As opções abaixo combinam **escolha de banco** com **estratégia Eduzz → Asaas**.

---

## 2. Opções de arquitetura

### Opção 2.1 – Dois bancos: produção legada + produção nova (este)

**Ideia:** O Supabase **atual de produção** continua sendo o “banco legado” (Eduzz + Asaas, clientes existentes). O **banco deste workspace** vira o “banco novo” só para **novos clientes**, 100% Asaas.

- **Vantagens**
  - Este banco já está alinhado com o código atual (só Asaas; extensão + fatura).
  - Não precisa migrar dados nem tocar no legado de imediato.
  - Novos clientes nunca passam pela Eduzz.
- **Desvantagens**
  - Dois ambientes Supabase para manter (dois conjuntos de env, backups, custo).
  - Se a API/site servem os dois, precisa de critério (ex.: domínio, flag, tenant) para saber qual banco usar.
  - Relatórios e “visão única” de clientes ficam distribuídos em dois bancos.

**Requer:** Na API (ou no front que chama a API), definir **qual Supabase** usar por requisição (ex.: novo cadastro/checkout → banco novo; login de usuário existente → banco legado, ou o contrário conforme sua regra).

---

### Opção 2.2 – Um banco só (produção atual) com convivência Eduzz + Asaas

**Ideia:** Manter **apenas o Supabase de produção atual**. Nele, você trata explicitamente **duas fontes de assinatura**: Eduzz e Asaas (ex.: coluna `payment_provider` ou `subscription_source` em `subscriptions` ou em uma tabela de “faturamento”).

- **Vantagens**
  - Um único banco de produção; relatórios e operação centralizados.
  - Clientes Eduzz continuam ativos até você migrá-los ou até o fim do contrato/ciclo.
- **Desvantagens**
  - Código e dados precisam “saber” se a assinatura vem da Eduzz ou do Asaas (validação de acesso, renovação, cancelamento, webhooks).
  - O código desta API hoje é **só Asaas**; seria preciso adaptar (ou ter um serviço legado) para Eduzz.
  - Schema e processos do banco de produção podem estar mais “pesados” (Eduzz + Asaas + outros módulos).

**Requer:** No banco de produção: identificar onde está a **origem da assinatura** (Eduzz vs Asaas) e, na aplicação, usar essa origem para:
- considerar assinatura válida (Eduzz ou Asaas),
- renovar/cancelar no gateway correto,
- não misturar webhooks (Eduzz vs Asaas).

---

### Opção 2.3 – Migrar clientes Eduzz para Asaas e unificar em um banco

**Ideia:** Definir um **período e um processo** para que **todos** os clientes que ainda pagam na Eduzz:
- sejam comunicados,
- re-cadastrem forma de pagamento no Asaas (novo checkout/assinatura),
- e, após confirmação, sejam considerados só Asaas.

Depois disso você pode:
- ou **unificar produção no banco atual** (todos Asaas),
- ou **migrar dados relevantes** para o banco deste workspace e passá-lo a ser o único produção.

- **Vantagens**
  - No médio prazo: um único gateway (Asaas) e um único “modelo” de assinatura.
  - Facilita usar este código (100% Asaas) e, se quiser, este Supabase como produção única.
- **Desvantagens**
  - Operação e comunicação: prazos, e-mails, suporte, possível perda de alguns clientes na migração.
  - Até o último cliente Eduzz migrar, você ainda pode precisar de convivência (opção 2.2) no banco atual.

**Requer:** Cronograma, comunicação, fluxo de “re-assinatura” no Asaas e critério claro de “assinatura ativa” (Eduzz vs Asaas) durante a transição.

---

### Opção 2.4 – Este banco vira produção “nova” e você migra só o necessário do antigo

**Ideia:** Este Supabase vira **o** banco de produção. Do outro você **migra** apenas o que for essencial para não quebrar clientes existentes (ex.: empresas, usuários, assinaturas já ativas no Asaas). Clientes que ainda dependem da Eduzz continuam no **banco antigo** até migrarem para Asaas (ou você desliga Eduzz em uma data combinada).

- **Vantagens**
  - Produção “nova” limpa (schema extensão + fatura, só Asaas).
  - Migração sob controle (só o que precisar).
- **Desvantagens**
  - Trabalho de ETL/migração (empresas, users_disparo_rapido, subscriptions com asaas_subscription_id, etc.).
  - Durante um tempo: dois bancos de novo (legado para Eduzz + parte Asaas antiga; novo para Asaas pós-migração), a menos que você migre **todos** os clientes Asaas para o novo banco e desligue o antigo.

**Requer:** Lista exata de tabelas/dados a migrar (vide `SCHEMA-EXTENSAO-E-FATURA.md`), scripts de migração, e regra de “quem usa qual banco” na API até a unificação.

---

## 3. Resumo prático

| Objetivo | Opção mais alinhada |
|----------|----------------------|
| Não mexer no banco de produção agora; só novos clientes em ambiente limpo | **2.1** – Este banco = produção “nova”, só Asaas; antigo continua com Eduzz + Asaas. |
| Um banco só, mantendo clientes Eduzz ativos sem mudar de gateway ainda | **2.2** – Um banco (produção atual) com convivência Eduzz + Asaas no código e nos dados. |
| Eliminar Eduzz e ter só Asaas no médio prazo | **2.3** – Migração planejada de clientes Eduzz → Asaas; depois unificar banco (ou adotar este como único). |
| Este banco vira produção e você traz dados do antigo de forma controlada | **2.4** – Migração seletiva + regra de qual banco cada tipo de cliente usa. |

---

## 4. Se optar por convivência Eduzz + Asaas (opção 2.2)

No **banco de produção** (e, se aplicável, no código que o usa):

1. **Identificar a origem da assinatura**
   - Ex.: em `subscriptions` (ou tabela equivalente), coluna `payment_provider` ou `subscription_source` com valores `'eduzz'` | `'asaas'`.
   - Se hoje não existe: criar migration que adiciona a coluna e preenche com `'asaas'` onde já houver `asaas_subscription_id`; onde for assinatura antiga Eduzz, preencher `'eduzz'`.

2. **Regras de negócio**
   - Assinatura válida = (payment_provider = 'asaas' e status ativo no Asaas) **ou** (payment_provider = 'eduzz' e regra de validade Eduzz).
   - Renovação/cancelamento: chamar o gateway correto conforme `payment_provider`.
   - Webhooks: rota/secret por gateway (Eduzz vs Asaas) para não misturar eventos.

3. **Código**
   - Esta API (`disparorapido_api`) hoje só trata Asaas. Para Eduzz seria preciso:
     - ou um serviço/adaptador Eduzz (webhooks, status de assinatura),
     - ou manter o que já existe em produção para Eduzz e só evoluir o lado Asaas aqui.

---

## 5. Se optar por “este banco = produção nova” (opção 2.1 ou 2.4)

Checklist rápido:

- [ ] **Env de produção:** `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` apontando para **este** projeto Supabase (o que hoje é de testes).
- [ ] **Backup:** Antes de virar produção, backup completo e política de backup contínuo.
- [ ] **Migrations:** Garantir que todas as migrations necessárias estão aplicadas neste banco (ex.: `pnpm run migrate:latest`); conferir com `SCHEMA-EXTENSAO-E-FATURA.md` e `PRODUCAO-CHECKOUT-FLUXO.md`.
- [ ] **Produtos e config:** IDs de produtos em `produtos`, `asaas_checkouts` (se usado), webhook Asaas apontando para a API de produção, CORS e env do site.
- [ ] **Critério “qual banco”:** Se a API ainda falar com os dois Supabase (legado + este), definir e implementar a regra (ex.: novo registro → este; login por email → consultar os dois ou só um).
- [ ] **Dados migrados (se 2.4):** Scripts e validação para empresas/usuários/assinaturas Asaas trazidos do antigo; não duplicar chaves (email, asaas_subscription_id, etc.).

---

## 6. Próximo passo sugerido

1. **Definir em uma frase:** “Este banco de testes vai ser produção para **[novos clientes só / todos os clientes após migração / outro]**.”
2. **Definir prazo para Eduzz:** “Até [data] todos os clientes Eduzz precisam ter migrado para Asaas ou serão considerados inativos.”
3. A partir disso, escolher **uma** opção da seção 2 (ou um híbrido: ex. 2.1 agora e 2.3 em seguida) e detalhar no mesmo doc: responsáveis, prazos e mudanças em código/banco/env.

Se quiser, na próxima iteração dá para detalhar **um** cenário (ex. só 2.1 ou só 2.2) com passos concretos de código e migrations neste repositório.
