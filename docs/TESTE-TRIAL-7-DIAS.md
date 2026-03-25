# Como testar o "após 7 dias" do trial (teste grátis)

O trial de 7 dias **não cobra na hora**: a primeira cobrança é agendada no Asaas para daqui a 7 dias. Para testar o comportamento "após 7 dias" sem esperar, use uma das opções abaixo.

---

## Opção 1: Simular o webhook (recomendado)

Quando o Asaas cobra no 7º dia, ele envia um webhook `PAYMENT_CONFIRMED` para a API. Você pode **simular esse webhook** localmente e conferir se a assinatura passa de `trialing` para `active`.

### Passo a passo

1. **Crie um trial** pela página `/teste-gratis` (ou `POST /api/v1/checkout/register-trial`). Anote o `subscription_id` retornado (ou o `asaas_subscription_id` no banco na tabela `subscriptions`).

2. **Obtenha o ID da assinatura no Asaas**  
   - No banco: `SELECT id, asaas_subscription_id, status FROM subscriptions WHERE id = '<subscription_id>';`  
   - Ou use o ID que a API retornou e busque `asaas_subscription_id` no banco.

3. **Envie o webhook simulado** (com a API rodando, ex.: `pnpm dev:api`):

   ```bash
   cd disparorapido_api/scripts
   node send-webhook-trial-confirmed.js <ASAAS_SUBSCRIPTION_ID>
   ```

   Ou com variável de ambiente:

   ```bash
   ASAAS_SUBSCRIPTION_ID=sub_xxxxxxxx node send-webhook-trial-confirmed.js
   ```

4. **Verifique**  
   - Logs da API: deve aparecer "Trial subscription converted to paid from webhook".  
   - Banco: `SELECT id, status, metadata FROM subscriptions WHERE asaas_subscription_id = '<ASAAS_SUBSCRIPTION_ID>';` — o `status` deve ter passado para `active`.

Em **desenvolvimento** (`NODE_ENV !== 'production'`), a API aceita o webhook sem o header `asaas-access-token`. Em produção é obrigatório o token configurado no Asaas.

---

## Opção 2: Trial com 1 dia (opcional, só em dev)

Para que o Asaas **realmente** cobre no dia seguinte e dispare o webhook sozinho:

1. No `RegisterTrialUseCase`, você pode temporariamente usar um número menor de dias (ex.: 1) quando existir uma variável de ambiente, por exemplo:

   - `TRIAL_DAYS_FOR_TEST=1` → `nextDueDate` = amanhã.

2. Crie o trial, espere o dia seguinte (ou até o horário em que o Asaas processa) e confira no painel do Asaas e na API se o webhook foi recebido e a assinatura ativada.

**Atenção:** não use `TRIAL_DAYS_FOR_TEST` em produção; mantenha sempre 7 dias em produção.

---

## Opção 3: Painel Asaas (sandbox)

No **sandbox** do Asaas:

1. Crie o trial pelo site/API.
2. No painel, abra a assinatura e veja a cobrança agendada para daqui a 7 dias.
3. Alguns ambientes de sandbox permitem **antecipar** ou **simular** o pagamento de uma cobrança (menu da cobrança ou configurações). Se existir essa opção, use para disparar o pagamento e o webhook sem esperar 7 dias.

---

## Resumo do fluxo real

1. Usuário se cadastra no **teste grátis** → assinatura criada no Asaas com `nextDueDate` = hoje + 7 dias e cartão já vinculado.  
2. No nosso banco a assinatura fica com `status = trialing`.  
3. No **7º dia** o Asaas gera a cobrança e processa o cartão.  
4. Asaas envia **PAYMENT_CONFIRMED** para `POST /api/v1/webhooks/asaas/subscription`.  
5. A API chama `ConvertTrialSubscriptionUseCase` e atualiza a assinatura para `status = active`.

O script `send-webhook-trial-confirmed.js` simula o passo 4 para você testar o passo 5 sem esperar 7 dias.
