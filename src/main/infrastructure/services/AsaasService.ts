/**
 * AsaasService - Integration with Asaas Payment Gateway API
 * Purpose: Handle all Asaas API communication for subscriptions, customers, and webhooks
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import dotenv from 'dotenv';
import { inject, injectable } from 'inversify';
import { Logger } from '../logging/Logger';
import { TYPES } from '../container/types';

export interface AsaasCreateSubscriptionPayload {
  customer: string;
  billingType: string;
  value: number;
  nextDueDate: string;
  cycle: string;
  description?: string;
}

export interface AsaasSubscriptionResponse {
  id: string;
  customer: string;
  value: number;
  billingType: string;
  cycle: string;
  nextDueDate: string;
  status: string;
}

export interface AsaasCreateCustomerPayload {
  name: string;
  email?: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  /** Código IBGE da cidade (ex: 4205407). */
  city?: number;
  externalReference?: string;
}

export interface AsaasCustomerResponse {
  id: string;
  name: string;
  email?: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  externalReference?: string;
}

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  environment: 'production' | 'sandbox';
  splitEnabled: boolean;
  splitWalletId?: string;
  splitPercentual?: number;
}

export interface AsaasInvoice {
  id: string;
  status: string;
  customer: string;
  payment?: string;
  installment?: string | null;
  type?: string;
  serviceDescription?: string;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  number?: string | null;
  value?: number | null;
}

export interface AsaasPaymentResponse {
  id: string;
  dateCreated: string;
  customer: string;
  subscription?: string;
  installment?: string;
  dueDate: string;
  value: number;
  netValue: number;
  billingType: string;
  status: string;
  description?: string;
  externalReference?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeUrl?: string;
  pixCopyPasteCode?: string;
}

export interface AsaasCreatePaymentPayload {
  customer: string;
  billingType: string;
  value: number;
  dueDate?: string;
  description?: string;
  externalReference?: string;
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
    addressComplement?: string;
    phone: string;
  };
  remoteIp?: string;

  // Split payment (optional)
  split?: Array<{
    walletId: string;
    fixedValue?: number;
    percentualValue?: number;
    totalFixedValue?: number;
  }>;
}

export interface AsaasWebhookEvent {
  event: string;
  payment?: AsaasPaymentResponse;
  subscription?: AsaasSubscriptionResponse;
}

export interface AsaasCreateCheckoutPayload {
  name: string;
  externalReference?: string;
  billingTypes: ('BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED')[];
  chargeTypes: ('DETACHED' | 'RECURRENT' | 'INSTALLMENT')[];
  subscriptionCycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  subscriptionTrialDays?: number;
  description?: string;
  items: Array<{
    name: string;
    value: number;
    quantity: number;
    description?: string;
  }>;
  callback: {
    successUrl: string;
    autoRedirect?: boolean;
    cancelUrl?: string;
  };
  expirationDate?: string;
}

export interface AsaasCheckoutResponse {
  id: string;
  name: string;
  value: number;
  url: string;
  externalReference?: string;
  billingTypes: string[];
  chargeTypes: string[];
  subscriptionCycle?: string;
  subscriptionTrialDays?: number;
  deleted: boolean;
}

@injectable()
export class AsaasService {
  private client: AxiosInstance;
  private config: AsaasConfig;
  private logger: Logger;

