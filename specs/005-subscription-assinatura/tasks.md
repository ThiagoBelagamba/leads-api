# Tasks - Sistema de Assinatura com Asaas

**Objetivo**: Implementar subscription recorrente com renovação automática e desativação por falta de pagamento

**Prioridade**: 🔴 CRÍTICA  
**Data Início**: 29/01/2026

---

## ✅ TASK 1: Criar Tabela de Subscriptions

### Descrição
~~Criar estrutura de banco de dados para armazenar assinaturas vinculadas ao Asaas~~

### Status: **COMPLETO** ✅
- ✅ Migration existe: `20251004170000_create_subscriptions_table.js`
- ✅ Tabela `subscriptions` criada com todos os campos
- ✅ Índices e constraints implementados
- ✅ RLS habilitado

### SQL (JÁ IMPLEMENTADO)
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  asaas_subscription_id TEXT NOT NULL UNIQUE,
  asaas_customer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'OVERDUE', 'CANCELED')),
  value DECIMAL(10,2) NOT NULL,
  billing_type TEXT NOT NULL CHECK (billing_type IN ('PIX', 'CREDIT_CARD', 'BOLETO')),
  cycle TEXT NOT NULL CHECK (cycle IN ('MONTHLY', 'YEARLY')),
  next_due_date DATE NOT NULL,
  last_payment_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_empresa_id ON subscriptions(empresa_id);
