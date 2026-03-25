# Feature Specification: Sistema de Gestão de Vendas LeadsRapido

**Feature Branch**: `001-project-documentation`
**Created**: 2026-01-13
**Status**: Documentation
**Input**: User description: "crie a especificação deste projeto, quero que insira os recursos de login e integração com asaas, a ideia é montar um documento contendo os recursos existente, não é para criar nada, só se houver algum erro ou defeito"

## User Scenarios & Testing

### User Story 1 - Autenticação e Acesso ao Sistema (Priority: P1)

Usuários e empresas precisam se autenticar no sistema para acessar funcionalidades restritas. O sistema oferece autenticação via email/senha com recursos de recuperação de senha e confirmação de email.

**Why this priority**: É a funcionalidade mais crítica, pois sem autenticação os usuários não conseguem acessar nenhuma outra funcionalidade do sistema.

**Independent Test**: Pode ser completamente testado através do processo de registro, login com email/senha, e recuperação de senha. Entrega valor imediato ao permitir que usuários acessem o sistema de forma segura.

**Acceptance Scenarios**:

1. **Given** um novo usuário com email válido, **When** ele se registra fornecendo email, senha, CNPJ e nome da empresa, **Then** o sistema cria a conta do usuário, cria a empresa vinculada, e envia email de confirmação
2. **Given** um usuário registrado com email confirmado, **When** ele faz login com email e senha corretos, **Then** o sistema retorna um token JWT válido e os dados do usuário
3. **Given** um usuário que esqueceu a senha, **When** ele solicita redefinição de senha com seu email, **Then** o sistema envia um link de redefinição por email
4. **Given** um usuário com token de redefinição válido, **When** ele confirma a nova senha, **Then** o sistema atualiza a senha e permite login com a nova credencial
5. **Given** um usuário não confirmado, **When** ele tenta fazer login, **Then** o sistema bloqueia o acesso e oferece opção de reenviar email de confirmação
6. **Given** um usuário autenticado, **When** seu token JWT expira, **Then** ele pode usar o refresh token para obter um novo token de acesso

---

### User Story 2 - Gerenciamento de Sessões e Dispositivos (Priority: P1)

Empresas precisam controlar quantas sessões simultâneas seus usuários podem ter ativas, e usuários precisam gerenciar sessões em múltiplos dispositivos (navegador web e extensão Chrome).

**Why this priority**: Essencial para controle de licenciamento e segurança. Permite que empresas limitem o uso baseado em seu plano de assinatura.

**Independent Test**: Pode ser testado independentemente através da criação de sessões em diferentes dispositivos, validação de sessões ativas, e revogação de sessões. Entrega valor ao prevenir uso não autorizado e compartilhamento indevido de contas.

**Acceptance Scenarios**:

1. **Given** um usuário autenticado com device_id, **When** ele faz login, **Then** o sistema cria uma sessão vinculada ao dispositivo
2. **Given** uma empresa com limite de 5 sessões simultâneas, **When** um usuário tenta criar a 6ª sessão, **Then** o sistema rejeita e retorna lista de sessões ativas com token de gerenciamento temporário
3. **Given** um usuário com sessões ativas, **When** ele solicita listar suas sessões, **Then** o sistema retorna todas as sessões ativas com informações de dispositivo e última atividade
4. **Given** um usuário com limite de sessões atingido, **When** ele usa o token de gerenciamento para revogar uma sessão específica, **Then** o sistema revoga a sessão e permite criar uma nova
5. **Given** um usuário com sessão ativa, **When** a extensão Chrome e o navegador web compartilham o mesmo device_id, **Then** ambos podem usar a mesma sessão sem contar como sessões separadas
6. **Given** uma sessão ativa, **When** ela expira por inatividade ou prazo, **Then** o sistema invalida a sessão e requer novo login

---

### User Story 3 - Gestão de Assinaturas e Pagamentos (Priority: P1)

Empresas precisam gerenciar assinaturas de produtos com cobrança recorrente através da integração com Asaas, incluindo períodos de teste (trial) e conversão para planos pagos.

**Why this priority**: É o modelo de receita principal do negócio. Sem gestão de assinaturas, o sistema não pode cobrar pelos serviços oferecidos.

**Independent Test**: Pode ser testado através da criação de assinaturas trial, recebimento de webhooks do Asaas, ativação automática, conversão para pago, e cancelamento. Entrega valor ao automatizar completamente o ciclo de cobrança.

**Acceptance Scenarios**:

1. **Given** uma empresa registrada, **When** ela assina um produto com período trial, **Then** o sistema cria assinatura no Asaas com status "inactive" aguardando confirmação de pagamento
2. **Given** uma assinatura trial criada, **When** o Asaas envia webhook PAYMENT_CREATED, **Then** o sistema ativa a assinatura trial e aplica os benefícios do produto à empresa
3. **Given** uma assinatura trial ativa, **When** o período trial termina e o Asaas envia webhook PAYMENT_CONFIRMED com pagamento confirmado, **Then** o sistema converte a assinatura para "active" (paga)
4. **Given** uma assinatura ativa, **When** um pagamento recorrente falha e o Asaas envia webhook PAYMENT_FAILED, **Then** o sistema marca a assinatura como "past_due"
5. **Given** uma assinatura ativa, **When** ela é cancelada no Asaas e o webhook SUBSCRIPTION_DELETED é recebido, **Then** o sistema cancela a assinatura e remove os benefícios da empresa
6. **Given** uma empresa com assinatura ativa, **When** ela solicita cancelamento, **Then** o sistema cancela no Asaas e localmente, mantendo auditoria completa
7. **Given** um administrador, **When** ele consulta pagamentos, **Then** o sistema retorna histórico de pagamentos com valores, datas e status

---

### User Story 4 - Gestão de Produtos e Limites (Priority: P2)

Administradores do sistema precisam criar e gerenciar produtos que definem limites de sessões e recursos que as empresas terão acesso quando assinarem.

**Why this priority**: Necessário para configurar diferentes planos de assinatura (básico, profissional, enterprise), mas pode ser configurado manualmente no início.

**Independent Test**: Pode ser testado através da criação de produtos com diferentes limites, atualização de produtos existentes, e aplicação automática de limites quando empresa assina. Entrega valor ao permitir flexibilidade nos planos oferecidos.

**Acceptance Scenarios**:

1. **Given** um administrador autenticado, **When** ele cria um novo produto especificando nome, categoria, limites de sessões e valor, **Then** o sistema registra o produto disponível para assinatura
2. **Given** um produto existente, **When** administrador atualiza os limites de sessões, **Then** o sistema atualiza o produto e reflete mudanças em novas assinaturas
3. **Given** uma empresa que assina um produto, **When** a assinatura é ativada, **Then** o sistema automaticamente aplica os limites de sessões do produto à empresa
4. **Given** uma empresa com limites aplicados, **When** um usuário tenta exceder o limite de sessões, **Then** o sistema bloqueia baseado nos limites do produto assinado
5. **Given** um administrador, **When** ele lista produtos, **Then** o sistema retorna todos os produtos cadastrados com seus respectivos limites e status

---

### User Story 5 - Administração de Empresas e Usuários (Priority: P2)

Administradores do sistema e gerentes de empresa precisam gerenciar empresas cadastradas, usuários vinculados, e suas permissões de acesso.

**Why this priority**: Importante para operação e suporte, mas empresas podem funcionar com configuração inicial mínima.

**Independent Test**: Pode ser testado através da criação de empresas, vinculação de usuários, atribuição de roles, e consulta de informações. Entrega valor ao permitir controle granular de acesso.

**Acceptance Scenarios**:

1. **Given** um administrador do sistema, **When** ele cria uma nova empresa fornecendo CNPJ, nome e telefone, **Then** o sistema registra a empresa com dados validados
2. **Given** uma empresa existente, **When** administrador atualiza informações da empresa, **Then** o sistema persiste as mudanças e mantém auditoria
3. **Given** uma empresa, **When** um novo usuário é criado e vinculado a ela, **Then** o sistema cria o usuário com role padrão e associação à empresa
4. **Given** um usuário vinculado a uma empresa, **When** administrador atribui ou altera seu role (admin, user, etc), **Then** o sistema atualiza as permissões e aplica restrições de acesso
5. **Given** um administrador, **When** ele lista empresas, **Then** o sistema retorna todas as empresas com informações de assinatura e usuários vinculados
6. **Given** um administrador, **When** ele consulta usuários de uma empresa específica, **Then** o sistema retorna lista com roles e status de cada usuário

---

### User Story 6 - Webhooks e Integrações Asaas (Priority: P3)

O sistema precisa receber e processar webhooks do Asaas para manter sincronização automática de eventos de pagamento e assinatura.

**Why this priority**: Automatiza processos críticos mas pode ser gerenciado manualmente em casos de falha do webhook.