  constructor(@inject(TYPES.Logger) logger: Logger) {
    dotenv.config({ override: true });
    this.logger = logger;
    const environment = (process.env.ASAAS_ENVIRONMENT as 'production' | 'sandbox') || 'sandbox';
    const envBaseUrl = process.env.ASAAS_API_URL || process.env.ASAAS_BASE_URL;
    const rawApiKey = process.env.ASAAS_API_KEY || process.env.ASAAS_ACCESS_TOKEN || '';
    const apiKey = String(rawApiKey).trim().replace(/^['"]|['"]$/g, '');
    const defaultBaseUrl = environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3';
    // Load config from environment variables; fallback to default Asaas URL to avoid "Invalid URL" when env is unset
    this.config = {
      apiKey,
      baseUrl: (envBaseUrl && envBaseUrl.trim()) ? envBaseUrl.trim() : defaultBaseUrl,
      environment,
      splitEnabled: process.env.ASAAS_SPLIT_ENABLED === 'true',
      splitWalletId: process.env.ASAAS_SPLIT_WALLET_ID,
      splitPercentual: process.env.ASAAS_SPLIT_PERCENTUAL ? parseFloat(process.env.ASAAS_SPLIT_PERCENTUAL) : undefined,
    };

    // Log de inicialização para debug (sem expor a API key completa)
    const apiKeyPrefix = this.config.apiKey ? this.config.apiKey.substring(0, 20) + '...' : 'NOT SET';
    console.log(`[Asaas] Initializing with:`, {
      baseUrl: this.config.baseUrl,
      environment: this.config.environment,
      apiKeyPrefix,
      apiKeyLength: this.config.apiKey?.length || 0,
      splitEnabled: this.config.splitEnabled,
      splitWalletId: this.config.splitWalletId ? this.config.splitWalletId.substring(0, 10) + '...' : 'NOT SET',
      splitPercentual: this.config.splitPercentual,
    });

    if (!this.config.apiKey) {
      console.error('[Asaas] WARNING: ASAAS_API_KEY is not set!');
    }

    if (!this.config.baseUrl) {
      console.error('[Asaas] WARNING: ASAAS_API_URL or ASAAS_BASE_URL is not set!');
    }

    if (this.config.splitEnabled && !this.config.splitWalletId) {
      console.error('[Asaas] WARNING: ASAAS_SPLIT_ENABLED is true but ASAAS_SPLIT_WALLET_ID is not set!');
    }

    // Initialize Axios client
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        access_token: this.config.apiKey,
      },
      timeout: 30000, // 30 seconds
    });

