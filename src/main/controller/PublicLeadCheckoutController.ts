import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Request, Response } from 'express';
import { AsaasService } from '../infrastructure/services/AsaasService';
import { EmailService } from '../infrastructure/services/EmailService';
import { Logger } from '../infrastructure/logging/Logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type PaymentMethod = 'PIX' | 'CREDIT_CARD';

interface LeadCatalogItem {
  segment: string;
  availableLeads: number;
}

interface LeadPurchaseRecord {
  id: string;
  buyerName: string;
  buyerEmail: string;
  buyerWhatsapp: string;
  state: string;
  segment: string;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  discountAmount: number;
  couponCode?: string;
  chargedAmount: number;
  paymentMethod: PaymentMethod;
  asaasCustomerId: string;
  asaasPaymentId: string;
  status: 'pending' | 'paid';
  createdAt: string;
  paidAt?: string;
  invoiceId?: string;
  invoiceStatus?: string;
  invoiceIssuedAt?: string;
  invoiceError?: string;
}

interface CouponConfig {
  code: string;
  type: 'FIXED' | 'PERCENT';
  value: number;
  active?: boolean;
}

const UNIT_PRICE = 0.01;
const MIN_AMOUNT = 0;
const EXCLUDED_CSV_COLUMNS = new Set([
  'id',
  'place_id',
  'created_at',
  'updated_at',
  'createdat',
  'updatedat',
]);

/** Colunas no DB/import; na planilha do cliente saem como whatsapp_verificado / telefone_verificado. */
const EVOLUTION_VERIFICATION_TO_CLIENT_CSV: Record<string, string> = {
  whatsapp_valido_evolution: 'whatsapp_verificado',
  telefone_valido_evolution: 'telefone_verificado',
};

const DEFAULT_CATALOG: Record<string, LeadCatalogItem[]> = {
  SP: [
    { segment: 'Auto Peças', availableLeads: 12265 },
    { segment: 'Padaria', availableLeads: 2000 },
    { segment: 'Academia', availableLeads: 1800 },
    { segment: 'Autoescola', availableLeads: 1250 },
    { segment: 'Dentista', availableLeads: 2300 },
    { segment: 'Restaurante', availableLeads: 2600 },
  ],
};

/** Nome do segmento na base: primeira letra de cada palavra em maiúscula (pt-BR), espaços colapsados. */
function normalizeLeadrapidoSegment(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return s;
  return s
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLocaleLowerCase('pt-BR');
      if (!lower) return word;
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
    .join(' ');
}

class LinkedHeaderSet {
  private readonly map = new Map<string, true>();
  add(key: string): void { this.map.set(key, true); }
  toArray(): string[] { return Array.from(this.map.keys()); }
}

export class PublicLeadCheckoutController {
  private readonly asaasService: AsaasService;
  private readonly emailService: EmailService;
  private readonly logger: Logger;
  private readonly dataDir: string;
  private readonly purchasesFile: string;
  private readonly exportDir: string;
  private readonly catalogFile: string;
  private readonly couponsFile: string;
  private readonly supabase: SupabaseClient | null;

  constructor() {
    this.logger = new Logger();
    this.asaasService = new AsaasService(this.logger);
    this.emailService = new EmailService(this.logger);
    this.dataDir = path.resolve(process.cwd(), 'data');
    this.purchasesFile = path.join(this.dataDir, 'lead-purchases.json');
    this.exportDir = path.join(this.dataDir, 'lead-exports');
    this.catalogFile = path.join(this.dataDir, 'lead-catalog.json');
    this.couponsFile = path.join(this.dataDir, 'lead-coupons.json');
    this.supabase = this.createSupabaseClient();
  }

  private getRequestId(res: Response): string {
    const headerValue = res.getHeader('x-request-id');
    if (typeof headerValue === 'string' && headerValue.trim()) return headerValue;
    if (Array.isArray(headerValue) && headerValue.length > 0) return String(headerValue[0]);
    return 'unknown';
  }

