# Token de cartão e reativação de assinatura

## Visão geral

O token do cartão (checkout transparente Asaas) é gravado na tabela `empresas` após o checkout ou quando o cliente reativa a assinatura informando o cartão. Isso permite tentar reativar sem pedir o cartão novamente (usando o token salvo).

- **Campos em `empresas`**: `asaas_credit_card_token`, `asaas_card_last4`, `asaas_card_expiry_month`, `asaas_card_expiry_year`
- **Migração**: executar `scripts/sql-empresas-asaas-card-token.sql` no Supabase (SQL Editor).

---

## Tratamento de erros na reativação

O token **não “vence” por tempo**, mas pode **falhar** na reativação se, por exemplo:

- O cartão foi bloqueado
- O cartão expirou
- Limite insuficiente
- Transação não autorizada pela operadora

### Comportamento da API

- Em erro de **cartão inválido / transação não autorizada**, a API retorna **HTTP 400** com:
  - `success: false`
  - `error.code`: `VALIDATION_ERROR`
  - `error.details.code`: `CARD_DECLINED`
  - Mensagem orientando a atualizar os dados de pagamento

- Quando o token usado era o **gravado na empresa** (e não o enviado no body), a API **limpa** o token da empresa após essa falha, para não tentar de novo com o mesmo token inválido.

### O que o front deve fazer

1. Ao chamar `POST /subscriptions/:id/restore` (com ou sem body), tratar a resposta de erro.
2. Se a API retornar **400** e `error.details?.code === 'CARD_DECLINED'`:
   - Exibir mensagem: tipo *“Cartão inválido ou não autorizado. Atualize os dados de pagamento.”*
   - **Redirecionar** o cliente para o fluxo de **atualização de pagamento** (checkout transparente para gerar um **novo** token e, se aplicável, chamar “Alterar cartão” ou “Retomar” de novo com o novo token).

Exemplo de resposta de erro:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cartão inválido ou transação não autorizada. Atualize os dados de pagamento e tente novamente.",
    "details": {
      "code": "CARD_DECLINED",
      "detail": "..."
    }
  }
}
```

---

## Atualização de expiração e aviso aos clientes

O Asaas permite consultar informações do cartão tokenizado (últimos 4 dígitos e mês/ano de expiração). Para evitar falhas na reativação por cartão vencido:

1. **Guardar dados na empresa**  
   Sempre que gravar o token (checkout ou reativação), gravar também:
   - `asaas_card_last4`
   - `asaas_card_expiry_month` (MM)
   - `asaas_card_expiry_year` (AAAA)  
   quando o front ou a API do Asaas fornecerem esses dados.

2. **Script/job mensal (recomendado)**  
   Rodar um job (por exemplo, todo dia 1º ou semanalmente) que:
   - Lista empresas com `asaas_credit_card_token` preenchido e `asaas_card_expiry_month` / `asaas_card_expiry_year` preenchidos.
   - Calcula quais cartões vencem nos **próximos 30–60 dias**.
   - Envia e-mail (ou outro canal) avisando o cliente para atualizar o cartão antes do vencimento.

Exemplo de critério (cartão vence no último dia do mês/ano e esse dia está a até 60 dias):

```sql
-- Empresas com token e cartão cujo último dia de validade está nos próximos 60 dias
SELECT id, nome, email, asaas_card_last4, asaas_card_expiry_month, asaas_card_expiry_year
FROM empresas
WHERE asaas_credit_card_token IS NOT NULL
  AND asaas_card_expiry_month IS NOT NULL
  AND asaas_card_expiry_year IS NOT NULL
  AND (
    (asaas_card_expiry_year::int * 100 + asaas_card_expiry_month::int)
    <= EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '60 days'))::int * 100
       + EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '60 days'))::int
  );
```

Ajuste o intervalo (30 ou 60 dias) e o canal de notificação conforme sua operação. A API do Asaas pode ser usada para obter/atualizar dados do cartão tokenizado quando disponível.

### Enviar last4 e validade no restore

Para popular `asaas_card_last4`, `asaas_card_expiry_month` e `asaas_card_expiry_year` (e permitir o script de expiração), o front pode enviar no body do `POST /subscriptions/:id/restore`:

- `cardLast4`: últimos 4 dígitos (ex.: `"4242"`)
- `cardExpiryMonth`: mês (ex.: `"12"`)
- `cardExpiryYear`: ano (ex.: `"2027"`)

Assim, ao gravar o token após o restore, a API grava também esses campos quando informados.