    // Add request/response interceptors for logging
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - adiciona timestamp para medir duração
    this.client.interceptors.request.use(
      config => {
        (config as any).metadata = { startTime: Date.now() };
        console.log(`[Asaas] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      error => {
        console.error('[Asaas] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor - log de performance
    this.client.interceptors.response.use(
      response => {
        const startTime = (response.config as any).metadata?.startTime;
        const durationMs = startTime ? Date.now() - startTime : undefined;

        console.log(`[Asaas] Response ${response.status} from ${response.config.url} (${durationMs}ms)`);

        // ⚠️ USAGE: Request lento ao gateway de pagamento (> 3s)
        if (durationMs && durationMs > 3000) {
          this.logger.warn('⚠️ Asaas API slow response', {
            category: 'usage',
            component: 'externalservice',
            service: 'asaas',
            durationMs,
            endpoint: response.config.url,
            method: response.config.method?.toUpperCase(),
            threshold: 3000,
          });
        }

        return response;
      },
      (error: AxiosError) => {
        const startTime = (error.config as any)?.metadata?.startTime;
        const durationMs = startTime ? Date.now() - startTime : undefined;

        console.error('[Asaas] Response error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
          method: error.config?.method,
          message: error.message,
          durationMs,
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: AxiosError): Error {
    if (error.response) {
      const data = error.response.data as any;
      const status = error.response.status;

      // Log completo para debug em produção
      console.error(
        '[Asaas] Full error details:',
        JSON.stringify({
          status,
          data,
          url: error.config?.url,
          baseURL: error.config?.baseURL,
        })
      );

      // Mensagens específicas por status HTTP
      if (status === 401) {
        // 🚨 CRITICAL: API Key do gateway de pagamento inválida
        this.logger.error('🚨 Asaas API Key inválida - pagamentos bloqueados', undefined, {
          component: 'security',
          severity: 'critical',
          service: 'asaas',
          statusCode: status,
        });
        return new Error('Asaas API Error: API Key inválida ou não autorizada');
      }
      if (status === 403) {
        return new Error('Asaas API Error: Acesso negado - verifique permissões da API Key');
      }
      if (status === 404) {
        return new Error(`Asaas API Error: Recurso não encontrado - ${error.config?.url}`);
      }

      const message = data?.errors?.[0]?.description || data?.message || `Erro HTTP ${status}`;
      return new Error(`Asaas API Error: ${message}`);
    }

    if (error.request) {
      // 🚨 CRITICAL: Gateway de pagamento não responde
      this.logger.error('🚨 Asaas API não respondeu - timeout', undefined, {
        component: 'externalservice',
        severity: 'critical',
        service: 'asaas',
        errorCode: error.code,
        url: error.config?.url,
      });
      console.error('[Asaas] No response received:', {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        timeout: error.config?.timeout,
        code: error.code,
      });
      return new Error(`Asaas API não respondeu (${error.code || 'timeout'}). Verifique sua conexão.`);
    }

    return new Error(`Erro ao comunicar com Asaas: ${error.message}`);
  }

  /**
   * Build split configuration for payments/subscriptions
   * @private
   */
  private buildSplit(): Array<{ walletId: string; percentualValue: number }> | undefined {
    if (!this.config.splitEnabled) {
      return undefined;
    }

    if (!this.config.splitWalletId || !this.config.splitPercentual) {
      console.warn('[Asaas] Split enabled but walletId or percentual not configured. Skipping split.');
      return undefined;
    }

    return [
      {
        walletId: this.config.splitWalletId,
        percentualValue: this.config.splitPercentual,
      },
    ];
  }

  /**
   * Customer Management
   */

  async createCustomer(payload: AsaasCreateCustomerPayload): Promise<AsaasCustomerResponse> {
    const response = await this.client.post<AsaasCustomerResponse>('/customers', payload);
    return response.data;
  }

  async getCustomer(customerId: string): Promise<AsaasCustomerResponse> {
    const response = await this.client.get<AsaasCustomerResponse>(`/customers/${customerId}`);
    return response.data;
  }

  async listCustomers(filters?: {
    name?: string;
    email?: string;
    cpfCnpj?: string;
    externalReference?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ data: AsaasCustomerResponse[]; hasMore: boolean; totalCount: number }> {
    const response = await this.client.get('/customers', { params: filters });
    return response.data;
  }

  async findCustomerByExternalReference(externalReference: string): Promise<AsaasCustomerResponse | null> {
    const result = await this.listCustomers({ externalReference, limit: 1 });
    return result.data.length > 0 ? result.data[0] : null;
  }

  async findCustomerByEmail(email: string): Promise<AsaasCustomerResponse | null> {
    const result = await this.listCustomers({ email, limit: 1 });
    return result.data.length > 0 ? result.data[0] : null;
  }

  async findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomerResponse | null> {
    const result = await this.listCustomers({ cpfCnpj, limit: 1 });
    return result.data.length > 0 ? result.data[0] : null;
  }

  async updateCustomer(
    customerId: string,
    payload: Partial<AsaasCreateCustomerPayload>
  ): Promise<AsaasCustomerResponse> {
    const response = await this.client.put<AsaasCustomerResponse>(`/customers/${customerId}`, payload);
    return response.data;
  }

  async deleteCustomer(customerId: string): Promise<void> {
    await this.client.delete(`/customers/${customerId}`);
  }

  /**
   * Tokeniza cartão de crédito (checkout transparente).
   * POST /creditCard/tokenizeCreditCard
   * O Asaas exige o ID do cliente (customer) na requisição.
   * Retorna o token para uso em assinaturas/cobranças.
   */
  async tokenizeCreditCard(payload: {
    customer: string;
    creditCard: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
    remoteIp?: string;
  }): Promise<{ creditCardToken: string }> {
    const response = await this.client.post<{ creditCardToken: string }>(
      '/creditCard/tokenizeCreditCard',
      payload
    );
    return response.data;
  }

  /**
   * Subscription Management
   */

  async createSubscription(payload: AsaasCreateSubscriptionPayload, disableSplit = false): Promise<AsaasSubscriptionResponse> {
    // Add split configuration if enabled (unless disabled)
    const split = !disableSplit ? this.buildSplit() : null;
    const payloadWithSplit = split ? { ...payload, split } : payload;

    console.log('[Asaas] Creating subscription with payload:', {
      ...payloadWithSplit,
      split: split ? 'ENABLED' : 'DISABLED',
    });

    const response = await this.client.post<AsaasSubscriptionResponse>('/subscriptions', payloadWithSplit);
    return response.data;
  }

  async getSubscription(subscriptionId: string): Promise<AsaasSubscriptionResponse> {
    const response = await this.client.get<AsaasSubscriptionResponse>(`/subscriptions/${subscriptionId}`);
    return response.data;
  }

  async updateSubscription(
    subscriptionId: string,
    payload: Partial<AsaasCreateSubscriptionPayload>
  ): Promise<AsaasSubscriptionResponse> {
    const response = await this.client.put<AsaasSubscriptionResponse>(`/subscriptions/${subscriptionId}`, payload);
    return response.data;
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.client.delete(`/subscriptions/${subscriptionId}`);
  }

  /**
   * Atualiza o cartão de crédito da assinatura no Asaas (PUT /subscriptions/{id}/creditCard).
   * Atualiza também as cobranças pendentes vinculadas.
   * Usa URL absoluta para evitar "Invalid URL" quando baseURL não é resolvida corretamente.
   */
  async updateSubscriptionCreditCard(
    asaasSubscriptionId: string,
    payload: {
      creditCard: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
      creditCardHolderInfo: {
        name: string;
        email: string;
        cpfCnpj: string;
        postalCode: string;
        addressNumber: string;
        addressComplement?: string;
        phone: string;
      };
      remoteIp?: string;
    }
  ): Promise<AsaasSubscriptionResponse> {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const path = `/subscriptions/${encodeURIComponent(asaasSubscriptionId)}/creditCard`;
    const absoluteUrl = path.startsWith('http') ? path : `${base}${path}`;
    const response = await this.client.put<AsaasSubscriptionResponse>(absoluteUrl, payload);
    return response.data;
  }

  async listSubscriptions(filters?: {
    customer?: string;
    status?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ data: AsaasSubscriptionResponse[]; hasMore: boolean; totalCount: number }> {
    const response = await this.client.get('/subscriptions', { params: filters });
    return response.data;
  }

  /**
   * Payment Management
   */

  async createPayment(payload: AsaasCreatePaymentPayload, enableSplit: boolean = false): Promise<AsaasPaymentResponse> {
    // Add split configuration if enabled (optional flag)
    const split = enableSplit ? this.buildSplit() : undefined;
    const payloadWithSplit = split ? { ...payload, split } : payload;

    console.log('[Asaas] Creating payment with payload:', {
      ...payloadWithSplit,
      split: split ? 'ENABLED' : 'DISABLED',
    });

    const response = await this.client.post<AsaasPaymentResponse>('/payments', payloadWithSplit);
    return response.data;
  }

  async getPayment(paymentId: string): Promise<AsaasPaymentResponse> {
    const response = await this.client.get<AsaasPaymentResponse>(`/payments/${paymentId}`);
    return response.data;
  }

  /**
   * Obtém QR Code PIX e código copia e cola para um pagamento.
   * GET /payments/{id}/pixQrCode - o objeto payment de listPayments/getPayment não traz esses dados.
   * Asaas pode retornar camelCase ou snake_case.
   */
  async getPixQrCode(paymentId: string): Promise<{ encodedImage: string; payload: string; expirationDate?: string }> {
    const response = await this.client.get<Record<string, unknown>>(`/payments/${paymentId}/pixQrCode`);
    const d = response.data as Record<string, unknown>;
    const encodedImage = (d.encodedImage ?? d.encoded_image) as string | undefined;
    const payload = (d.payload as string) ?? '';
    return {
      encodedImage: encodedImage ?? '',
      payload,
      expirationDate: (d.expirationDate ?? d.expiration_date) as string | undefined,
    };
  }

  async listPayments(filters?: {
    customer?: string;
    subscription?: string;
    status?: string;
    dateCreated_ge?: string; // YYYY-MM-DD
    dateCreated_le?: string; // YYYY-MM-DD
    offset?: number;
    limit?: number;
  }): Promise<{ data: AsaasPaymentResponse[]; hasMore: boolean; totalCount: number }> {
    const response = await this.client.get('/payments', { params: filters });
    return response.data;
  }

  /**
   * Listar cobranças de uma assinatura específica usando o endpoint oficial:
   * GET /subscriptions/{id}/payments
   */
  async listSubscriptionPayments(
    subscriptionId: string,
    filters?: {
      status?: string;
      offset?: number;
      limit?: number;
    }
  ): Promise<{ data: AsaasPaymentResponse[]; hasMore: boolean; totalCount: number }> {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const path = `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`;
    const absoluteUrl = `${base}${path}`;
    const response = await this.client.get<{ data: AsaasPaymentResponse[]; hasMore: boolean; totalCount: number }>(
      absoluteUrl,
      { params: filters }
    );
    return response.data;
  }

  async deletePayment(paymentId: string): Promise<void> {
    await this.client.delete(`/payments/${paymentId}`);
  }

  /**
   * Cancel all pending payments for a subscription
   * Used when canceling a subscription to ensure no pending charges remain
   */
  async cancelPendingPaymentsForSubscription(subscriptionId: string): Promise<{
    canceledCount: number;
    failedCount: number;
    errors: Array<{ paymentId: string; error: string }>;
  }> {
    const result = {
      canceledCount: 0,
      failedCount: 0,
      errors: [] as Array<{ paymentId: string; error: string }>,
    };

    try {
      // Get all pending/overdue payments for this subscription
      const paymentsResponse = await this.listPayments({
        subscription: subscriptionId,
        status: 'PENDING', // PENDING includes both pending and overdue
        limit: 100,
      });

      if (!paymentsResponse.data || paymentsResponse.data.length === 0) {
        return result;
      }

      // Cancel each pending payment
      for (const payment of paymentsResponse.data) {
        try {
          await this.deletePayment(payment.id);
          result.canceledCount++;
        } catch (error) {
          result.failedCount++;
          result.errors.push({
            paymentId: payment.id,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }

      return result;
    } catch (error) {
      throw new Error(
        `Erro ao buscar cobranças pendentes: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      );
    }
  }