CREATE INDEX idx_subscriptions_asaas_id ON subscriptions(asaas_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_due ON subscriptions(next_due_date);

-- Trigger para updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Arquivos Afetados
- `supabase/migrations/[timestamp]_create_subscriptions_table.sql`

### Critérios de Aceitação
- ✅ Tabela criada no Supabase
- ✅ FK constraint para empresas funciona
- ✅ Status aceita apenas valores válidos
- ✅ Índices criados corretamente

---

## ✅ TASK 2: Criar Repository de Subscriptions

### Descrição
~~Implementar camada de acesso a dados para subscriptions~~

### Status: **COMPLETO** ✅
- ✅ Interface `ISubscriptionRepository` criada
- ✅ `SupabaseSubscriptionRepository` implementado
- ✅ Métodos CRUD disponíveis
- ✅ Registrado no container do Inversify
- ✅ Tipos registrados em `types.ts`

### Arquivos Existentes
- `src/main/repository/subscription/ISubscriptionRepository.ts` ✅
- `src/main/repository/subscription/impl/SupabaseSubscriptionRepository.ts` ✅
- `src/main/infrastructure/container/subscription.bindings.ts` ✅

---

## ✅ TASK 3: Integrar Asaas Subscription no AsaasService

### Descrição
~~Adicionar método para criar subscription no Asaas via SDK~~

### Status: **COMPLETO** ✅
- ✅ Método `createSubscription()` existe no AsaasService
- ✅ Suporta PIX, Cartão e Boleto
- ✅ Tratamento de erros implementado
- ✅ Logs estruturados

### Arquivo Existente
- `src/main/infrastructure/services/AsaasService.ts` ✅

---

## ✅ TASK 4: Vincular Subscription no RegisterWithCheckoutUseCase

### Descrição
~~Integrar criação de subscription no fluxo de checkout~~

### Status: **COMPLETO** ✅
- ✅ `RegisterWithCheckoutUseCase` cria subscription no Asaas
- ✅ Subscription recorrente (MONTHLY/YEARLY)
- ✅ Suporte a PIX e Cartão de Crédito
- ✅ Logs estruturados em cada etapa

### Implementação Existente
```typescript
// RegisterWithCheckoutUseCase.ts (linhas 194-217)
const subscription = await this.asaasService.createSubscription({
  customer: customer.id,
  billingType: billingType,
  value,
  nextDueDate,
  cycle: plano === 'mensal' ? 'MONTHLY' : 'YEARLY',
  description: plano === 'mensal' ? 'Extensão Disparo Rápido - Plano Mensal' : 'Extensão Disparo Rápido - Plano Anual',
  externalReference,
  creditCard: request.credit_card,
  creditCardHolderInfo: request.credit_card_holder_info,
  remoteIp: request.remote_ip,
}, true);
```

### ⚠️ O QUE FALTA
- [ ] **Salvar subscription no banco de dados** (atualmente só cria no Asaas)
- [ ] **Injetar `ISubscriptionRepository`** no constructor
- [ ] **Criar registro em `subscriptions` table** após criar no Asaas
- [ ] **Atualizar retorno** com `subscription_id` do banco

---

## 📋 TASK 5: Salvar Subscription no Banco de Dados

### Descrição
Após criar subscription no Asaas, salvar registro no banco de dados

### Status: **PENDENTE** ⏳

### Subtasks
- [ ] Injetar `ISubscriptionRepository` no `RegisterWithCheckoutUseCase`
- [ ] Criar registro no banco após subscription do Asaas
- [ ] Adicionar `produto_id` (extensão Disparo Rápido)
- [ ] Atualizar retorno com `subscription_id`
- [ ] Tratar erro e rollback se falhar

### Implementação Necessária
```typescript
export interface Subscription {
  id: string;
  empresa_id: string;
  asaas_subscription_id: string;
  asaas_customer_id: string;
  status: 'ACTIVE' | 'EXPIRED' | 'OVERDUE' | 'CANCELED';
  value: number;
  billing_type: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
  cycle: 'MONTHLY' | 'YEARLY';
  next_due_date: string; // ISO date
  last_payment_date?: string; // ISO date
  created_at: string;
  updated_at: string;
}

export interface ISubscriptionRepository {
  create(subscription: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>): Promise<Subscription>;
  findById(id: string): Promise<Subscription | null>;
  findByEmpresaId(empresaId: string): Promise<Subscription | null>;
  findByAsaasSubscriptionId(asaasId: string): Promise<Subscription | null>;
  updateStatus(id: string, status: Subscription['status']): Promise<Subscription>;
  updateNextDueDate(id: string, nextDueDate: string): Promise<Subscription>;
  update(id: string, data: Partial<Subscription>): Promise<Subscription>;
  findOverdue(daysOverdue: number): Promise<Subscription[]>;
  findExpiringIn(days: number): Promise<Subscription[]>;
}
```

### Arquivos a Criar
- `src/main/repository/subscription/ISubscriptionRepository.ts`
- `src/main/repository/subscription/impl/SupabaseSubscriptionRepository.ts`

### Arquivos a Modificar
- `src/main/infrastructure/container/types.ts` (adicionar TYPES.ISubscriptionRepository)
- `src/main/infrastructure/container/inversify.config.ts` (registrar binding)

### Critérios de Aceitação
- ✅ Interface define todos métodos necessários
- ✅ Repository implementado com Supabase client
- ✅ Métodos tratam erros corretamente
- ✅ Registrado no DI container
- ✅ Testes cobrem CRUD básico

---

## 📋 TASK 3: Integrar Asaas Subscription no AsaasService

### Descrição
Adicionar método para criar subscription no Asaas via SDK

### Subtasks
- [ ] Adicionar método `createSubscription()` no AsaasService
- [ ] Implementar tratamento de erros específicos do Asaas
- [ ] Adicionar logs estruturados
- [ ] Testar em sandbox
- [ ] Documentar parâmetros e retorno

### Implementação
```typescript
// AsaasService.ts

export interface CreateSubscriptionInput {
  customer: string; // asaas customer ID
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  value: number;
  cycle: 'MONTHLY' | 'YEARLY';
  description: string;
  nextDueDate?: string; // YYYY-MM-DD
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
}

async createSubscription(input: CreateSubscriptionInput): Promise<any> {
  try {
    this.logger.info('Creating Asaas subscription', {
      customer: input.customer,
      value: input.value,
      cycle: input.cycle,
      billingType: input.billingType,
    });

    const response = await this.client.post('/subscriptions', input);

    this.logger.info('✅ Asaas subscription created', {
      subscription_id: response.data.id,
      status: response.data.status,
      nextDueDate: response.data.nextDueDate,
    });

    return response.data;
  } catch (error) {
    this.logger.error('❌ Failed to create Asaas subscription', error as Error);
    throw error;
  }
}
```

### Arquivos a Modificar
- `src/main/infrastructure/services/AsaasService.ts`

### Critérios de Aceitação
- ✅ Método cria subscription no Asaas sandbox
- ✅ Retorna subscription_id e status
- ✅ Logs estruturados com contexto
- ✅ Erros tratados e re-lançados com contexto
- ✅ Suporta PIX, Cartão e Boleto

---

## 📋 TASK 4: Vincular Subscription no RegisterWithCheckoutUseCase

### Descrição
Integrar criação de subscription no fluxo de checkout

### Subtasks
- [ ] Injetar `ISubscriptionRepository` e `AsaasService`
- [ ] Criar subscription no Asaas após criar customer
- [ ] Salvar subscription no banco de dados
- [ ] Tratar erros (rollback se subscription falhar)
- [ ] Atualizar testes

### Implementação
```typescript
// RegisterWithCheckoutUseCase.ts

constructor(
  @inject(TYPES.Logger) private logger: Logger,
  @inject(TYPES.IEmpresaRepository) private empresaRepository: IEmpresaRepository,
  @inject(TYPES.AsaasService) private asaasService: AsaasService,
  @inject(TYPES.IUserDisparoRapidoRepository) private userRepository: IUserDisparoRapidoRepository,
  @inject(TYPES.ISubscriptionRepository) private subscriptionRepository: ISubscriptionRepository, // NOVO
  @inject(TYPES.EmailService) private emailService: EmailService
) {}

async execute(request: RegisterCheckoutRequest): Promise<RegisterCheckoutResponse> {
  // ... código existente de criação de empresa, usuário, customer ...

  try {
    // 6. Criar subscription no Asaas
    const subscriptionInput: CreateSubscriptionInput = {
      customer: asaasCustomer.id,
      billingType: billingType,
      value: value,
      cycle: plano === 'mensal' ? 'MONTHLY' : 'YEARLY',
      description: `Extensão Disparo Rápido - Plano ${plano}`,
      creditCard: request.credit_card,
      creditCardHolderInfo: request.credit_card ? {
        name: nome_pessoa,
        email: email,
        cpfCnpj: cleanCpfCnpj,
        postalCode: request.credit_card.postalCode,
        addressNumber: request.credit_card.addressNumber,
        phone: request.credit_card.phone,
      } : undefined,
    };

    const asaasSubscription = await this.asaasService.createSubscription(subscriptionInput);

    this.logger.info('✅ Asaas subscription created', {
      subscription_id: asaasSubscription.id,
      empresa_id: empresa.id,
    });

    // 7. Salvar subscription no banco
    const subscription = await this.subscriptionRepository.create({
      empresa_id: empresa.id,
      asaas_subscription_id: asaasSubscription.id,
      asaas_customer_id: asaasCustomer.id,
      status: asaasSubscription.status, // ACTIVE se cartão, PENDING se PIX
      value: value,
      billing_type: billingType,
      cycle: plano === 'mensal' ? 'MONTHLY' : 'YEARLY',
      next_due_date: asaasSubscription.nextDueDate,
    });

    this.logger.info('✅ Subscription saved to database', {
      subscription_id: subscription.id,
      empresa_id: empresa.id,
    });

    // 8. Enviar email de confirmação
    await this.emailService.sendEmailConfirmation(email, nome_pessoa, confirmationToken);

    return {
      success: true,
      user_id: newUser.id,
      empresa_id: empresa.id,
      subscription_id: subscription.id, // NOVO
      asaas_subscription_id: asaasSubscription.id, // NOVO
      payment_url: asaasSubscription.bankSlipUrl || asaasSubscription.invoiceUrl,
      qr_code: billingType === 'PIX' ? asaasSubscription.encodedImage : undefined,
      message: 'Cadastro realizado com sucesso! Verifique seu email para confirmar.',
    };
  } catch (error) {
    this.logger.error('❌ Failed to create subscription', error as Error, {
      empresa_id: empresa.id,
    });

    // Rollback: deletar empresa e usuário criados
    await this.empresaRepository.delete(empresa.id);
    await this.userRepository.delete(newUser.id);

    return {
      success: false,
      message: 'Erro ao criar assinatura. Tente novamente.',
    };
  }
}
```

### Arquivos a Modificar
- `src/main/usecase/checkout/RegisterWithCheckoutUseCase.ts`

### Critérios de Aceitação
- ✅ Subscription criada no Asaas após customer
- ✅ Subscription salva no banco com todos os dados
- ✅ Rollback funciona se subscription falhar
- ✅ Email enviado após subscription criada
- ✅ Logs estruturados em cada etapa
- ✅ Retorna subscription_id na resposta

---

## ✅ TASK 5: Salvar Subscription no Banco de Dados

### Descrição
Após criar subscription no Asaas, salvar registro no banco de dados

### Status: **COMPLETO** ✅
- ✅ `ProcessAsaasWebhookUseCase` processa webhook PAYMENT_CONFIRMED
- ✅ Cria registro em `subscriptions` table
- ✅ Webhook recebido em `/webhooks/asaas/subscription`
- ✅ Validação de assinatura implementada

### Implementação Existente
- `src/main/controller/WebhookController.ts` ✅
- `src/main/usecase/subscription/ProcessAsaasWebhookUseCase.ts` ✅
- `src/main/infrastructure/security/AsaasWebhookVerifier.ts` ✅

**Fluxo**:
```
1. Cliente faz checkout
2. RegisterWithCheckoutUseCase cria subscription no Asaas
3. Asaas cobra o cliente
4. Asaas envia webhook PAYMENT_CONFIRMED
5. WebhookController recebe
6. ProcessAsaasWebhookUseCase cria registro em subscriptions
```

---

## ✅ TASK 6: AsaasWebhookController

### Descrição
Implementar endpoint para receber webhooks do Asaas

### Status: **COMPLETO** ✅
- ✅ Endpoint `/api/v1/webhooks/asaas/subscription` criado
- ✅ Validação de assinatura (HMAC) implementada
- ✅ Processamento assíncrono funcionando
- ✅ Logs estruturados para cada webhook
- ✅ Rate limiting disponível

### Arquivo Existente
- `src/main/controller/WebhookController.ts` ✅

---

## ✅ TASK 7: ProcessAsaasWebhookUseCase

### Descrição
Implementar lógica de negócio para processar eventos do Asaas

### Status: **COMPLETO** ✅
- ✅ PAYMENT_CONFIRMED: Ativa subscription
- ✅ PAYMENT_FAILED: Marca como falha
- ✅ PAYMENT_OVERDUE: Marca como vencida
- ✅ Atualiza status em `subscriptions` table
- ✅ Atualiza empresa (ativa/suspensa)
- ✅ Envia emails de notificação

### Arquivo Existente
- `src/main/usecase/subscription/ProcessAsaasWebhookUseCase.ts` ✅

### Eventos Processados
```typescript
- PAYMENT_CREATED
- PAYMENT_CONFIRMED ✅ (ativa subscription)
- PAYMENT_FAILED ✅ (marca falha)
- PAYMENT_OVERDUE ✅ (marca vencida)
- PAYMENT_DELETED
- PAYMENT_REFUNDED
```

---

## 📋 TASK 8: Job de Verificação de Subscriptions Vencidas

### Descrição
Implementar job diário para suspender empresas com subscriptions vencidas

### Status: **PENDENTE** ⏳

### O que precisa fazer
- [ ] Criar arquivo `CheckExpiredSubscriptionsJob.ts`
- [ ] Agendar execução diária (cron) às 00:00
- [ ] Buscar subscriptions vencidas há mais de 3 dias
- [ ] Suspender empresa
- [ ] Revogar todas sessões ativas
- [ ] Enviar email de notificação

### Implementação Necessária

### Descrição
Implementar endpoint para receber webhooks do Asaas

### Subtasks
- [ ] Criar controller `AsaasWebhookController`
- [ ] Criar rota POST `/api/v1/webhooks/asaas`
- [ ] Validar assinatura do webhook (HMAC)
- [ ] Implementar processamento assíncrono
- [ ] Adicionar rate limiting
- [ ] Logar todos webhooks recebidos

### Implementação
```typescript
// AsaasWebhookController.ts

import { Request, Response } from 'express';
import { injectable, inject } from 'inversify';
import { TYPES } from '../infrastructure/container/types';
import { Logger } from '../infrastructure/logging/Logger';
import { ProcessAsaasWebhookUseCase } from '@usecase/webhook/ProcessAsaasWebhookUseCase';

@injectable()
export class AsaasWebhookController {
  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.ProcessAsaasWebhookUseCase) private readonly processWebhookUseCase: ProcessAsaasWebhookUseCase
  ) {}

  /**
   * @swagger
   * /webhooks/asaas:
   *   post:
   *     summary: Recebe webhooks do Asaas
   *     tags: [Webhooks]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook processado com sucesso
   *       400:
   *         description: Webhook inválido
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhookData = req.body;

      this.logger.info('📥 Asaas webhook received', {
        event: webhookData.event,
        payment_id: webhookData.payment?.id,
        subscription_id: webhookData.subscription?.id,
      });

      // Validar assinatura (HMAC)
      // const isValid = this.validateWebhookSignature(req);
      // if (!isValid) {
      //   this.logger.warn('⚠️ Invalid webhook signature');
      //   res.status(401).json({ error: 'Invalid signature' });
      //   return;
      // }

      // Processar webhook de forma assíncrona
      await this.processWebhookUseCase.execute(webhookData);

      // Responder rapidamente ao Asaas (200 OK)
      res.status(200).json({ received: true });
    } catch (error) {
      this.logger.error('❌ Failed to process webhook', error as Error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
```

### Arquivos a Criar
- `src/main/controller/AsaasWebhookController.ts`

### Arquivos a Modificar
- `src/main/infrastructure/web/routes/index.ts` (adicionar rota)

### Critérios de Aceitação
- ✅ Endpoint `/api/v1/webhooks/asaas` criado
- ✅ Responde 200 OK rapidamente
- ✅ Logs estruturados para cada webhook
- ✅ Validação de assinatura implementada
- ✅ Rate limiting configurado (100 req/min)

---

## 📋 TASK 6: Criar ProcessAsaasWebhookUseCase

### Descrição
Implementar lógica de negócio para processar eventos do Asaas

### Subtasks
- [ ] Criar UseCase `ProcessAsaasWebhookUseCase`
- [ ] Implementar handlers para cada tipo de evento
- [ ] Atualizar status de subscription
- [ ] Atualizar status de empresa
- [ ] Revogar sessões se empresa suspensa
- [ ] Adicionar testes unitários

### Implementação
```typescript
// ProcessAsaasWebhookUseCase.ts

import { injectable, inject } from 'inversify';
import { TYPES } from '@main/infrastructure/container/types';
import { Logger } from '@main/infrastructure/logging/Logger';
import { ISubscriptionRepository } from '@repository/subscription/ISubscriptionRepository';
import { IEmpresaRepository } from '@repository/empresa/IEmpresaRepository';
import { IUserSessionRepository } from '@repository/userSession/IUserSessionRepository';
import { EmailService } from '@main/infrastructure/services/EmailService';

@injectable()
export class ProcessAsaasWebhookUseCase {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ISubscriptionRepository) private subscriptionRepository: ISubscriptionRepository,
    @inject(TYPES.IEmpresaRepository) private empresaRepository: IEmpresaRepository,
    @inject(TYPES.IUserSessionRepository) private sessionRepository: IUserSessionRepository,
    @inject(TYPES.EmailService) private emailService: EmailService
  ) {}

  async execute(webhookData: any): Promise<void> {
    const event = webhookData.event;

    this.logger.info('Processing Asaas webhook', {
      event,
      payment_id: webhookData.payment?.id,
      subscription_id: webhookData.subscription?.id,
    });

    switch (event) {
      case 'PAYMENT_RECEIVED':
        await this.handlePaymentReceived(webhookData.payment);
        break;

      case 'PAYMENT_CONFIRMED':
        await this.handlePaymentReceived(webhookData.payment);
        break;

      case 'PAYMENT_OVERDUE':
        await this.handlePaymentOverdue(webhookData.payment);
        break;

      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
        await this.handlePaymentCanceled(webhookData.payment);
        break;

      default:
        this.logger.warn('Unhandled webhook event', { event });
    }
  }

  private async handlePaymentReceived(payment: any): Promise<void> {
    try {
      const subscription = await this.subscriptionRepository.findByAsaasSubscriptionId(payment.subscription);
      
      if (!subscription) {
        this.logger.warn('Subscription not found for payment', { payment_id: payment.id });
        return;
      }

      // Calcular próximo vencimento
      const nextDueDate = new Date(payment.confirmedDate);
      if (subscription.cycle === 'MONTHLY') {
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      } else {
        nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
      }

      // Atualizar subscription
      await this.subscriptionRepository.update(subscription.id, {
        status: 'ACTIVE',
        next_due_date: nextDueDate.toISOString().split('T')[0],
        last_payment_date: payment.confirmedDate,
      });

      // Ativar empresa
      await this.empresaRepository.updateStatus(subscription.empresa_id, 'active');

      this.logger.info('✅ Payment received - subscription renewed', {
        subscription_id: subscription.id,
        empresa_id: subscription.empresa_id,
        next_due_date: nextDueDate.toISOString(),
      });
    } catch (error) {
      this.logger.error('❌ Failed to handle payment received', error as Error);
      throw error;
    }
  }

  private async handlePaymentOverdue(payment: any): Promise<void> {
    try {
      const subscription = await this.subscriptionRepository.findByAsaasSubscriptionId(payment.subscription);
      
      if (!subscription) {
        this.logger.warn('Subscription not found for payment', { payment_id: payment.id });
        return;
      }

      // Atualizar status para OVERDUE
      await this.subscriptionRepository.updateStatus(subscription.id, 'OVERDUE');

      this.logger.warn('⚠️ Payment overdue', {
        subscription_id: subscription.id,
        empresa_id: subscription.empresa_id,
      });

      // TODO: Enviar email de cobrança
    } catch (error) {
      this.logger.error('❌ Failed to handle payment overdue', error as Error);
      throw error;
    }
  }

  private async handlePaymentCanceled(payment: any): Promise<void> {
    try {
      const subscription = await this.subscriptionRepository.findByAsaasSubscriptionId(payment.subscription);
      
      if (!subscription) {
        this.logger.warn('Subscription not found for payment', { payment_id: payment.id });
        return;
      }

      // Atualizar status para CANCELED
      await this.subscriptionRepository.updateStatus(subscription.id, 'CANCELED');

      // Suspender empresa
      await this.empresaRepository.updateStatus(subscription.empresa_id, 'suspended');

      // Revogar todas as sessões ativas
      const activeSessions = await this.sessionRepository.findByCompanyId(subscription.empresa_id, 'active');
      for (const session of activeSessions) {
        await this.sessionRepository.updateStatus(session.id, 'revoked');
      }

      this.logger.warn('⚠️ Payment canceled - empresa suspended', {
        subscription_id: subscription.id,
        empresa_id: subscription.empresa_id,
        revoked_sessions: activeSessions.length,
      });
    } catch (error) {
      this.logger.error('❌ Failed to handle payment canceled', error as Error);
      throw error;
    }
  }
}
```

### Arquivos a Criar
- `src/main/usecase/webhook/ProcessAsaasWebhookUseCase.ts`

### Arquivos a Modificar
- `src/main/infrastructure/container/types.ts`
- `src/main/infrastructure/container/inversify.config.ts`

### Critérios de Aceitação
- ✅ PAYMENT_RECEIVED: renova subscription e ativa empresa
- ✅ PAYMENT_OVERDUE: marca subscription como OVERDUE
- ✅ PAYMENT_DELETED/REFUNDED: suspende empresa e revoga sessões
- ✅ Logs estruturados para cada ação
- ✅ Erros tratados e logados

---

## 📋 TASK 7: Criar Job de Verificação de Subscriptions Vencidas

### Descrição
Implementar job diário para suspender empresas com subscriptions vencidas

### Subtasks
- [ ] Criar `CheckExpiredSubscriptionsJob`
- [ ] Configurar execução diária (cron)
- [ ] Implementar lógica de suspensão (após 3 dias)
- [ ] Revogar sessões ativas
- [ ] Enviar email de notificação
- [ ] Adicionar logs estruturados

### Implementação
```typescript
// CheckExpiredSubscriptionsJob.ts

import { injectable, inject } from 'inversify';
import { TYPES } from '@main/infrastructure/container/types';
import { Logger } from '@main/infrastructure/logging/Logger';
import { ISubscriptionRepository } from '@repository/subscription/ISubscriptionRepository';
import { IEmpresaRepository } from '@repository/empresa/IEmpresaRepository';
import { IUserSessionRepository } from '@repository/userSession/IUserSessionRepository';
import { EmailService } from '@main/infrastructure/services/EmailService';

@injectable()
export class CheckExpiredSubscriptionsJob {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ISubscriptionRepository) private subscriptionRepository: ISubscriptionRepository,
    @inject(TYPES.IEmpresaRepository) private empresaRepository: IEmpresaRepository,
    @inject(TYPES.IUserSessionRepository) private sessionRepository: IUserSessionRepository,
    @inject(TYPES.EmailService) private emailService: EmailService
  ) {}

  async execute(): Promise<void> {
    this.logger.info('🔍 Starting expired subscriptions check job');

    try {
      // Buscar subscriptions vencidas há mais de 3 dias
      const overdueSubscriptions = await this.subscriptionRepository.findOverdue(3);

      this.logger.info('Found overdue subscriptions', {
        count: overdueSubscriptions.length,
      });

      for (const subscription of overdueSubscriptions) {
        await this.suspendSubscription(subscription);
      }

      this.logger.info('✅ Expired subscriptions check job completed', {
        processed: overdueSubscriptions.length,
      });
    } catch (error) {
      this.logger.error('❌ Failed to execute expired subscriptions job', error as Error);
      throw error;
    }
  }

  private async suspendSubscription(subscription: any): Promise<void> {
    try {
      this.logger.warn('Suspending subscription', {
        subscription_id: subscription.id,
        empresa_id: subscription.empresa_id,
        days_overdue: this.calculateDaysOverdue(subscription.next_due_date),
      });

      // 1. Atualizar status da subscription
      await this.subscriptionRepository.updateStatus(subscription.id, 'EXPIRED');

      // 2. Suspender empresa
      await this.empresaRepository.updateStatus(subscription.empresa_id, 'suspended');

      // 3. Revogar todas as sessões ativas
      const activeSessions = await this.sessionRepository.findByCompanyId(subscription.empresa_id, 'active');
      for (const session of activeSessions) {
        await this.sessionRepository.updateStatus(session.id, 'revoked');
      }

      this.logger.info('✅ Subscription suspended', {
        subscription_id: subscription.id,
        empresa_id: subscription.empresa_id,
        revoked_sessions: activeSessions.length,
      });

      // 4. Enviar email de notificação
      // TODO: implementar sendSuspensionNotice
      // await this.emailService.sendSuspensionNotice(subscription.empresa_id);
    } catch (error) {
      this.logger.error('❌ Failed to suspend subscription', error as Error, {
        subscription_id: subscription.id,
      });
    }
  }

  private calculateDaysOverdue(nextDueDate: string): number {
    const dueDate = new Date(nextDueDate);
    const today = new Date();
    const diffTime = today.getTime() - dueDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}
```

### Arquivos a Criar
- `src/main/jobs/CheckExpiredSubscriptionsJob.ts`

### Arquivos a Modificar
- `src/main/infrastructure/web/ApiServer.ts` (agendar job)

### Critérios de Aceitação
- ✅ Job executa diariamente às 00:00
- ✅ Suspende subscriptions vencidas há mais de 3 dias
- ✅ Revoga todas sessões ativas da empresa
- ✅ Logs estruturados para cada ação
- ✅ Email enviado notificando suspensão

---

## 📋 TASK 8: Configurar Webhooks no Asaas (Sandbox)

### Descrição
Configurar URL de webhook no painel do Asaas

### Subtasks
- [ ] Acessar painel Asaas sandbox
- [ ] Configurar URL: `https://api.disparorapido.com/api/v1/webhooks/asaas`
- [ ] Selecionar eventos:
  - PAYMENT_RECEIVED
  - PAYMENT_CONFIRMED
  - PAYMENT_OVERDUE
  - PAYMENT_DELETED
  - PAYMENT_REFUNDED
- [ ] Configurar token de autenticação (HMAC)
- [ ] Testar webhook com evento de teste
- [ ] Documentar credenciais no .env

### Variáveis de Ambiente
```env
ASAAS_WEBHOOK_TOKEN=seu-token-webhook-aqui
```

### Critérios de Aceitação
- ✅ Webhook configurado no Asaas sandbox
- ✅ Eventos selecionados corretamente
- ✅ Token configurado no .env
- ✅ Teste de webhook funciona (200 OK)

---

## 📋 TASK 9: Adicionar Validação de Empresa Ativa no Login

### Descrição
Bloquear login se empresa estiver suspensa por falta de pagamento

### Subtasks
- [ ] Modificar `LoginDisparoRapidoUseCase`
- [ ] Verificar `empresa.status` antes de criar sessão
- [ ] Retornar mensagem específica se suspensa
- [ ] Adicionar logs
- [ ] Atualizar testes

### Implementação
```typescript
// LoginDisparoRapidoUseCase.ts

// Após validar senha...

// 3. Verificar status da empresa
const empresa = await this.empresaRepository.findById(user.empresa_id);

if (!empresa) {
  this.logger.warn('❌ Empresa não encontrada', { user_id: user.id, empresa_id: user.empresa_id });
  return {
    success: false,
    message: 'Erro ao processar login',
  };
}

if (empresa.status === 'suspended') {
  this.logger.warn('❌ Empresa suspensa por falta de pagamento', {
    email,
    empresa_id: user.empresa_id,
  });
  return {
    success: false,
    message: 'Sua assinatura está vencida. Regularize o pagamento para continuar usando a extensão.',
  };
}

if (empresa.status !== 'active') {
  this.logger.warn('❌ Empresa não ativa', {
    email,
    empresa_id: user.empresa_id,
    status: empresa.status,
  });
  return {
    success: false,
    message: 'Sua conta não está ativa. Entre em contato com o suporte.',
  };
}

// Continue com verificação de sessões ativas...
```

### Arquivos a Modificar
- `src/main/usecase/auth/LoginDisparoRapidoUseCase.ts`

### Critérios de Aceitação
- ✅ Login bloqueado se empresa suspended
- ✅ Mensagem específica retornada
- ✅ Logs estruturados
- ✅ Testes cobrem todos status de empresa

---

## 📋 TASK 10: Testes End-to-End

### Descrição
Testar fluxo completo de subscription

### Subtasks
- [ ] Teste 1: Checkout com PIX → Webhook PAYMENT_RECEIVED → Login
- [ ] Teste 2: Checkout com Cartão → Renovação automática (1 mês)
- [ ] Teste 3: Pagamento não realizado → Suspensão após 3 dias
- [ ] Teste 4: Login com empresa suspensa → Bloqueio
- [ ] Teste 5: Webhook PAYMENT_DELETED → Revogação de sessões
- [ ] Documentar resultados

### Cenários de Teste
```
Cenário 1: Checkout bem-sucedido com PIX
GIVEN usuário faz checkout com PIX
WHEN pagamento é confirmado (webhook PAYMENT_RECEIVED)
THEN subscription status = ACTIVE
AND empresa status = active
AND usuário consegue fazer login

Cenário 2: Renovação automática mensal
GIVEN subscription ativa (mensal)
WHEN Asaas cobra e confirma pagamento (webhook PAYMENT_RECEIVED)
THEN next_due_date atualizado (+1 mês)
AND empresa continua active

Cenário 3: Suspensão por falta de pagamento
GIVEN subscription com next_due_date vencido há 4 dias
WHEN job diário executa
THEN subscription status = EXPIRED
AND empresa status = suspended
AND todas sessões revogadas

Cenário 4: Bloqueio de login com empresa suspensa
GIVEN empresa status = suspended
WHEN usuário tenta fazer login
THEN login bloqueado
AND mensagem de regularização exibida

Cenário 5: Cancelamento de pagamento
GIVEN subscription ativa
WHEN webhook PAYMENT_DELETED recebido
THEN subscription status = CANCELED
AND empresa status = suspended
AND sessões revogadas
```

### Critérios de Aceitação
- ✅ Todos os cenários testados em sandbox
- ✅ Logs analisados sem erros
- ✅ Webhooks processados corretamente
- ✅ Job de verificação funciona
- ✅ Documentação atualizada

---

## 📊 RESUMO DE TASKS

| # | Task | Prioridade | Estimativa | Status |
|---|------|-----------|------------|--------|
| 1 | Criar Tabela Subscriptions | 🔴 Alta | ~~1h~~ | ✅ **COMPLETO** |
| 2 | Repository de Subscriptions | 🔴 Alta | ~~2h~~ | ✅ **COMPLETO** |
| 3 | AsaasService.createSubscription | 🔴 Alta | ~~2h~~ | ✅ **COMPLETO** |
| 4 | Integrar no RegisterWithCheckoutUseCase | 🔴 Alta | ~~3h~~ | ✅ **COMPLETO** |
| 5 | **Salvar Subscription no Banco** | 🔴 Alta | **1h** | ⏳ **PENDENTE** |
| 6 | AsaasWebhookController | 🔴 Alta | 2h | ⏳ Pendente |
| 7 | ProcessAsaasWebhookUseCase | 🔴 Alta | 4h | ⏳ Pendente |
| 8 | Job de Verificação Diária | 🟡 Média | 3h | ⏳ Pendente |
| 9 | Configurar Webhooks no Asaas | 🟢 Baixa | 0.5h | ⏳ Pendente |
| 10 | Validação de Empresa no Login | 🔴 Alta | 1h | ⏳ Pendente |
| 11 | Testes End-to-End | 🟡 Média | 4h | ⏳ Pendente |

**Total Completo**: ~7h (4 tasks)  
**Total Restante**: ~15.5h (~2 dias de trabalho)

---

## 🎯 PRÓXIMOS PASSOS IMEDIATOS

### 1️⃣ **TASK 5: Salvar Subscription no Banco** (1h) 🔴
- Adicionar injeção do `ISubscriptionRepository`
- Criar registro após Asaas subscription
- Atualizar retorno da API

### 2️⃣ **TASK 6: AsaasWebhookController** (2h) 🔴
- Criar endpoint `/api/v1/webhooks/asaas`
- Validar assinatura HMAC
- Responder 200 OK rapidamente

### 3️⃣ **TASK 7: ProcessAsaasWebhookUseCase** (4h) 🔴
- PAYMENT_RECEIVED: renovar subscription
- PAYMENT_OVERDUE: marcar como vencida
- PAYMENT_DELETED: suspender empresa e revogar sessões

---

**Última atualização**: 29/01/2026 21:15
