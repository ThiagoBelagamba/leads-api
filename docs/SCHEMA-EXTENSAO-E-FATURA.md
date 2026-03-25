# Schema: Tabelas e campos usados pela Extensão e Fatura/Assinatura

**Objetivo:** Identificar o que é **efetivamente usado** pelo fluxo da extensão Disparo Rápido e pelo fluxo de fatura/assinatura (checkout transparente + webhook Asaas), para orientar limpeza ou desacoplamento de tabelas/colunas não utilizadas.

**Escopo considerado:**
- Login da extensão (`/login-disparo-rapido`, `LoginDisparoRapidoUseCase`)
- Criação de sessão (`CreateSessionUseCase`, `user_sessions`, limites por empresa)
- Checkout transparente (`RegisterWithCheckoutUseCase`: empresa + usuário Disparo Rápido; Asaas cliente/assinatura)
- Webhook Asaas (`WebhookController`: confirmação de pagamento, criação de `subscriptions`, ativação de empresa e usuário)
- Job de assinaturas expiradas (`CheckExpiredSubscriptionsJob`)

---

## 1. Tabelas utilizadas pelo fluxo Extensão + Fatura/Assinatura

### 1.1 `empresas`
- **Onde:** `SupabaseEmpresaRepository`, `WebhookController`, `RegisterWithCheckoutUseCase`, `CheckExpiredSubscriptionsJob`
- **Colunas usadas:**  
  `id`, `nome`, `cnpj`, `email`, `telefone`, `api_key`, `plano_atual`, `status_empresa`, `empresa_client_type`, `asaas_customer_id`, `created_at`, `updated_at`, `saldo_creditos` (fixo 0 no create).
- **Observação:** No checkout só parte dos campos é preenchida; no webhook são atualizados `plano_atual`, `status_empresa`, `updated_at`. Demais colunas do schema (ex.: `limite_leads_mes`, `webhook_url`, `configuracoes_crm`, `afiliado_indicacao_codigo`, etc.) **não são usadas** por esse fluxo.

### 1.2 `users_disparo_rapido`
- **Onde:** `UserDisparoRapidoRepository`, `RegisterWithCheckoutUseCase`, `LoginDisparoRapidoUseCase`, `WebhookController` (cria/atualiza usuário pós-pagamento)
- **Colunas usadas:**  
  `id`, `empresa_id`, `email`, `cpf_cnpj`, `nome`, `password_hash`, `status`, `created_at`, `updated_at`, `email_confirmed_at`.
- **Observação:** Colunas como `email_confirmation_token`, `email_confirmation_expires_at` podem ser usadas pelo fluxo de confirmação de e-mail (`confirmEmail`); manter se esse fluxo for usado pelo site/extensão.

### 1.3 `user_sessions`
- **Onde:** `SupabaseUserSessionRepository`, `CreateSessionUseCase`, `LoginDisparoRapidoUseCase`, `CheckExpiredSubscriptionsJob`
- **Colunas usadas:**  
  `id`, `user_id`, `empresa_id`, `device_id`, `refresh_token_hash`, `device_fingerprint`, `ip_address`, `user_agent`, `client_type`, `status`, `created_at`, `last_activity_at`, `expires_at`, `metadata`, `user_disparo_rapido_id`.
- **Uso:** Sessões da extensão (e web) e revogação quando assinatura expira.

### 1.4 `empresa_session_limits`
- **Onde:** `SupabaseEmpresaSessionLimitsRepository`, `CreateSessionUseCase`
- **Colunas usadas:**  
  `id`, `empresa_id`, `produto_id`, `plano`, `max_web_sessions`, `max_extension_sessions`, `sessoes_ativas_count`, `data_inicio`, `data_expiracao`, `status`, `asaas_subscription_id`, `valor_pago`, `created_at`, `updated_at`. (Há fallback para `max_sessoes_simultaneas` em código legado.)
- **Observação:** Colunas como `enforcement_mode`, `updated_by` existem no schema; verificar se são preenchidas por trigger ou outro processo.