  /**
   * Pay a specific charge with credit card.
   * POST /payments/{id}/payWithCreditCard
   */
  async payPaymentWithCreditCard(
    paymentId: string,
    payload: {
      creditCard: {
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
        addressComplement?: string;
        phone: string;
      };
      remoteIp?: string;
    }
  ): Promise<AsaasPaymentResponse> {
    const response = await this.client.post<AsaasPaymentResponse>(
      `/payments/${encodeURIComponent(paymentId)}/payWithCreditCard`,
      payload
    );
    return response.data;
  }

  /**
   * Fiscal Info - Serviços municipais cadastrados (para NFS-e).
   * GET /v3/fiscalInfo/services
   */
  async listMunicipalServices(filters?: {
    offset?: number;
    limit?: number;
    description?: string;
  }): Promise<{
    data: Array<{ id: string; description: string; issTax?: number }>;
    hasMore: boolean;
    totalCount: number;
    offset: number;
    limit: number;
  }> {
    const response = await this.client.get('/fiscalInfo/services', { params: filters });
    return response.data;
  }

  /**
   * Notas Fiscais (NFS-e) - Agendar emissão atrelada a uma cobrança confirmada.
   * POST /v3/invoices
   * @see https://docs.asaas.com/docs/notas-fiscais
   * @see https://docs.asaas.com/reference/agendar-nota-fiscal
   */
  async scheduleInvoiceForPayment(payload: {
    payment: string;
    value: number;
    serviceDescription: string;
    observations: string;
    effectiveDate: string; // YYYY-MM-DD
    municipalServiceId?: string;
    municipalServiceCode?: string;
    municipalServiceName?: string;
    deductions?: number;
    /** Quando municipalServiceId é informado, omita taxes: o Asaas usa os impostos do serviço cadastrado. */
    taxes?: {
      retainIss: boolean;
      iss: number;
      pis: number;
      cofins: number;
      csll: number;
      inss: number;
      ir: number;
      pisCofinsRetentionType?: string;
      pisCofinsTaxStatus?: string;
    };
  }): Promise<{ id: string; status: string }> {
    const body: any = {
      payment: payload.payment,
      value: payload.value,
      serviceDescription: payload.serviceDescription,
      observations: payload.observations,
      effectiveDate: payload.effectiveDate,
      deductions: payload.deductions ?? 0,
    };
    if (payload.municipalServiceId) {
      body.municipalServiceId = payload.municipalServiceId;
    }
    if (payload.municipalServiceCode) {
      body.municipalServiceCode = payload.municipalServiceCode;
    }
    if (payload.municipalServiceName) {
      body.municipalServiceName = payload.municipalServiceName;
    }
    if (payload.taxes) {
      body.taxes = {
        retainIss: payload.taxes.retainIss,
        iss: payload.taxes.iss,
        pis: payload.taxes.pis,
        cofins: payload.taxes.cofins,
        csll: payload.taxes.csll,
        inss: payload.taxes.inss,
        ir: payload.taxes.ir,
        ...(payload.taxes.pisCofinsRetentionType && {
          pisCofinsRetentionType: payload.taxes.pisCofinsRetentionType,
        }),
        ...(payload.taxes.pisCofinsTaxStatus && { pisCofinsTaxStatus: payload.taxes.pisCofinsTaxStatus }),
      };
    }
    // Log de debug (sem dados sensíveis) para validar emissão
    console.log('[Asaas] Scheduling invoice with:', {
      payment: payload.payment,
      value: payload.value,
      hasMunicipalServiceId: Boolean(payload.municipalServiceId),
      municipalServiceId: payload.municipalServiceId || null,
      municipalServiceCode: payload.municipalServiceCode || null,
      hasTaxes: Boolean(payload.taxes),
      taxes: payload.taxes
        ? {
            retainIss: payload.taxes.retainIss,
            iss: payload.taxes.iss,
            pis: payload.taxes.pis,
            cofins: payload.taxes.cofins,
            csll: payload.taxes.csll,
            inss: payload.taxes.inss,
            ir: payload.taxes.ir,
          }
        : null,
    });
    const response = await this.client.post<{ id: string; status: string }>('/invoices', body);
    return response.data;
  }

