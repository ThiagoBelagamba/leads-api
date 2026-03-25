# Análise e review: renovação e atualização de next_due_date

Este documento traz **duas análises** da funcionalidade de renovação (pagamento confirmado → `next_due_date` atualizado).

---

## 1. Análise de fluxos onde next_due_date é definido/atualizado

### 1.1 Onde next_due_date é escrito

| Ponto | Arquivo | Quando | Observação |
|-------|---------|--------|------------|
| **Trial → Active (1º pagamento)** | `ConvertTrialSubscriptionUseCase` | Webhook `PAYMENT_CONFIRMED` para assinatura em trial | `computeNextDueDate(paymentDate, billingCycle)` → repositório `updateStatus(..., { nextDueDate, firstPaymentDate, lastPaymentDate, paymentsCount })`. ✅ Correto. |
| **Checkout – primeira assinatura** | `WebhookController.handleCheckoutPaymentConfirmed` | Primeiro pagamento (checkout transparente), subscription ainda não existe | Calcula `nextDueDate = today + 1 mês ou + 1 ano` e insere na `subscriptions`. ✅ Correto. |
| **Checkout – renovação (parcela adicional)** | `WebhookController.handleCheckoutPaymentConfirmed` | Segundo pagamento em diante (`existingSubscription` existe) | **Antes da correção:** só atualizava `last_payment_date` e `payments_count`; **não** atualizava `next_due_date`. ❌ Bug. **Depois da correção:** passa a atualizar também `next_due_date` com `computeNextDueDateFromCycle(today, billingCycle)`. ✅ |

### 1.2 Conclusão da análise 1

- **Trial:** conversão trial → active já atualizava `next_due_date` corretamente (e demais datas) via `ConvertTrialSubscriptionUseCase` + `SupabaseSubscriptionRepository.updateStatus`.
- **Checkout – primeira vez:** criação da subscription já preenchia `next_due_date` na inserção.
- **Checkout – renovação:** era o único fluxo que não atualizava `next_due_date`. Com isso, após o segundo (ou N-ésimo) pagamento, a data de vencimento no banco ficava desatualizada, podendo:
  - fazer jobs (ex.: expirados, inativação) tratarem a assinatura como vencida;
  - exibir data errada no CRM/admin.

A correção aplicada foi: no ramo “assinatura já existente” de `handleCheckoutPaymentConfirmed`, calcular e persistir `next_due_date` usando a mesma lógica de ciclo (mensal/anual, etc.) que já existe no `ConvertTrialSubscriptionUseCase`.

---

## 2. Review de consistência e riscos

### 2.1 Consistência entre fluxos

- **Cálculo da próxima data:** tanto `ConvertTrialSubscriptionUseCase.computeNextDueDate` quanto o novo `WebhookController.computeNextDueDateFromCycle` usam a mesma regra por ciclo (WEEKLY, MONTHLY, YEARLY, etc.). Assim, trial → active e renovações do checkout ficam alinhados.
- **Formato:** em ambos os fluxos, `next_due_date` é gravado em formato de data (YYYY-MM-DD) no banco, compatível com o restante do sistema.

### 2.2 Idempotência e duplicidade de webhook

- O Asaas pode reenviar o mesmo evento. No fluxo de **renovação** (subscription já existe), o update é “setar last_payment_date = today, next_due_date = today + ciclo, payments_count += 1”. Reexecutar para o mesmo pagamento apenas repete o mesmo update (idempotente em termos de next_due_date e last_payment_date para aquele dia). O único efeito colateral é `payments_count` poder ser incrementado mais de uma vez para o mesmo pagamento; isso já existia antes e pode ser refinado depois (ex.: idempotência por `asaas_payment_id`), mas não foi introduzido por esta correção.

### 2.3 Jobs e regras de negócio

- **CheckExpiredSubscriptionsJob / InactivateCanceledSubscriptionsJob:** dependem de `next_due_date` para decidir se a assinatura está vencida ou se o período pago já terminou. Com o `next_due_date` sendo atualizado na renovação, esses jobs passam a enxergar a data correta após cada pagamento confirmado.
- **Empresa ativa:** no fluxo de renovação, a subscription já está ativa e a empresa já está ativa; não há alteração de status de empresa nesse ramo, apenas atualização de datas e contagem de pagamentos.

### 2.4 Conclusão do review 2

- A mudança é localizada (apenas o ramo de “parcela adicional” em `handleCheckoutPaymentConfirmed`) e alinha o comportamento de renovação ao dos outros fluxos.
- Não há mudança de contrato de repositório nem de assinatura da API pública; apenas uso de dados já carregados (`existingSubscription.billingCycle`).
- Recomendações futuras (fora do escopo desta correção):
  - Considerar idempotência por `payment.id` do Asaas ao processar PAYMENT_CONFIRMED (evitar incrementar `payments_count` mais de uma vez para o mesmo pagamento).
  - Manter um único lugar para a lógica de “próxima data por ciclo” (ex.: função compartilhada entre ConvertTrialSubscriptionUseCase e WebhookController) para evitar divergência futura.

---

## Resumo

1. **Análise 1:** Mapeamento de todos os pontos que definem/atualizam `next_due_date` mostrou que só o fluxo de **renovação do checkout** (pagamento quando a subscription já existe) não atualizava essa data; a correção foi implementada nesse ramo.
2. **Review 2:** A correção está consistente com os outros fluxos, não introduz riscos novos identificados e permite que jobs e UI usem `next_due_date` corretamente após cada renovação (pagou → next_due atualizado).