**Independent Test**: Pode ser testado simulando webhooks do Asaas para diferentes eventos e verificando que o sistema processa corretamente cada tipo. Entrega valor ao eliminar necessidade de sincronização manual.

**Acceptance Scenarios**:

1. **Given** o Asaas enviando um webhook, **When** a requisição chega ao endpoint /webhooks/asaas/subscription, **Then** o sistema valida a assinatura usando o token Asaas
2. **Given** um webhook com assinatura inválida, **When** o sistema valida, **Then** rejeita silenciosamente (retorna 200 mas não processa) e registra tentativa de acesso não autorizado
3. **Given** um webhook válido do tipo PAYMENT_CREATED, **When** processado, **Then** o sistema identifica a assinatura e executa lógica de ativação de trial
4. **Given** um webhook válido do tipo PAYMENT_CONFIRMED ou PAYMENT_RECEIVED, **When** processado, **Then** o sistema converte trial para assinatura paga
5. **Given** um webhook válido do tipo PAYMENT_FAILED, **When** processado, **Then** o sistema marca assinatura como inadimplente
6. **Given** qualquer webhook processado, **When** ocorre erro durante processamento, **Then** o sistema registra erro em auditoria mas sempre retorna 200 OK para o Asaas
7. **Given** webhooks recebidos, **When** consultados, **Then** o sistema mantém histórico completo com payload, tipo de evento, status de processamento e erros

---

### Edge Cases

- O que acontece quando uma empresa tenta registrar com CNPJ já existente?
  - Sistema rejeita com erro 409 Conflict e mensagem indicando que CNPJ já está cadastrado

- Como o sistema lida com tentativas de login quando limite de sessões está atingido?
  - Sistema retorna erro 409 com lista de sessões ativas e token de gerenciamento temporário que permite revogar uma sessão existente

- O que ocorre se um webhook do Asaas falhar ao processar?
  - Sistema registra erro em logs e auditoria, mas sempre retorna 200 OK para o Asaas evitar reenvios desnecessários

- Como o sistema trata pagamentos duplicados do Asaas?
  - Usa payment_id como chave de idempotência para prevenir processamento duplicado

- O que acontece quando usuário tenta fazer login com email não confirmado?
  - Sistema retorna erro 403 com opção de reenviar email de confirmação

- Como o sistema gerencia sessões quando device_id é compartilhado entre web e extensão?
  - Ambos clientes compartilham a mesma sessão, contando como apenas uma sessão ativa

- O que ocorre quando token JWT expira durante uso?
  - Cliente deve usar refresh token para obter novo access token sem precisar fazer login novamente

- Como o sistema trata cancelamento de assinatura durante período trial?
  - Cancela imediatamente no Asaas e localmente, removendo benefícios mas mantendo registro histórico

## Requirements

### Functional Requirements

**Autenticação e Autorização:**

- **FR-001**: Sistema MUST permitir registro de novos usuários com email, senha, CNPJ e nome da empresa
- **FR-002**: Sistema MUST validar formato de email e força da senha (mínimo 8 caracteres) durante registro
- **FR-003**: Sistema MUST enviar email de confirmação após registro de novo usuário
- **FR-004**: Sistema MUST permitir login com email e senha para usuários com email confirmado
- **FR-005**: Sistema MUST bloquear login de usuários com email não confirmado e oferecer reenvio de confirmação
- **FR-006**: Sistema MUST gerar tokens JWT para usuários autenticados com informações de usuário e empresa
- **FR-007**: Sistema MUST permitir recuperação de senha através de email com token de redefinição
- **FR-008**: Sistema MUST validar tokens de redefinição de senha e permitir atualização de senha
- **FR-009**: Sistema MUST suportar refresh tokens para renovação de access tokens expirados

**Gerenciamento de Sessões:**

- **FR-010**: Sistema MUST criar sessões vinculadas a dispositivos específicos identificados por device_id
- **FR-011**: Sistema MUST permitir que clientes web e extensão Chrome compartilhem sessão usando mesmo device_id
- **FR-012**: Sistema MUST aplicar limites de sessões simultâneas baseado no plano da empresa
- **FR-013**: Sistema MUST rejeitar criação de novas sessões quando limite é atingido
- **FR-014**: Sistema MUST fornecer token de gerenciamento temporário quando limite de sessões é atingido
- **FR-015**: Sistema MUST permitir listagem de sessões ativas com informações de dispositivo e última atividade
- **FR-016**: Sistema MUST permitir revogação de sessões específicas usando token de gerenciamento
- **FR-017**: Sistema MUST invalidar sessões expiradas automaticamente
- **FR-018**: Sistema MUST rastrear tipo de cliente (web ou extension) para cada sessão