  /**
   * Emitir uma nota fiscal (enviar para a prefeitura).
   * POST /v3/invoices/{id}/authorize
   * @see https://docs.asaas.com/reference/emitir-uma-nota-fiscal
   */
  async authorizeInvoice(invoiceId: string): Promise<{ id: string; status: string }> {
    const response = await this.client.post<{ id: string; status: string }>(
      `/invoices/${encodeURIComponent(invoiceId)}/authorize`,
      {}
    );
    return response.data;
  }

  /**
   * Lista notas fiscais (NFS-e) com filtros opcionais.
   * GET /v3/invoices
   * @see https://docs.asaas.com/reference/list-invoices
   */
  async listInvoices(filters?: {
    payment?: string;
    customer?: string;
    status?: string;
    installment?: string;
    externalReference?: string;
  }): Promise<{ data: AsaasInvoice[]; hasMore: boolean; totalCount: number }> {
    const response = await this.client.get<{ data: AsaasInvoice[]; hasMore: boolean; totalCount: number }>(
      '/invoices',
      { params: filters }
    );
    return response.data;
  }

  /**
   * Cancela uma nota fiscal específica.
   * POST /v3/invoices/{id}/cancel
   * @see https://docs.asaas.com/reference/cancelar-uma-nota-fiscal
   */
  async cancelInvoice(
    invoiceId: string,
    options?: { cancelOnlyOnAsaas?: boolean }
  ): Promise<AsaasInvoice> {
    const body = options?.cancelOnlyOnAsaas ? { cancelOnlyOnAsaas: true } : {};
    const response = await this.client.post<AsaasInvoice>(
      `/invoices/${encodeURIComponent(invoiceId)}/cancel`,
      body
    );
    return response.data;
  }