### 1.5 `session_audit_logs`
- **Onde:** `SupabaseSessionAuditLogRepository`, `CreateSessionUseCase` (log de criação de sessão)
- **Colunas usadas:** Todas as que o repositório escreve/lê (select/insert). Há referência a `session_audit_logs_archive` no repositório; **confirmar se a tabela de archive existe** no banco.

### 1.6 `session_limit_enforcement_log`
- **Onde:** `SupabaseEmpresaSessionLimitsRepository.recordEnforcementAction`
- **Uso:** Apenas insert (empresa_id, action, details, created_at).

### 1.7 `subscriptions`
- **Onde:** `SupabaseSubscriptionRepository`, `WebhookController` (insert/update), `ProcessAsaasWebhookUseCase`, `CheckExpiredSubscriptionsJob`
- **Colunas usadas:**  
  `id`, `empresa_id`, `produto_id`, `asaas_subscription_id`, `status`, `billing_cycle`, `value`, `has_trial`, `trial_days`, `trial_end_date`, `next_due_date`, `start_date`, `external_reference`, `description`, `first_payment_date`, `last_payment_date`, `payments_count`, `metadata`, `created_at`, `updated_at`.  
  Outras colunas do schema (ex.: `canceled_at`, `suspended_at`, `max_payments`, `asaas_invoice_url`) podem ser usadas por outros use cases de assinatura; não são essenciais **apenas** para o fluxo checkout → webhook → ativação.

### 1.8 `produtos`
- **Onde:** `SupabaseProdutoRepository`, `WebhookController` (busca por `categoria = 'extensao_chrome'`), `ProcessAsaasWebhookUseCase`
- **Colunas usadas:** Leitura por `id`, `categoria`, `nome`; repositório usa `select('*')`. Para o fluxo extensão/fatura basta `id`, `categoria`, `nome` (e chaves de produto usadas no webhook).

### 1.9 `asaas_checkouts`
- **Onde:** `WebhookController` (busca por `external_reference` + `environment`)
- **Colunas usadas:**  
  `id`, `external_reference`, `plan_name`, `environment`, `amount`, `cycle`, `trial_days` (e demais lidas no select para montar subscription).

### 1.10 `webhooks_asaas`
- **Onde:** `WebhookController` (insert do payload recebido)
- **Colunas usadas:**  
  `payload_json`, `tipo_evento`, `payment_id`, `produto_categoria`, `status_processamento`, `erro_mensagem`, `created_at`.

### 1.11 `audit_logs`
- **Onde:** `WebhookController` via `IAuditoriaRepository.create`
- **Colunas usadas:**  
  `tabela`, `registro_id`, `evento`, `metadados`, `empresa_id`, `usuario_id` (e `created_at` retornado). Colunas como `dados_anteriores`, `dados_novos`, `ip_address`, `user_agent`, `lead_id`, `operacao_marketplace` existem no schema mas **não são preenchidas** por esse fluxo (parte vai em `metadados`).

---

## 2. Tabelas **não** utilizadas pelo fluxo Extensão + Fatura/Assinatura

As tabelas abaixo **não são referenciadas** pelos use cases e controllers do fluxo extensão + checkout + webhook + job de expiração listados no escopo. Podem ser usadas por outros módulos da mesma API (CRM, campanhas, leads, etc.) ou por outros serviços; **não remover sem verificar dependências** em todo o projeto e em outros sistemas.