  private respondError(
    res: Response,
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
  ): void {
    res.status(statusCode).json({
      success: false,
      code,
      message,
      requestId: this.getRequestId(res),
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && details ? { details } : {}),
    });
  }

  async getCatalog(_req: Request, res: Response): Promise<void> {
    let catalog = await this.buildCatalogFromSupabase();
    if (!catalog) {
      catalog = await this.readCatalog();
    }

    const states = Object.keys(catalog)
      .sort()
      .map((state) => ({
        state,
        segments: catalog[state],
      }));

    res.status(200).json({
      success: true,
      unitPrice: UNIT_PRICE,
      minimumAmount: MIN_AMOUNT,
      states,
    });
  }

  async getQuote(req: Request, res: Response): Promise<void> {
    try {
      const state = String(req.query.state || '').trim();
      const segment = String(req.query.segment || '').trim();
      const couponCode = String(req.query.couponCode || '').trim();
      if (!state || !segment) {
        this.respondError(res, 400, 'MISSING_STATE_OR_SEGMENT', 'state e segment são obrigatórios.');
        return;
      }

      const availableCount = await this.getAvailableLeadsCount(state, segment);
      const grossAmount = availableCount * UNIT_PRICE;
      const coupon = couponCode ? await this.findCoupon(couponCode) : null;
      if (couponCode && !coupon) {
        this.respondError(res, 400, 'INVALID_COUPON', 'Cupom inválido ou inativo.');
        return;
      }
      const discountAmount = this.calculateDiscount(grossAmount, coupon);
      const netAmount = Math.max(0, grossAmount - discountAmount);
      const chargedAmount = Math.max(MIN_AMOUNT, netAmount);

      res.status(200).json({
        success: true,
        state,
        segment,
        unitPrice: UNIT_PRICE,
        minimumAmount: MIN_AMOUNT,
        availableCount,
        grossAmount,
        discountAmount,
        couponCode: coupon?.code || null,
        chargedAmount,
        minimumApplied: netAmount < MIN_AMOUNT,
      });
    } catch (error) {
      this.logger.error('Erro ao calcular quote', error as Error);
      this.respondError(res, 500, 'QUOTE_CALCULATION_FAILED', 'Erro ao calcular valor.');
    }
  }

  async createCheckout(req: Request, res: Response): Promise<void> {
    try {
      const {
        buyerName,
        buyerEmail,
        buyerWhatsapp,
        state,
        segment,
        quantity,
        paymentMethod,
        cpfCnpj,
        cep,
        addressNumber,
        endereco,
        bairro,
        cidade,
        uf,
        cidadeIbge,
        creditCard,
        couponCode,
      } = req.body as Record<string, any>;

      const validated = this.validatePayload({
        buyerName,
        buyerEmail,
        buyerWhatsapp,
        state,
        segment,
        quantity,
        paymentMethod,
      });

      if (!validated.valid) {
        this.respondError(res, 400, 'INVALID_CHECKOUT_PAYLOAD', validated.message || 'Payload inválido.');
        return;
      }

      const available = await this.getAvailableLeadsCount(state, segment);
      if (available === null) {
        this.respondError(res, 400, 'INVALID_STATE_OR_SEGMENT', 'Estado/segmento inválido.');
        return;
      }
      if (Number(quantity) > available) {
        this.respondError(
          res,
          400,
          'INSUFFICIENT_LEADS_AVAILABILITY',
          `Quantidade indisponível. Máximo para ${segment}/${state}: ${available}.`
        );
        return;
      }

      const grossAmount = Number(quantity) * UNIT_PRICE;
      const coupon = couponCode ? await this.findCoupon(String(couponCode)) : null;
      if (couponCode && !coupon) {
        this.respondError(res, 400, 'INVALID_COUPON', 'Cupom inválido ou inativo.');
        return;
      }
      const discountAmount = this.calculateDiscount(grossAmount, coupon);
      const netAmount = Math.max(0, grossAmount - discountAmount);
      const chargedAmount = Math.max(MIN_AMOUNT, netAmount);

      const customer = await this.getOrCreateCustomer({
        buyerName,
        buyerEmail,
        buyerWhatsapp,
        cpfCnpj,
        cep,
        addressNumber,
        endereco,
        bairro,
        cidade,
        uf,
        cidadeIbge,
      });

      const paymentPayload: any = {
        customer: customer.id,
        billingType: paymentMethod,
        value: Number(chargedAmount.toFixed(2)),
        dueDate: this.getTodayIsoDate(),
        description: `Compra avulsa de leads - ${segment}/${state} (${quantity} leads)`,
        externalReference: `lead_purchase:${Date.now()}`,
      };

      if (paymentMethod === 'CREDIT_CARD') {
        if (
          !creditCard?.holderName ||
          !creditCard?.number ||
          !creditCard?.expiryMonth ||
          !creditCard?.expiryYear ||
          !creditCard?.ccv ||
          !cpfCnpj ||
          !cep ||
          !addressNumber ||
          !endereco ||
          !bairro ||
          !uf
        ) {
          this.respondError(
            res,
            400,
            'MISSING_CREDIT_CARD_DATA',
            'Para cartão, informe dados do cartão e endereço de cobrança.'
          );
          return;
        }

        paymentPayload.creditCard = {
          holderName: creditCard.holderName,
          number: String(creditCard.number).replace(/\s/g, ''),
          expiryMonth: String(creditCard.expiryMonth).padStart(2, '0'),
          expiryYear: String(creditCard.expiryYear),
          ccv: String(creditCard.ccv),
        };
        paymentPayload.creditCardHolderInfo = {
          name: buyerName,
          email: buyerEmail,
          cpfCnpj: String(cpfCnpj).replace(/\D/g, ''),
          postalCode: String(cep).replace(/\D/g, ''),
          addressNumber: String(addressNumber),
          phone: String(buyerWhatsapp).replace(/\D/g, ''),
          mobilePhone: String(buyerWhatsapp).replace(/\D/g, ''),
        };
        paymentPayload.remoteIp = req.ip;
      }

      const payment = await this.asaasService.createPayment(paymentPayload);

      let pix: { qrCodeImage?: string; copyPaste?: string } = {};
      if (paymentMethod === 'PIX') {
        try {
          const pixData = await this.asaasService.getPixQrCode(payment.id);
          pix = {
            qrCodeImage: pixData.encodedImage
              ? pixData.encodedImage.startsWith('data:')
                ? pixData.encodedImage
                : `data:image/png;base64,${pixData.encodedImage}`
              : undefined,
            copyPaste: pixData.payload,
          };
        } catch {
          // Non-blocking
        }
      }

      const record: LeadPurchaseRecord = {
        id: `lp_${Date.now()}`,
        buyerName,
        buyerEmail,
        buyerWhatsapp: String(buyerWhatsapp).replace(/\D/g, ''),
        state,
        segment,
        quantity: Number(quantity),
        unitPrice: UNIT_PRICE,
        grossAmount: Number(grossAmount.toFixed(2)),
        discountAmount: Number(discountAmount.toFixed(2)),
        couponCode: coupon?.code,
        chargedAmount: Number(chargedAmount.toFixed(2)),
        paymentMethod,
        asaasCustomerId: customer.id,
        asaasPaymentId: payment.id,
        status: this.isPaidStatus(payment.status) ? 'paid' : 'pending',
        createdAt: new Date().toISOString(),
        paidAt: this.isPaidStatus(payment.status) ? new Date().toISOString() : undefined,
      };

      await this.appendPurchase(record);

      if (record.status === 'paid') {
        await this.fulfillPurchase(record);
      }

      res.status(200).json({
        success: true,
        purchaseId: record.id,
        paymentId: payment.id,
        paymentStatus: payment.status,
        invoiceUrl: payment.invoiceUrl,
        chargedAmount: record.chargedAmount,
        grossAmount: record.grossAmount,
        discountAmount: record.discountAmount,
        couponCode: record.couponCode || null,
        minimumApplied: record.chargedAmount === MIN_AMOUNT,
        pix,
      });
    } catch (error) {
      this.logger.error('Erro ao criar checkout público de leads', error as Error);
      this.respondError(res, 500, 'CHECKOUT_CREATION_FAILED', 'Erro ao criar checkout.');
    }
  }

  async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const paymentId = String(req.query.paymentId || '');
      if (!paymentId) {
        this.respondError(res, 400, 'MISSING_PAYMENT_ID', 'paymentId é obrigatório.');
        return;
      }
      const payment = await this.asaasService.getPayment(paymentId);
      const paid = this.isPaidStatus(payment.status);
      if (paid) {
        await this.markAndFulfillIfNeeded(payment.id);
      }
      res.status(200).json({ success: true, paid, status: payment.status });
    } catch (error) {
      this.logger.error('Erro ao consultar status do pagamento público', error as Error);
      this.respondError(res, 500, 'PAYMENT_STATUS_CHECK_FAILED', 'Erro ao consultar pagamento.');
    }
  }

  async handleAsaasWebhook(req: Request, res: Response): Promise<void> {
    try {
      const secret = process.env.ASAAS_WEBHOOK_SECRET || '';
      const header = String(req.headers['asaas-access-token'] || '');
      const bypass = process.env.BYPASS_WEBHOOK_AUTH === 'true' || process.env.NODE_ENV !== 'production';
      if (!bypass && secret && header !== secret) {
        res.status(200).json({ received: true });
        return;
      }

      const payload = req.body as {
        event?: string;
        payment?: { id?: string; status?: string };
        invoice?: {
          id?: string;
          customer?: string;
          payment?: string;
          status?: string;
          serviceDescription?: string;
          pdfUrl?: string | null;
          xmlUrl?: string | null;
          number?: string | null;
          value?: number | null;
        };
      };
      const event = String(payload.event || '');
      const paymentId = String(payload.payment?.id || '');

      if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
        if (!paymentId) {
          res.status(200).json({ received: true });
          return;
        }
        await this.markAndFulfillIfNeeded(paymentId);
      }

      if (event === 'INVOICE_AUTHORIZED') {
        await this.handleInvoiceAuthorizedWebhook(payload.invoice);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      this.logger.error('Erro no webhook público de leads', error as Error);
      res.status(200).json({ received: true });
    }
  }

  private async handleInvoiceAuthorizedWebhook(
    invoice:
      | {
          id?: string;
          customer?: string;
          payment?: string;
          status?: string;
          serviceDescription?: string;
          pdfUrl?: string | null;
          xmlUrl?: string | null;
          number?: string | null;
          value?: number | null;
        }
      | undefined
  ): Promise<void> {
    if (!invoice?.id) {
      this.logger.warn('INVOICE_AUTHORIZED recebido sem invoice.id');
      return;
    }

    const paymentId = String(invoice.payment || '').trim();
    const customerId = String(invoice.customer || '').trim();
    const records = await this.readPurchases();
    const recordIndex = paymentId
      ? records.findIndex((r) => r.asaasPaymentId === paymentId)
      : records.findIndex((r) => r.asaasCustomerId === customerId);

    if (recordIndex < 0) {
      this.logger.warn('Compra não encontrada para webhook INVOICE_AUTHORIZED', {
        invoiceId: invoice.id,
        paymentId,
        customerId,
      });
      return;
    }

    const record = records[recordIndex];
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    const pdfUrl = invoice.pdfUrl || undefined;
    const xmlUrl = invoice.xmlUrl || undefined;

    if (pdfUrl) {
      try {
        const response = await axios.get<ArrayBuffer>(pdfUrl, { responseType: 'arraybuffer' });
        attachments.push({
          filename: `NF-${invoice.number || invoice.id}.pdf`,
          content: Buffer.from(response.data),
        });
      } catch (err) {
        this.logger.warn('Falha ao baixar PDF da nota fiscal; email será enviado sem anexo PDF', {
          invoiceId: invoice.id,
          pdfUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (xmlUrl) {
      try {
        const response = await axios.get<ArrayBuffer>(xmlUrl, { responseType: 'arraybuffer' });
        attachments.push({
          filename: `NF-${invoice.number || invoice.id}.xml`,
          content: Buffer.from(response.data),
        });
      } catch (err) {
        this.logger.warn('Falha ao baixar XML da nota fiscal; email será enviado sem anexo XML', {
          invoiceId: invoice.id,
          xmlUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.emailService.sendInvoiceEmail({
      to: record.buyerEmail,
      nome: record.buyerName,
      invoiceNumber: invoice.number || invoice.id || null,
      value: typeof invoice.value === 'number' ? invoice.value : record.chargedAmount,
      serviceDescription: invoice.serviceDescription || null,
      pdfUrl: pdfUrl || null,
      xmlUrl: xmlUrl || null,
      attachments,
    });

    record.invoiceId = invoice.id || record.invoiceId;
    record.invoiceStatus = String(invoice.status || 'AUTHORIZED');
    if (!record.invoiceIssuedAt) record.invoiceIssuedAt = new Date().toISOString();
    record.invoiceError = undefined;
    await fs.promises.writeFile(this.purchasesFile, JSON.stringify(records, null, 2), 'utf8');
  }

  async promoteStaging(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isAdminAuthorized(req)) {
        this.respondError(res, 401, 'UNAUTHORIZED_ADMIN', 'Não autorizado.');
        return;
      }
      if (!this.supabase) {
        this.respondError(res, 500, 'SUPABASE_NOT_CONFIGURED', 'Supabase não configurado na API.');
        return;
      }

      type StagingRow = {
        place_id: string | null;
        estado: string | null;
        segmento: string | null;
        nome: string | null;
        whatsapp: string | null;
        telefone: string | null;
        email: string | null;
        site: string | null;
        endereco: string | null;
        cidade: string | null;
        uf: string | null;
        whatsapp_valido_evolution: boolean | null;
        telefone_valido_evolution: boolean | null;
        payload: unknown;
      };

      const PROMOTE_COLUMNS =
        'place_id,estado,segmento,nome,whatsapp,telefone,email,site,endereco,cidade,uf,whatsapp_valido_evolution,telefone_valido_evolution,payload';
      const pageSize = 500;
      let offset = 0;
      let promoted = 0;
      let skipped = 0;
      let skippedNoContact = 0;

      while (true) {
        const { data: stagingRows, error: fetchError } = await this.supabase
          .from('leadrapido_staging')
          .select(PROMOTE_COLUMNS)
          .range(offset, offset + pageSize - 1) as { data: StagingRow[] | null; error: { message: string } | null };

        if (fetchError) {
          this.respondError(res, 500, 'PROMOTE_FETCH_FAILED', `Erro ao ler staging: ${fetchError.message}`);
          return;
        }

        if (!stagingRows || stagingRows.length === 0) break;

        const validRows = stagingRows.filter((r) => r.place_id && String(r.place_id).trim());
        skipped += stagingRows.length - validRows.length;

        // Deduplica por place_id dentro do chunk (mantém o último registro)
        const deduped = Object.values(
          validRows.reduce<Record<string, StagingRow>>((acc, row) => {
            acc[String(row.place_id)] = row;
            return acc;
          }, {})
        );

        // Se a coluna "nome" estiver vazia, tenta preencher a partir do payload (ex: nome_empresa).
        const dedupedWithNome = deduped.map((r) => {
          const currentNome = r.nome ? String(r.nome).trim() : '';
          if (currentNome) return r;

          let payloadObj: any = null;
          if (r.payload && typeof r.payload === 'string') {
            try {
              payloadObj = JSON.parse(r.payload);
            } catch {
              payloadObj = null;
            }
          } else if (r.payload && typeof r.payload === 'object') {
            payloadObj = r.payload as any;
          }

          const nomeFromPayload = payloadObj?.nome_empresa ?? payloadObj?.nome ?? payloadObj?.nomeEmpresa;
          const nome = nomeFromPayload ? String(nomeFromPayload) : r.nome;
          return { ...r, nome };
        });

        const withContact = dedupedWithNome.filter((r) => this.stagingRowHasContact(r));
        skippedNoContact += dedupedWithNome.length - withContact.length;

        if (withContact.length > 0) {
          const rowsForLeadrapido = withContact.map((r) => ({
            ...r,
            segmento:
              r.segmento != null && String(r.segmento).trim()
                ? normalizeLeadrapidoSegment(String(r.segmento))
                : r.segmento,
          }));
          const { error: upsertError } = await this.supabase
            .from('leadrapido')
            .upsert(rowsForLeadrapido, { onConflict: 'place_id' });

          if (upsertError) {
            this.logger.error('Erro ao fazer upsert na leadrapido', undefined, {
              offset,
              error: upsertError.message,
            });
            this.respondError(res, 500, 'PROMOTE_UPSERT_FAILED', `Erro ao promover leads: ${upsertError.message}`);
            return;
          }

          promoted += withContact.length;
        }

        if (stagingRows.length < pageSize) break;
        offset += pageSize;
      }

      const { error: truncateError } = await this.supabase.rpc('truncate_leadrapido_staging');
      if (truncateError) {
        this.logger.warn('Promote concluído mas falhou ao limpar staging', { error: truncateError.message });
      }

      this.logger.info('Staging promovido para leadrapido com sucesso', {
        promoted,
        skipped,
        skippedNoContact,
      });

      res.status(200).json({
        success: true,
        message: 'Base de leads atualizada com sucesso. Staging limpa.',
        promotedRows: promoted,
        skippedRows: skipped,
        skippedNoContactRows: skippedNoContact,
      });
    } catch (error) {
      this.logger.error('Erro ao promover staging para leadrapido', error as Error);
      this.respondError(res, 500, 'PROMOTE_STAGING_FAILED', 'Erro ao atualizar base de leads.');
    }
  }

  async uploadStagingCsv(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isAdminAuthorized(req)) {
        this.respondError(res, 401, 'UNAUTHORIZED_ADMIN', 'Não autorizado.');
        return;
      }
      if (!this.supabase) {
        this.respondError(res, 500, 'SUPABASE_NOT_CONFIGURED', 'Supabase não configurado na API.');
        return;
      }

      const csvContent = String(req.body?.csvContent || '');
      if (!csvContent.trim()) {
        this.respondError(res, 400, 'MISSING_CSV_CONTENT', 'csvContent é obrigatório.');
        return;
      }

      const delimiter = String(req.body?.delimiter || ',');
      const rows = this.parseCsvToObjects(csvContent, delimiter);
      if (rows.length === 0) {
        this.respondError(res, 400, 'CSV_EMPTY_OR_INVALID', 'Nenhuma linha válida encontrada no CSV.');
        return;
      }

      const STAGING_COLUMNS = new Set([
        'place_id', 'estado', 'segmento', 'nome', 'whatsapp',
        'telefone', 'email', 'site', 'endereco', 'cidade', 'uf', 'payload',
        'whatsapp_valido_evolution', 'telefone_valido_evolution',
      ]);

      let skippedNoContact = 0;
      const filteredRows: Record<string, unknown>[] = [];

      for (const row of rows) {
        if (!this.csvRowHasContact(row)) {
          skippedNoContact += 1;
          continue;
        }

        const filtered: Record<string, unknown> = {};
        const extra: Record<string, string> = {};

        for (const [key, value] of Object.entries(row)) {
          const normalizedKey = key.trim().toLowerCase();
          // Padronização: o CSV costuma vir com "nome_empresa", mas a tabela usa a coluna "nome".
          if (normalizedKey === 'nome_empresa') {
            filtered['nome'] = value;
            continue;
          }

          if (STAGING_COLUMNS.has(normalizedKey)) {
            if (normalizedKey === 'payload') {
              try {
                filtered['payload'] = typeof value === 'string' ? JSON.parse(value) : value;
              } catch {
                filtered['payload'] = null;
              }
            } else if (
              normalizedKey === 'whatsapp_valido_evolution' ||
              normalizedKey === 'telefone_valido_evolution'
            ) {
              filtered[normalizedKey] = this.parseCsvBoolean(value);
            } else if (normalizedKey === 'segmento') {
              filtered[normalizedKey] = normalizeLeadrapidoSegment(String(value ?? ''));
            } else {
              filtered[normalizedKey] = value;
            }
          } else {
            extra[key] = value;
          }
        }

        if (Object.keys(extra).length > 0 && !filtered['payload']) {
          filtered['payload'] = extra;
        }

        filteredRows.push(filtered);
      }

      if (filteredRows.length === 0) {
        this.respondError(
          res,
          400,
          'CSV_NO_CONTACT_ROWS',
          'Nenhuma linha com telefone, WhatsApp ou whatsapp_e164; nada foi inserido.'
        );
        return;
      }

      const chunkSize = 500;
      let inserted = 0;
      for (let i = 0; i < filteredRows.length; i += chunkSize) {
        const chunk = filteredRows.slice(i, i + chunkSize);
        const { error } = await this.supabase.from('leadrapido_staging').insert(chunk);
        if (error) {
          this.logger.error('Erro ao inserir CSV na tabela leadrapido_staging', undefined, {
            chunkStart: i,
            chunkSize: chunk.length,
            error: error.message,
          });
          this.respondError(res, 500, 'CSV_INSERT_FAILED', `Erro ao inserir CSV: ${error.message}`);
          return;
        }
        inserted += chunk.length;
      }

      res.status(200).json({
        success: true,
        message: 'Upload realizado com sucesso na leadrapido_staging.',
        totalRows: rows.length,
        insertedRows: inserted,
        skippedNoContactRows: skippedNoContact,
      });
    } catch (error) {
      this.logger.error('Erro ao processar upload CSV para staging', error as Error);
      this.respondError(res, 500, 'CSV_UPLOAD_PROCESSING_FAILED', 'Erro ao processar upload CSV.');
    }
  }

  private validatePayload(input: {
    buyerName: string;
    buyerEmail: string;
    buyerWhatsapp: string;
    state: string;
    segment: string;
    quantity: number;
    paymentMethod: PaymentMethod;
  }): { valid: boolean; message?: string } {
    if (!input.buyerName || input.buyerName.trim().length < 3) {
      return { valid: false, message: 'Nome inválido.' };
    }
    if (!input.buyerEmail || !input.buyerEmail.includes('@')) {
      return { valid: false, message: 'E-mail inválido.' };
    }
    const whatsappDigits = String(input.buyerWhatsapp || '').replace(/\D/g, '');
    if (!/^\d{10,11}$/.test(whatsappDigits)) {
      return { valid: false, message: 'WhatsApp inválido.' };
    }
    if (!input.state || input.state.trim().length < 2) {
      return { valid: false, message: 'Estado inválido.' };
    }
    if (!input.segment || !input.segment.trim()) {
      return { valid: false, message: 'Segmento é obrigatório.' };
    }
    const qty = Number(input.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return { valid: false, message: 'Quantidade de leads inválida.' };
    }
    if (
      input.paymentMethod !== 'PIX' &&
      input.paymentMethod !== 'CREDIT_CARD'
    ) {
      return { valid: false, message: 'Forma de pagamento inválida.' };
    }
    return { valid: true };
  }

  private getAvailableLeads(state: string, segment: string): number | null {
    const catalog = this.getCachedCatalog();
    const segments = catalog[state];
    if (!segments) return null;
    const item = segments.find((s) => s.segment.toLowerCase() === segment.toLowerCase());
    return item ? item.availableLeads : null;
  }

  private parseSegments(rawSegment: string): string[] {
    return String(rawSegment || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseStates(rawState: string): string[] {
    return String(rawState || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private createSupabaseClient(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL?.trim();
    const key = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  private async getAvailableLeadsCount(state: string, segment: string): Promise<number> {
    const requestedStates = this.parseStates(state);
    const requestedSegments = this.parseSegments(segment);
    if (requestedStates.length === 0 || requestedSegments.length === 0) return 0;

    // Preferência: contar na tabela do Supabase (real-time)
    if (this.supabase) {
      let total = 0;
      let hadError = false;

      for (const stateItem of requestedStates) {
        for (const segmentItem of requestedSegments) {
          const { count, error } = await this.supabase
            .from('leadrapido')
            .select('place_id', { count: 'exact', head: true })
            .eq('estado', stateItem)
            .ilike('segmento', segmentItem);

          if (error) {
            hadError = true;
            this.logger.warn('Falha ao contar leads no Supabase, usando fallback', {
              state: stateItem,
              segment: segmentItem,
              error: error.message,
            });
            break;
          }

          total += typeof count === 'number' ? count : 0;
        }
        if (hadError) break;
      }

      if (!hadError) return total;
    }

    // Fallback: catálogo local
    let fallbackTotal = 0;
    for (const stateItem of requestedStates) {
      for (const segmentItem of requestedSegments) {
        const fallback = this.getAvailableLeads(stateItem, segmentItem);
        if (fallback !== null) fallbackTotal += fallback;
      }
    }

    return fallbackTotal;
  }

  private cachedCatalog: Record<string, LeadCatalogItem[]> | null = null;
  private cachedCoupons: CouponConfig[] | null = null;

  private getCachedCatalog(): Record<string, LeadCatalogItem[]> {
    return this.cachedCatalog || DEFAULT_CATALOG;
  }

  private async buildCatalogFromSupabase(): Promise<Record<string, LeadCatalogItem[]> | null> {
    if (!this.supabase) return null;

    const { data, error } = await this.supabase.rpc('leadrapido_catalog_summary');

    if (error) {
      this.logger.warn('Falha ao carregar catálogo do Supabase, usando fallback arquivo', {
        error: error.message,
      });
      return null;
    }

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    type SummaryRow = { estado: string; segmento: string; available: number | string };
    const catalog: Record<string, LeadCatalogItem[]> = {};

    for (const raw of data as SummaryRow[]) {
      const estado = String(raw.estado ?? '').trim();
      const segmento = String(raw.segmento ?? '').trim();
      if (!estado || !segmento) continue;
      const n = Number(raw.available);
      const availableLeads = Number.isFinite(n) ? n : 0;
      if (!catalog[estado]) catalog[estado] = [];
      catalog[estado].push({ segment: segmento, availableLeads });
    }

    return Object.keys(catalog).length > 0 ? catalog : null;
  }

  private async readCatalog(): Promise<Record<string, LeadCatalogItem[]>> {
    try {
      const raw = await fs.promises.readFile(this.catalogFile, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, LeadCatalogItem[]>;
      if (!parsed || typeof parsed !== 'object') {
        this.cachedCatalog = DEFAULT_CATALOG;
        return DEFAULT_CATALOG;
      }
      this.cachedCatalog = parsed;
      return parsed;
    } catch {
      this.cachedCatalog = DEFAULT_CATALOG;
      return DEFAULT_CATALOG;
    }
  }

  private async readCoupons(): Promise<CouponConfig[]> {
    try {
      const raw = await fs.promises.readFile(this.couponsFile, 'utf8');
      const parsed = JSON.parse(raw) as CouponConfig[];
      if (!Array.isArray(parsed)) {
        this.cachedCoupons = [];
        return [];
      }
      this.cachedCoupons = parsed;
      return parsed;
    } catch {
      this.cachedCoupons = [];
      return [];
    }
  }

  private async findCoupon(rawCode: string): Promise<CouponConfig | null> {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return null;
    const coupons = this.cachedCoupons || (await this.readCoupons());
    const coupon = coupons.find((item) => String(item.code || '').trim().toUpperCase() === code);
    if (!coupon || coupon.active === false) return null;
    if (!Number.isFinite(Number(coupon.value)) || Number(coupon.value) <= 0) return null;
    if (coupon.type !== 'FIXED' && coupon.type !== 'PERCENT') return null;
    return coupon;
  }

  private calculateDiscount(grossAmount: number, coupon: CouponConfig | null): number {
    if (!coupon) return 0;
    if (coupon.type === 'FIXED') {
      return Math.max(0, Math.min(grossAmount, Number(coupon.value)));
    }
    const percent = Math.max(0, Math.min(100, Number(coupon.value)));
    return Math.max(0, Math.min(grossAmount, (grossAmount * percent) / 100));
  }

  private async getOrCreateCustomer(input: {
    buyerName: string;
    buyerEmail: string;
    buyerWhatsapp: string;
    cpfCnpj?: string;
    cep?: string;
    addressNumber?: string;
    endereco?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cidadeIbge?: string;
  }): Promise<{ id: string }> {
    const cleanDoc = (input.cpfCnpj || '').replace(/\D/g, '');
    const foundByEmail = await this.asaasService.findCustomerByEmail(input.buyerEmail);
    if (foundByEmail) {
      const city = input.cidadeIbge && /^\d+$/.test(String(input.cidadeIbge)) ? Number(input.cidadeIbge) : undefined;
      await this.asaasService.updateCustomer(foundByEmail.id, {
        postalCode: input.cep ? String(input.cep).replace(/\D/g, '') : undefined,
        addressNumber: input.addressNumber || undefined,
        address: input.endereco || undefined,
        // `province` no Asaas é BAIRRO. Não enviar UF aqui.
        province: input.bairro ? String(input.bairro).trim() : undefined,
        // Complemento deve ser complemento de endereço (apto, bloco, etc). Não usar bairro/cidade aqui.
        ...(city ? { city } : {}),
      } as any);
      return { id: foundByEmail.id };
    }

    const fallbackDoc = cleanDoc.length === 11 || cleanDoc.length === 14 ? cleanDoc : '00000000000';
    const cleanPhone = String(input.buyerWhatsapp).replace(/\D/g, '');
    const city = input.cidadeIbge && /^\d+$/.test(String(input.cidadeIbge)) ? Number(input.cidadeIbge) : undefined;
    const customer = await this.asaasService.createCustomer({
      name: input.buyerName,
      email: input.buyerEmail,
      cpfCnpj: fallbackDoc,
      mobilePhone: cleanPhone,
      phone: cleanPhone,
      postalCode: input.cep ? String(input.cep).replace(/\D/g, '') : undefined,
      addressNumber: input.addressNumber || undefined,
      address: input.endereco || undefined,
      // `province` no Asaas é BAIRRO. Não enviar UF aqui.
      province: input.bairro ? String(input.bairro).trim() : undefined,
      // Complemento deve ser complemento de endereço (apto, bloco, etc). Não usar bairro/cidade aqui.
      ...(city ? { city } : {}),
    } as any);
    return { id: customer.id };
  }

  private isPaidStatus(status?: string): boolean {
    const value = String(status || '').toUpperCase();
    return value === 'RECEIVED' || value === 'CONFIRMED';
  }

  private async appendPurchase(record: LeadPurchaseRecord): Promise<void> {
    await fs.promises.mkdir(this.dataDir, { recursive: true });
    const current = await this.readPurchases();
    current.push(record);
    await fs.promises.writeFile(this.purchasesFile, JSON.stringify(current, null, 2), 'utf8');
  }

  private async readPurchases(): Promise<LeadPurchaseRecord[]> {
    try {
      const raw = await fs.promises.readFile(this.purchasesFile, 'utf8');
      const parsed = JSON.parse(raw) as LeadPurchaseRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async markAndFulfillIfNeeded(asaasPaymentId: string): Promise<void> {
    const records = await this.readPurchases();
    const index = records.findIndex((r) => r.asaasPaymentId === asaasPaymentId);
    if (index < 0) return;
    const record = records[index];
    const wasAlreadyPaid = record.status === 'paid';
    if (!wasAlreadyPaid) {
      record.status = 'paid';
      record.paidAt = new Date().toISOString();
      await fs.promises.writeFile(this.purchasesFile, JSON.stringify(records, null, 2), 'utf8');
      await this.fulfillPurchase(record);
    }

    const invoiceUpdated = await this.issueInvoiceIfEnabled(record);
    if (invoiceUpdated) {
      await fs.promises.writeFile(this.purchasesFile, JSON.stringify(records, null, 2), 'utf8');
    }
  }

  private async issueInvoiceIfEnabled(record: LeadPurchaseRecord): Promise<boolean> {
    const enabled = String(process.env.INVOICE_ON_PAYMENT_CONFIRMED || '').toLowerCase() === 'true';
    if (!enabled) return false;
    if (record.invoiceIssuedAt || record.invoiceId) return false;

    const serviceDescription = String(process.env.INVOICE_SERVICE_DESCRIPTION || '').trim();
    if (!serviceDescription) {
      record.invoiceError = 'INVOICE_SERVICE_DESCRIPTION não configurado';
      this.logger.warn('NFS-e habilitada, mas INVOICE_SERVICE_DESCRIPTION não está configurado', {
        paymentId: record.asaasPaymentId,
        buyerEmail: record.buyerEmail,
      });
      return true;
    }

    let municipalServiceId = String(process.env.INVOICE_MUNICIPAL_SERVICE_ID || '').trim();
    let detectedIssTax: number | undefined;
    const municipalServiceCode = String(process.env.INVOICE_MUNICIPAL_SERVICE_CODE || '').trim();
    const municipalServiceName = String(process.env.INVOICE_MUNICIPAL_SERVICE_NAME || '').trim();
    const observations = String(process.env.INVOICE_OBSERVATIONS || '').trim();

    try {
      // municipalServiceId do Asaas é um ID numérico (ex: "3544"), não o código/descrição (ex: "7319002").
      if (municipalServiceId && !/^\d+$/.test(municipalServiceId)) {
        this.logger.warn('INVOICE_MUNICIPAL_SERVICE_ID inválido (esperado ID numérico do Asaas). Ignorando valor.', {
          municipalServiceId,
        });
        municipalServiceId = '';
      }

      // Se não foi informado o municipalServiceId, tenta descobrir pelo Asaas (serviços fiscais cadastrados).
      if (!municipalServiceId) {
        const queries = Array.from(
          new Set(
            [
              municipalServiceCode,
              // tenta extrair códigos do texto (1706, 7319002, etc)
              ...(municipalServiceName.match(/\b\d{4,8}\b/g) || []),
              ...(serviceDescription.match(/\b\d{4,8}\b/g) || []),
              municipalServiceName,
            ].filter(Boolean)
          )
        );

        for (const query of queries) {
          try {
            const result = await this.asaasService.listMunicipalServices({ limit: 100, offset: 0, description: query });
            const normalizedQuery = String(query).toLowerCase();
            const match =
              result.data.find((s) => s.description?.toLowerCase().includes(normalizedQuery)) ||
              (municipalServiceCode ? result.data.find((s) => s.description?.includes(municipalServiceCode)) : undefined) ||
              (result.data.length === 1 ? result.data[0] : undefined);
            if (match?.id) {
              municipalServiceId = String(match.id);
              detectedIssTax = Number(match.issTax);
              this.logger.info('Serviço municipal detectado automaticamente para NFS-e', {
                municipalServiceId,
                description: match.description,
                matchedBy: query,
                issTax: Number.isFinite(detectedIssTax) ? detectedIssTax : null,
              });
              break;
            }
          } catch (e) {
            this.logger.warn('Falha ao buscar serviços municipais no Asaas; tentando emitir com taxes', {
              error: e instanceof Error ? e.message : String(e),
              query,
            });
          }
        }
      }

      // Algumas contas do Asaas exigem taxes mesmo com municipalServiceId.
      // Enviaremos sempre taxes (com fallback no issTax do serviço detectado).
      const envIss = Number(process.env.INVOICE_TAX_ISS);
      const taxes = {
        retainIss: String(process.env.INVOICE_TAX_RETAIN_ISS || '').toLowerCase() === 'true',
        iss: Number.isFinite(envIss) && envIss > 0 ? envIss : Number.isFinite(detectedIssTax) ? Number(detectedIssTax) : 0,
        pis: Number(process.env.INVOICE_TAX_PIS || 0),
        cofins: Number(process.env.INVOICE_TAX_COFINS || 0),
        csll: Number(process.env.INVOICE_TAX_CSLL || 0),
        inss: Number(process.env.INVOICE_TAX_INSS || 0),
        ir: Number(process.env.INVOICE_TAX_IR || 0),
      };

      if (!municipalServiceId) {
        const anyTaxConfigured =
          Number.isFinite(taxes.iss) &&
          (taxes.iss > 0 ||
            taxes.pis > 0 ||
            taxes.cofins > 0 ||
            taxes.csll > 0 ||
            taxes.inss > 0 ||
            taxes.ir > 0);
        if (!anyTaxConfigured) {
          record.invoiceError =
            'NFS-e: configure INVOICE_MUNICIPAL_SERVICE_ID (recomendado) ou defina pelo menos INVOICE_TAX_ISS > 0.';
          this.logger.warn('NFS-e bloqueada: impostos não configurados e serviço municipal não encontrado', {
            paymentId: record.asaasPaymentId,
            municipalServiceCode,
            municipalServiceName,
          });
          return true;
        }
      }

      const scheduled = await this.asaasService.scheduleInvoiceForPayment({
        payment: record.asaasPaymentId,
        value: Number(record.chargedAmount),
        serviceDescription,
        observations,
        effectiveDate: this.getTodayIsoDate(),
        ...(municipalServiceId ? { municipalServiceId } : {}),
        ...(municipalServiceCode ? { municipalServiceCode } : {}),
        ...(municipalServiceName ? { municipalServiceName } : {}),
        taxes,
      });

      const authorized = await this.asaasService.authorizeInvoice(scheduled.id);
      record.invoiceId = scheduled.id;
      record.invoiceStatus = authorized.status || scheduled.status || 'AUTHORIZED';
      record.invoiceIssuedAt = new Date().toISOString();
      record.invoiceError = undefined;

      // O envio do email da NFS-e é realizado no webhook INVOICE_AUTHORIZED,
      // pois o payload do webhook já traz pdfUrl/xmlUrl prontos para anexo.

      this.logger.info('NFS-e emitida com sucesso para compra de leads', {
        paymentId: record.asaasPaymentId,
        invoiceId: record.invoiceId,
        invoiceStatus: record.invoiceStatus,
        buyerEmail: record.buyerEmail,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao emitir NFS-e';
      record.invoiceError = message;
      this.logger.error('Falha ao emitir NFS-e após confirmação de pagamento', error as Error, {
        paymentId: record.asaasPaymentId,
        buyerEmail: record.buyerEmail,
      });
      return true;
    }
  }

  private async fulfillPurchase(record: LeadPurchaseRecord): Promise<void> {
    await fs.promises.mkdir(this.exportDir, { recursive: true });
    const fileName = `leads-${record.state}-${record.segment}-${record.id}.csv`
      .toLowerCase()
      .replace(/\s+/g, '-');
    const filePath = path.join(this.exportDir, fileName);
    const csv = await this.generateCsv(record);
    await fs.promises.writeFile(filePath, csv, 'utf8');

    await this.emailService.sendLeadPurchaseDeliveryEmail({
      to: record.buyerEmail,
      nome: record.buyerName,
      state: record.state,
      segment: record.segment,
      quantity: record.quantity,
      totalPaid: record.chargedAmount,
      attachments: [{ filename: fileName, content: Buffer.from(csv, 'utf8') }],
    });
  }

  private async generateCsv(record: LeadPurchaseRecord): Promise<string> {
    const realRows = await this.fetchRealLeadsRows(record);
    if (realRows.length > 0) {
      return this.toCsv(realRows);
    }
    return this.generateFallbackCsv(record);
  }

  private async fetchRealLeadsRows(record: LeadPurchaseRecord): Promise<Array<Record<string, unknown>>> {
    if (!this.supabase) return [];

    const requestedStates = this.parseStates(record.state);
    const requestedSegments = this.parseSegments(record.segment);
    if (requestedStates.length === 0 || requestedSegments.length === 0) return [];

    const rows: Array<Record<string, unknown>> = [];

    for (const stateItem of requestedStates) {
      for (const segmentItem of requestedSegments) {
        const remaining = record.quantity - rows.length;
        if (remaining <= 0) break;

        const { data, error } = await this.supabase
          .from('leadrapido')
          .select('*')
          .eq('estado', stateItem)
          .ilike('segmento', segmentItem)
          .limit(remaining);

        if (error) {
          this.logger.warn('Falha ao buscar leads reais para entrega, usando fallback', {
            paymentId: record.asaasPaymentId,
            state: stateItem,
            segment: segmentItem,
            error: error.message,
          });
          return [];
        }

        if (Array.isArray(data) && data.length > 0) {
          rows.push(...(data as Array<Record<string, unknown>>));
        }
      }
      if (rows.length >= record.quantity) break;
    }

    return rows;
  }

  private flattenRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return rows.map((row) => {
      const flat: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (EXCLUDED_CSV_COLUMNS.has(key.toLowerCase())) continue;
        if (key === 'payload' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
          for (const [pk, pv] of Object.entries(value as Record<string, unknown>)) {
            if (!EXCLUDED_CSV_COLUMNS.has(pk.toLowerCase()) && !(pk in flat)) {
              flat[pk] = pv;
            }
          }
        } else {
          flat[key] = value;
        }
      }
      return flat;
    });
  }

  private toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return '';

    const flatRows = this.flattenRows(rows);
    for (const flat of flatRows) {
      for (const [dbKey, clientKey] of Object.entries(EVOLUTION_VERIFICATION_TO_CLIENT_CSV)) {
        if (Object.prototype.hasOwnProperty.call(flat, dbKey)) {
          flat[clientKey] = this.formatEvolutionVerificationForCsv(flat[dbKey]);
          delete flat[dbKey];
        }
      }
    }

    // Coleta todos os headers únicos preservando a ordem
    const headerSet = new LinkedHeaderSet();
    for (const row of flatRows) {
      for (const key of Object.keys(row)) {
        headerSet.add(key);
      }
    }
    const headers = headerSet.toArray();
    const lines = [headers.join(',')];

    for (const row of flatRows) {
      const values = headers.map((header) => this.escapeCsvValue(row[header]));
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }

  private escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return this.escapeCsvValue(JSON.stringify(value));
    }
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private generateFallbackCsv(record: LeadPurchaseRecord): string {
    const header = 'nome,whatsapp,estado,segmento';
    const rows: string[] = [header];
    for (let i = 1; i <= record.quantity; i += 1) {
      const phone = `11${String(900000000 + (i % 99999999)).slice(-9)}`;
      rows.push(`"Lead ${i} ${record.segment}","${phone}","${record.state}","${record.segment}"`);
    }
    return rows.join('\n');
  }

  private getTodayIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isAdminAuthorized(req: Request): boolean {
    const expectedToken = String(process.env.LEADRAPIDOS_ADMIN_TOKEN || '').trim();
    if (!expectedToken) return false;
    const sentToken = String(req.headers['x-admin-token'] || req.body?.adminToken || '').trim();
    return sentToken.length > 0 && sentToken === expectedToken;
  }

  private parseCsvBoolean(value: unknown): boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (s === '' || s === 'null') return null;
    if (s === 'true' || s === '1' || s === 'yes' || s === 'sim') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'não' || s === 'nao') return false;
    return null;
  }

  private csvRowHasContact(row: Record<string, string>): boolean {
    const get = (name: string): string => {
      for (const [k, v] of Object.entries(row)) {
        if (k.trim().toLowerCase() === name) return String(v ?? '').trim();
      }
      return '';
    };
    return !!(get('telefone') || get('whatsapp') || get('whatsapp_e164'));
  }

  private resolvePayloadObject(payload: unknown): Record<string, unknown> | null {
    if (payload == null) return null;
    if (typeof payload === 'string') {
      try {
        const o = JSON.parse(payload) as unknown;
        return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    if (typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
    return null;
  }

  private stagingRowHasContact(r: {
    telefone?: string | null;
    whatsapp?: string | null;
    payload?: unknown;
  }): boolean {
    if (String(r.telefone ?? '').trim()) return true;
    if (String(r.whatsapp ?? '').trim()) return true;
    const p = this.resolvePayloadObject(r.payload);
    const wa164 = p?.whatsapp_e164;
    return !!String(wa164 ?? '').trim();
  }

  private formatEvolutionVerificationForCsv(value: unknown): string {
    if (value === true) return 'verificado';
    if (value === false) return 'não verificado';
    const parsed = this.parseCsvBoolean(value);
    if (parsed === true) return 'verificado';
    if (parsed === false) return 'não verificado';
    return '';
  }

  private parseCsvToObjects(content: string, delimiter: string = ','): Array<Record<string, string>> {
    const lines = content
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) return [];
    const headers = this.parseCsvLine(lines[0], delimiter).map((h) => h.trim());
    const rows: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i += 1) {
      const values = this.parseCsvLine(lines[i], delimiter);
      if (values.every((v) => String(v).trim() === '')) continue;
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) row[header] = values[index] ?? '';
      });
      rows.push(row);
    }
    return rows;
  }

  private parseCsvLine(line: string, delimiter: string = ','): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = i + 1 < line.length ? line[i + 1] : '';
      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    result.push(current);
    return result.map((v) => v.trim());
  }
}