**Assinaturas e Pagamentos:**

- **FR-019**: Sistema MUST permitir criação de assinaturas trial no Asaas com status "inactive"
- **FR-020**: Sistema MUST criar cliente no Asaas usando CNPJ e informações da empresa
- **FR-021**: Sistema MUST ativar assinaturas trial ao receber webhook PAYMENT_CREATED do Asaas
- **FR-022**: Sistema MUST converter assinaturas trial para "active" ao receber webhook PAYMENT_CONFIRMED
- **FR-023**: Sistema MUST marcar assinaturas como "past_due" ao receber webhook PAYMENT_FAILED
- **FR-024**: Sistema MUST cancelar assinaturas ao receber webhook SUBSCRIPTION_DELETED
- **FR-025**: Sistema MUST aplicar benefícios do produto à empresa quando assinatura é ativada
- **FR-026**: Sistema MUST remover benefícios do produto quando assinatura é cancelada
- **FR-027**: Sistema MUST permitir cancelamento manual de assinaturas via API
- **FR-028**: Sistema MUST manter histórico completo de pagamentos com valores, datas e status
- **FR-029**: Sistema MUST usar payment_id como chave de idempotência para prevenir duplicação

**Webhooks Asaas:**

- **FR-030**: Sistema MUST receber webhooks do Asaas no endpoint /webhooks/asaas/subscription
- **FR-031**: Sistema MUST validar assinatura dos webhooks usando header "asaas-access-token"
- **FR-032**: Sistema MUST rejeitar webhooks com assinatura inválida mas retornar 200 OK
- **FR-033**: Sistema MUST processar eventos: PAYMENT_CREATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_FAILED, SUBSCRIPTION_DELETED
- **FR-034**: Sistema MUST registrar todos os webhooks recebidos com payload completo para auditoria
- **FR-035**: Sistema MUST sempre retornar 200 OK aos webhooks do Asaas, independente de sucesso no processamento
- **FR-036**: Sistema MUST registrar erros de processamento de webhook em logs e auditoria

**Produtos e Limites:**

- **FR-037**: Sistema MUST permitir criação de produtos com nome, categoria, limites de sessões e valor
- **FR-038**: Sistema MUST permitir atualização de informações e limites de produtos existentes
- **FR-039**: Sistema MUST aplicar automaticamente limites de produto quando empresa assina
- **FR-040**: Sistema MUST permitir listagem de todos os produtos disponíveis
- **FR-041**: Sistema MUST validar que limites de sessões sejam números positivos

**Empresas e Usuários:**

- **FR-042**: Sistema MUST validar unicidade de CNPJ ao criar ou atualizar empresas
- **FR-043**: Sistema MUST validar formato de CNPJ (14 dígitos) ou CPF (11 dígitos)
- **FR-044**: Sistema MUST permitir criação de empresas com CNPJ, nome e telefone
- **FR-045**: Sistema MUST permitir atualização de informações de empresas existentes
- **FR-046**: Sistema MUST permitir vinculação de múltiplos usuários a uma empresa
- **FR-047**: Sistema MUST suportar roles de usuário (admin, user, etc) com permissões diferenciadas
- **FR-048**: Sistema MUST permitir atribuição e alteração de roles de usuários
- **FR-049**: Sistema MUST permitir listagem de empresas com informações de assinatura
- **FR-050**: Sistema MUST permitir listagem de usuários por empresa com roles e status

**Auditoria e Segurança:**

- **FR-051**: Sistema MUST registrar todos os eventos de autenticação (login, logout, falhas)
- **FR-052**: Sistema MUST registrar mudanças em assinaturas com detalhes antes/depois
- **FR-053**: Sistema MUST registrar tentativas de webhooks não autorizados com IP e detalhes
- **FR-054**: Sistema MUST rastrear última atividade de cada sessão
- **FR-055**: Sistema MUST aplicar rate limiting em endpoints públicos de autenticação
- **FR-056**: Sistema MUST validar tipos de cliente permitidos (web, extension)

### Key Entities

- **User**: Representa um usuário do sistema com email, senha (hash), roles, e vinculação a uma empresa. Atributos incluem id, email, email_confirmed, empresa_id, roles, created_at, updated_at

- **Empresa**: Representa uma empresa/cliente que usa o sistema com informações fiscais e de contato. Atributos incluem id, cnpj (único), nome, telefone, asaas_customer_id, created_at, updated_at