| Tabela | Observação |
|--------|------------|
| `afiliados` | Sistema de afiliados (comentado/desabilitado no webhook) |
| `agent_states` | Estado de agentes (AI/CRM) |
| `ai_agents` | Agentes de IA |
| `ai_conversation_messages` | Mensagens de conversa IA |
| `ai_conversation_threads` | Threads de conversa IA |
| `allowed_ips` | IPs permitidos (não usado no login extensão/sessão) |
| `campaign_contact_stage_history` | Campanhas |
| `campaign_contacts` | Campanhas |
| `campaign_lead_stages` | Campanhas |
| `campaign_stage_charges` | Campanhas |
| `campanhas` | Campanhas |
| `campanhas_leads` | Campanhas |
| `cidades` | Cadastro geográfico |
| `comissoes_afiliados` | Afiliados |
| `consent_records` | LGPD/consentimento |
| `copilot_conversations` | Copilot |
| `credit_purchase_intents` | Compra de créditos (outro fluxo) |
| `credito_transacoes` | Transações de crédito |
| `customer_activities` | CRM clientes |
| `customer_contacts` | CRM clientes |
| `customer_contracts` | CRM clientes |
| `customer_history` | CRM clientes |
| `customers` | CRM clientes |
| `disparo_rapido_contato_vinculacoes` | Vinculação contatos (Disparo Rápido interno) |
| `disparo_rapido_vinculacoes_pendentes` | Vinculações pendentes |
| `disparorapido_conversations` | Conversas Disparo Rápido (produto) |
| `disparorapido_messages` | Mensagens Disparo Rápido |
| `empresa_ai_contexts` | Contexto IA por empresa |
| `empresa_user` | Vínculo user ↔ empresa (auth CRM; **não** usado no login extensão) |
| `estados` | Cadastro geográfico |
| `enrichment_provider_executions` | Enriquecimento de leads |
| `enrichment_providers` | Providers de enriquecimento |
| `lead_acesso_empresas` | Acesso de leads |
| `lead_ai_suggestions` | Sugestões IA para leads |
| `lead_avaliacoes` | Avaliações de leads |
| `lead_conversation_summaries` | Resumos de conversa |
| `lead_enrichment` | Enriquecimento de leads |
| `lead_interaction_events` | Eventos de interação |
| `leads_acesso_contato` | Acesso a contato |
| `leads_base_geral` | Base de leads |
| `leads_contatos` | Contatos de leads |
| `leads_mensagens_contato` | Mensagens a contatos |
| `leads_temp` | Leads temporários |
| `leads_temp_maps` | Leads temporários Maps |
| `message_status` | Status de mensagens (campanhas) |
| `n8n_lead_contexts` | Contexto n8n |
| `negative_media_*` | Mídia negativa (módulo específico) |
| `opportunities` | Oportunidades CRM |
| `paises` | Cadastro geográfico |
| `ph3a_dossier` | Dossiê PH3A |
| `produtos_creditos` | Pacotes de créditos |
| `profiles` | Perfis (auth principal) |
| `roles` | Papéis (auth CRM; **não** usado no login extensão) |
| `rp_*` | Módulo de projetos RP |
| `scraping_jobs` | Jobs de scraping |
| `search_terms` | Termos de busca |
| `worker_status_history` | Histórico de workers |
| `webhook_deliveries` | Entregas de webhooks (outros) |
| `webhooks` | Webhooks (outros) |

---

## 3. Resumo para limpeza

- **Manter (críticas para extensão + fatura):**  
  `empresas`, `users_disparo_rapido`, `user_sessions`, `empresa_session_limits`, `session_audit_logs`, `session_limit_enforcement_log`, `subscriptions`, `produtos`, `asaas_checkouts`, `webhooks_asaas`, `audit_logs`.

- **Colunas não usadas no fluxo extensão/fatura:**  
  Em `empresas`: várias colunas de configuração (limites, webhook_url, configuracoes_crm, etc.) não são lidas/escritas por esse fluxo; podem ser candidatas a deprecação ou limpeza **se** não forem usadas em nenhum outro lugar (API, admin, relatórios).

- **Não remover tabelas** da seção 2 sem checagem global: muitas são usadas por outros fluxos da mesma API (CRM, campanhas, leads, etc.). Este doc considera **apenas** extensão + fatura/assinatura.

- **session_audit_logs_archive:** O repositório de session audit faz referência a essa tabela; confirmar se existe no banco e se há job/migration que a cria e popula.

---

## 4. Limpeza – Fase 1 (iniciada)

**Descoberta:** Nesta API (`disparorapido_api`) apenas as seguintes tabelas são referenciadas em código (`.from('...')`). Não há rotas montadas para campanhas, leads, scraping, etc.

