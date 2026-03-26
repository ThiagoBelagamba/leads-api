import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { AsaasService } from '@main/infrastructure/services/AsaasService';
import { EmailService } from '@main/infrastructure/services/EmailService';
import { Logger } from '@main/infrastructure/logging/Logger';
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
}

interface CouponConfig {
  code: string;
  type: 'FIXED' | 'PERCENT';
  value: number;
  active?: boolean;
}

const UNIT_PRICE = 0.01;
const MIN_AMOUNT = 0;

const DEFAULT_CATALOG: Record<string, LeadCatalogItem[]> = {
  SP: [
    { segment: 'auto peças', availableLeads: 12265 },
    { segment: 'Padaria', availableLeads: 2000 },
    { segment: 'Academia', availableLeads: 1800 },
    { segment: 'Autoescola', availableLeads: 1250 },
    { segment: 'Dentista', availableLeads: 2300 },
    { segment: 'Restaurante', availableLeads: 2600 },
  ],
};

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

  async getCatalog(_req: Request, res: Response): Promise<void> {
    const catalog = await this.readCatalog();
    const states = Object.keys(catalog).map((state) => ({
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
        res.status(400).json({ success: false, message: 'state e segment são obrigatórios.' });
        return;
      }

      const availableCount = await this.getAvailableLeadsCount(state, segment);
      const grossAmount = availableCount * UNIT_PRICE;
      const coupon = couponCode ? await this.findCoupon(couponCode) : null;
      if (couponCode && !coupon) {
        res.status(400).json({ success: false, message: 'Cupom inválido ou inativo.' });
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
      res.status(500).json({ success: false, message: 'Erro ao calcular valor.' });
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
        res.status(400).json({ success: false, message: validated.message });
        return;
      }

      const available = await this.getAvailableLeadsCount(state, segment);
      if (available === null) {
        res.status(400).json({ success: false, message: 'Estado/segmento inválido.' });
        return;
      }
      if (Number(quantity) > available) {
        res.status(400).json({
          success: false,
          message: `Quantidade indisponível. Máximo para ${segment}/${state}: ${available}.`,
        });
        return;
      }

      const grossAmount = Number(quantity) * UNIT_PRICE;
      const coupon = couponCode ? await this.findCoupon(String(couponCode)) : null;
      if (couponCode && !coupon) {
        res.status(400).json({ success: false, message: 'Cupom inválido ou inativo.' });
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
          !addressNumber
        ) {
          res.status(400).json({
            success: false,
            message: 'Para cartão, informe dados do cartão e endereço de cobrança.',
          });
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
          addressComplement: [bairro, cidade].filter(Boolean).join(' - ').trim(),
          phone: String(buyerWhatsapp).replace(/\D/g, ''),
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
      res.status(500).json({ success: false, message: 'Erro ao criar checkout.' });
    }
  }

  async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const paymentId = String(req.query.paymentId || '');
      if (!paymentId) {
        res.status(400).json({ success: false, message: 'paymentId é obrigatório.' });
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
      res.status(500).json({ success: false, message: 'Erro ao consultar pagamento.' });
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

      const payload = req.body as { event?: string; payment?: { id?: string; status?: string } };
      const event = String(payload.event || '');
      const paymentId = String(payload.payment?.id || '');

      if (!paymentId) {
        res.status(200).json({ received: true });
        return;
      }

      if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
        await this.markAndFulfillIfNeeded(paymentId);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      this.logger.error('Erro no webhook público de leads', error as Error);
      res.status(200).json({ received: true });
    }
  }

  async uploadStagingCsv(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isAdminAuthorized(req)) {
        res.status(401).json({ success: false, message: 'Não autorizado.' });
        return;
      }
      if (!this.supabase) {
        res.status(500).json({ success: false, message: 'Supabase não configurado na API.' });
        return;
      }

      const csvContent = String(req.body?.csvContent || '');
      if (!csvContent.trim()) {
        res.status(400).json({ success: false, message: 'csvContent é obrigatório.' });
        return;
      }

      const delimiter = String(req.body?.delimiter || ',');
      const rows = this.parseCsvToObjects(csvContent, delimiter);
      if (rows.length === 0) {
        res.status(400).json({ success: false, message: 'Nenhuma linha válida encontrada no CSV.' });
        return;
      }

      const chunkSize = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await this.supabase.from('leadrapido_staging').insert(chunk);
        if (error) {
          this.logger.error('Erro ao inserir CSV na tabela leadrapido_staging', undefined, {
            chunkStart: i,
            chunkSize: chunk.length,
            error: error.message,
          });
          res.status(500).json({ success: false, message: `Erro ao inserir CSV: ${error.message}` });
          return;
        }
        inserted += chunk.length;
      }

      res.status(200).json({
        success: true,
        message: 'Upload realizado com sucesso na leadrapido_staging.',
        totalRows: rows.length,
        insertedRows: inserted,
      });
    } catch (error) {
      this.logger.error('Erro ao processar upload CSV para staging', error as Error);
      res.status(500).json({ success: false, message: 'Erro ao processar upload CSV.' });
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

  private createSupabaseClient(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL?.trim();
    const key = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  private async getAvailableLeadsCount(state: string, segment: string): Promise<number> {
    // Preferência: contar na tabela do Supabase (real-time)
    if (this.supabase) {
      const { count, error } = await this.supabase
        .from('leadrapido')
        .select('place_id', { count: 'exact', head: true })
        .eq('estado', state)
        .ilike('segmento', segment);

      if (!error && typeof count === 'number') return count;
      this.logger.warn('Falha ao contar leads no Supabase, usando fallback', {
        state,
        segment,
        error: error?.message,
      });
    }

    // Fallback: catálogo local
    const fallback = this.getAvailableLeads(state, segment);
    if (fallback === null) return 0;
    return fallback;
  }

  private cachedCatalog: Record<string, LeadCatalogItem[]> | null = null;
  private cachedCoupons: CouponConfig[] | null = null;

  private getCachedCatalog(): Record<string, LeadCatalogItem[]> {
    return this.cachedCatalog || DEFAULT_CATALOG;
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
  }): Promise<{ id: string }> {
    const cleanDoc = (input.cpfCnpj || '').replace(/\D/g, '');
    const foundByEmail = await this.asaasService.findCustomerByEmail(input.buyerEmail);
    if (foundByEmail) {
      await this.asaasService.updateCustomer(foundByEmail.id, {
        postalCode: input.cep ? String(input.cep).replace(/\D/g, '') : undefined,
        addressNumber: input.addressNumber || undefined,
        address: input.endereco || undefined,
        complement: [input.bairro, input.cidade].filter(Boolean).join(' - ').trim() || undefined,
        province: input.uf ? String(input.uf).toUpperCase().slice(0, 2) : undefined,
      } as any);
      return { id: foundByEmail.id };
    }

    const fallbackDoc = cleanDoc.length === 11 || cleanDoc.length === 14 ? cleanDoc : '00000000000';
    const cleanPhone = String(input.buyerWhatsapp).replace(/\D/g, '');
    const customer = await this.asaasService.createCustomer({
      name: input.buyerName,
      email: input.buyerEmail,
      cpfCnpj: fallbackDoc,
      mobilePhone: cleanPhone,
      phone: cleanPhone,
      postalCode: input.cep ? String(input.cep).replace(/\D/g, '') : undefined,
      addressNumber: input.addressNumber || undefined,
      address: input.endereco || undefined,
      complement: [input.bairro, input.cidade].filter(Boolean).join(' - ').trim() || undefined,
      province: input.uf ? String(input.uf).toUpperCase().slice(0, 2) : undefined,
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
    if (records[index].status === 'paid') return;
    records[index].status = 'paid';
    records[index].paidAt = new Date().toISOString();
    await fs.promises.writeFile(this.purchasesFile, JSON.stringify(records, null, 2), 'utf8');
    await this.fulfillPurchase(records[index]);
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

    const { data, error } = await this.supabase
      .from('leadrapido')
      .select('*')
      .eq('estado', record.state)
      .ilike('segmento', record.segment)
      .limit(record.quantity);

    if (error) {
      this.logger.warn('Falha ao buscar leads reais para entrega, usando fallback', {
        paymentId: record.asaasPaymentId,
        state: record.state,
        segment: record.segment,
        error: error.message,
      });
      return [];
    }

    return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  }

  private toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];

    for (const row of rows) {
      const values = headers.map((header) => this.escapeCsvValue(row[header]));
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }

  private escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
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