- **UserSession**: Representa uma sessão ativa de usuário em um dispositivo específico. Atributos incluem id, user_id, empresa_id, device_id, device_fingerprint, client_type (web/extension), refresh_token_hash, expires_at, last_activity_at, created_at

- **Subscription**: Representa uma assinatura de produto com cobrança recorrente através do Asaas. Atributos incluem id, empresa_id, produto_id, asaas_subscription_id, status (inactive/trial/active/past_due/canceled), billing_cycle, value, activated_at, canceled_at, created_at, updated_at

- **Produto**: Define um plano/produto que pode ser assinado, com limites e recursos. Atributos incluem id, nome, categoria, session_limits (json com max_sessions e outros limites), value, description, is_active, created_at, updated_at

- **EmpresaSessionLimits**: Limites de sessões aplicados a uma empresa baseado em seus produtos assinados. Atributos incluem empresa_id, max_sessions, produto_id, applied_at

- **Payment**: Registro de pagamentos recebidos através do Asaas. Atributos incluem id, subscription_id, asaas_payment_id, value, payment_date, status, created_at

- **WebhookAsaas**: Auditoria de webhooks recebidos do Asaas com idempotência. Atributos incluem id, payload_json, tipo_evento, payment_id (chave de idempotência), produto_categoria, status_processamento, erro_mensagem, created_at

- **RefreshToken**: Tokens para renovação de access tokens expirados. Atributos incluem id, user_id, empresa_id, token_hash, device_id, expires_at, created_at

- **Auditoria**: Registro de eventos do sistema para compliance e troubleshooting. Atributos incluem id, tabela, registro_id, evento, detalhes (json), user_id, empresa_id, ip_address, created_at

## Success Criteria

### Measurable Outcomes

- **SC-001**: Usuários podem completar registro e login em menos de 3 minutos, incluindo confirmação de email
- **SC-002**: Sistema processa webhooks do Asaas em menos de 2 segundos, garantindo ativação rápida de assinaturas
- **SC-003**: 100% dos webhooks recebidos são registrados para auditoria, independente de sucesso no processamento
- **SC-004**: Zero duplicação de processamento de pagamentos através de idempotência baseada em payment_id
- **SC-005**: Sistema suporta pelo menos 1000 sessões simultâneas sem degradação de performance
- **SC-006**: Tempo de resposta dos endpoints de autenticação abaixo de 500ms em 95% das requisições
- **SC-007**: Sistema previne 100% de tentativas de exceder limite de sessões, bloqueando antes de criar sessão inválida
- **SC-008**: Empresas conseguem gerenciar suas assinaturas (criar, cancelar, consultar) sem intervenção manual em 99% dos casos
- **SC-009**: Todos os eventos de mudança de status de assinatura são auditados com informações completas de antes/depois

### Assumptions

- Sistema usa Supabase como provedor de gerenciamento de usuários e armazenamento de dados
- Integração com Asaas usa API REST para criação de assinaturas e clientes
- Webhooks do Asaas são enviados para endpoint público acessível via internet
- Tokens JWT têm validade configurável (padrão 1 hora para access tokens)
- Refresh tokens têm validade de 7 dias por padrão
- Período trial padrão é configurável por produto
- CNPJ e CPF seguem formato brasileiro (14 e 11 dígitos respectivamente)
- Sistema mantém todas as datas em formato ISO 8601 UTC
- Logs estruturados são enviados para sistema de observabilidade
- Ambiente de produção usa variável BYPASS_WEBHOOK_AUTH=false para segurança

### Dependencies

- Supabase: Gerenciamento de usuários e armazenamento de dados
- Asaas: Gateway de pagamento, gerenciamento de assinaturas, webhooks
- PostgreSQL: Banco de dados principal (através do Supabase)
- SMTP: Envio de emails de confirmação e recuperação de senha
- Serviço de logs/observabilidade: Slack integration para alertas críticos

### Security Considerations

- Senhas são armazenadas usando bcrypt com salt
- Tokens JWT são assinados e verificados em cada requisição
- Webhooks do Asaas são validados via header asaas-access-token
- Tentativas de webhooks não autorizados são logadas com detalhes para análise de segurança
- Rate limiting aplicado em endpoints públicos de autenticação para prevenir brute force
- IP whitelisting pode ser configurado para endpoints administrativos
- Refresh tokens são armazenados como hash no banco de dados
- Sessões expiram automaticamente após período de inatividade
- Sistema registra todas as tentativas de login (sucesso e falha) para auditoria