**Tabelas realmente referenciadas nesta API (15):** `empresas`, `users_disparo_rapido`, `user_sessions`, `empresa_session_limits`, `session_audit_logs`, `session_audit_logs_archive` (opcional), `session_limit_enforcement_log`, `subscriptions`, `produtos`, `asaas_checkouts`, `webhooks_asaas`, `audit_logs`, `empresa_user`, `roles`, `allowed_ips`.

**Rotas montadas:** `/version`, `/auth`, `/checkout`, `/produtos`, `/subscriptions`, `/webhooks`, `/sessions`, `/empresas`, `/users`, `/admin`, `/payments`. Não há rotas para campanhas, leads, scraping.

**session_audit_logs_archive:** O método `archiveOldLogs` foi ajustado para não quebrar se a tabela não existir (apenas remove logs antigos sem arquivar).

---

## 5. Próximos passos sugeridos

1. Se quiser usar arquivamento: criar migration para `session_audit_logs_archive` com mesmo schema de `session_audit_logs`.
2. Se o objetivo for um banco só extensão + fatura, planejar extração apenas das 11 tabelas da seção 1 (sem empresa_user/roles/allowed_ips se não forem necessários).
3. Opcional: marcar colunas não usadas em `empresas`/`subscriptions`/`audit_logs` como deprecated.

---

## 6. Colunas não usadas – Mapeamento e plano de deprecação (Fase 2)

Escopo: fluxo **extensão + fatura/assinatura** (checkout, webhook, sessões, job de expiração). Outros use cases (CRM, trial, cancelamento, etc.) podem ler/escrever colunas adicionais; **não remover coluna** sem checar todo o codebase e outros serviços.

### 6.1 Tabela `empresas`

**Colunas efetivamente usadas pelo fluxo extensão + fatura:**

| Coluna | Onde é usada |
|--------|----------------|
| `id` | PK, save, update, findById, findByAsaasCustomerId, WebhookController |
| `nome` | save, update, toDomain, WebhookController (empresa.nome) |
| `cnpj` | save, update, toDomain, WebhookController (empresa.cnpj) |
| `email` | save, toDomain, WebhookController (empresa.email) |
| `telefone` | save, update, toDomain |
| `plano_atual` | save (fixo 'freemium'), WebhookController update (premium/premium_anual) |
| `saldo_creditos` | save (fixo 0) |
| `api_key` | save, toDomain |
| `status_empresa` | save (fixo 'ativa'), WebhookController update ('ativa') |
| `empresa_client_type` | save (env) |
| `asaas_customer_id` | update (repositório), findByAsaasCustomerId, WebhookController (busca empresa) |
| `created_at` | save, toDomain |
| `updated_at` | save, update, WebhookController update |

**Colunas NÃO usadas pelo fluxo extensão + fatura (candidatas a deprecar/remover):**

| Coluna | Observação |
|--------|------------|
| `site` | Nunca escrita nem lida nesse fluxo |
| `limite_leads_mes` | Nunca escrita nem lida nesse fluxo |
| `limite_acesso_base_geral` | Nunca escrita nem lida nesse fluxo |
| `creditos_disponiveis` | Nunca escrita nem lida (usamos `saldo_creditos`) |
| `webhook_url` | Nunca escrita nem lida nesse fluxo |
| `configuracoes_crm` | Nunca escrita nem lida nesse fluxo |
| `configuracoes_notificacoes` | Nunca escrita nem lida nesse fluxo |
| `timezone` | Nunca escrita nem lida nesse fluxo |
| `api_rate_limit` | Nunca escrita nem lida nesse fluxo |
| `data_ultimo_acesso` | Nunca escrita nem lida nesse fluxo |
| `plano` | Nunca escrita nem lida (usamos `plano_atual`) |
| `modelo_cobranca_campanha` | Nunca escrita nem lida nesse fluxo |
| `debitar_mudanca_estagio` | Nunca escrita nem lida nesse fluxo |
| `afiliado_indicacao_codigo` | Nunca escrita nem lida nesse fluxo (sistema afiliados desabilitado) |
| `user_id` | Nunca escrita nem lida nesse fluxo (FK users_disparo_rapido é por empresa_id) |