  /**
   * Webhook Management
   */

  async verifyWebhookSignature(_payload: string, _signature: string): Promise<boolean> {
    // TODO: Implement webhook signature verification when Asaas provides this feature
    // For now, we'll validate based on IP whitelist or other methods
    return true;
  }

  parseWebhookEvent(payload: any): AsaasWebhookEvent {
    return {
      event: payload.event,
      payment: payload.payment,
      subscription: payload.subscription,
    };
  }

  /**
   * Checkout Management
   */

  async createCheckout(payload: AsaasCreateCheckoutPayload): Promise<AsaasCheckoutResponse> {
    console.log('[Asaas] Creating checkout with payload:', payload);
    const response = await this.client.post<AsaasCheckoutResponse>('/checkouts', payload);
    return response.data;
  }

  async getCheckout(checkoutId: string): Promise<AsaasCheckoutResponse> {
    const response = await this.client.get<AsaasCheckoutResponse>(`/checkouts/${checkoutId}`);
    return response.data;
  }

  async deleteCheckout(checkoutId: string): Promise<void> {
    await this.client.delete(`/checkouts/${checkoutId}`);
  }

  /**
   * Utility Methods
   */

  isProduction(): boolean {
    return this.config.environment === 'production';
  }

  isSandbox(): boolean {
    return this.config.environment === 'sandbox';
  }

  getEnvironment(): string {
    return this.config.environment;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to list customers with limit 1 to check API connectivity
      await this.client.get('/customers', { params: { limit: 1 } });
      return true;
    } catch (error) {
      console.error('[Asaas] Health check failed:', error);
      return false;
    }
  }
}