**Plano seguro para `empresas`:**

1. **Antes de remover:** Buscar no codebase por cada coluna (ex.: `limite_leads_mes`, `webhook_url`) para garantir que nenhum outro use case, rota ou serviço externo usa.
2. **Deprecação:** Opcionalmente comentar no código ou em comentários de migration que a coluna está deprecated para o produto extensão+fatura.
3. **Remoção:** Só criar migration `ALTER TABLE empresas DROP COLUMN ...` após confirmar que nenhum outro sistema (frontend CRM, relatórios, outro microserviço) usa a coluna. Se o mesmo banco servir outros produtos, **não remover** sem acordo.

### 6.2 Tabela `subscriptions`

**Colunas usadas pelo fluxo extensão + fatura:** O repositório e a entidade usam `select('*')` e `fromDatabase`/`toDatabase`, então **todas as colunas existentes no schema são lidas** ao carregar uma subscription. O WebhookController (checkout) **escreve** apenas: `empresa_id`, `produto_id`, `asaas_subscription_id`, `start_date`, `value`, `billing_cycle`, `status`, `has_trial`, `trial_days`, `next_due_date`, `first_payment_date`, `last_payment_date`, `payments_count`, `description`, `external_reference`, `metadata`. Demais colunas (`end_date`, `canceled_at`, `suspended_at`, `max_payments`, `asaas_invoice_url`) são usadas por outros use cases (CancelSubscription, trial, etc.).

**Conclusão para `subscriptions`:** Não há coluna que seja **totalmente** não usada; algumas são só escritas por outros fluxos. **Não remover colunas** de `subscriptions` sem checar CancelSubscriptionUseCase, ProcessAsaasWebhookUseCase (trial), CreateTrialSubscriptionUseCase, etc.

### 6.3 Resumo Fase 2

- **empresas:** 15 colunas listadas acima não são usadas pelo fluxo extensão+fatura; podem ser candidatas a deprecar/remover **após** checagem global.
- **subscriptions:** Manter todas as colunas; várias são usadas por cancelamento, trial e webhook de renovação.
- **Verificação no codebase (disparorapido_api):**

- `configuracoes_crm`, `configuracoes_notificacoes`, `data_ultimo_acesso`, `modelo_cobranca_campanha`: aparecem apenas em tipos (`supabase.ts`); nenhum repositório ou use case do fluxo extensão+fatura lê/escreve.
- `debitar_mudanca_estagio`, `afiliado_indicacao_codigo`: existem na entidade `Empresa.fromPersistence`, mas **não são mapeados** em `SupabaseEmpresaRepository.toDomain` (nem lidos do banco nesse repositório para o domínio).
- `webhook_url`: aparece em `empresaValidator.ts` (contexto `asteriskConfig`) e em `SessionLimitsDTO`; confirmar se é a coluna `empresas.webhook_url` ou outro DTO antes de remover.
- `limite_leads_mes`, `limite_acesso_base_geral`, `creditos_disponiveis`, `site`, `timezone`, `api_rate_limit`, `plano`, `user_id`: sem ocorrência em repositórios/use cases do fluxo extensão+fatura.

**Migration criada:** `supabase/migrations/20260201100000_drop_empresas_unused_columns.js`

- **up:** Remove as 15 colunas listadas (só remove se a coluna existir).
- **down:** Restaura todas as colunas com tipo e default originais; restaura FKs de `user_id` e `afiliado_indicacao_codigo` e o índice `idx_empresas_modelo_cobranca`.

**Como aplicar em ambiente controlado:**

```bash
# Aplicar (drop de todas as colunas)
pnpm run migrate:latest

# Reverter (restaurar colunas)
pnpm run migrate:rollback
```

Para aplicar uma coluna por vez: editar temporariamente `COLUMNS_TO_DROP` na migration (deixar só uma), rodar `migrate:latest`, validar, depois repetir para as demais ou usar a migration completa.
