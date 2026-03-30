/**
 * EmailService
 * Serviço para envio de emails (senha temporária, reset, etc)
 * Integrado com Nodemailer + SMTP Hostgator
 */

import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { Logger } from '../logging/Logger';
import { getSmtpConfig } from '../config/SmtpConfig';

/** Nomes dos PDFs de boas-vindas (devem estar no volume montado em WELCOME_PDFS_PATH). */
const WELCOME_PDF_FILENAMES = [
  'agentes-ia-disparo-rapido.pdf',
  'guia-pratico-para-vendas-no-whatsapp.pdf',
  'manual-antibanimento.pdf',
] as const;

/** URL da ferramenta Disparo Rápido na Chrome Web Store */
const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/envio-em-massa-whatsapp-%E2%80%93/lefbmdlepkaecalganmcigoljkfhbkjh';

/** URL da logo no header dos emails. Use EMAIL_LOGO_URL (URL completa) ou deixe em branco para não exibir logo. */
function getEmailLogoUrl(): string {
  const explicit = process.env.EMAIL_LOGO_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.DISPARO_RAPIDO_SITE_URL || process.env.SITE_URL || '';
  if (!base) return '';
  return base.endsWith('/') ? `${base}logo.png` : `${base}/logo.png`;
}

export interface WelcomeEmailData {
  to: string;
  nome: string;
  tempPassword: string;
  empresaNome: string;
}

export interface ResetPasswordEmailData {
  to: string;
  nome: string;
  resetToken: string;
  /** URL da página do site para redefinir senha (ex: https://disparorapido.com.br/redefinir-senha?token=...) */
  resetUrl?: string;
}

export interface EmailConfirmationData {
  to: string;
  nome: string;
  confirmationUrl: string;
}

export interface LeadPurchaseDeliveryEmailData {
  to: string;
  nome: string;
  state: string;
  segment: string;
  quantity: number;
  totalPaid: number;
  attachments: Array<{ filename: string; content: Buffer }>;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor(private logger: Logger) {
    this.initializeTransporter();
  }

  /**
   * Inicializa o transporter Nodemailer com configurações SMTP
   */
  private initializeTransporter(): void {
    try {
      const smtpConfig = getSmtpConfig();

      // Se não houver senha, apenas loga um aviso
      if (!smtpConfig.auth.pass) {
        this.logger.warn('⚠️ SMTP_PASSWORD não configurada. Emails não serão enviados realmente.');
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: smtpConfig.auth,
      });

      this.logger.info('✅ Email transporter inicializado', {
        host: smtpConfig.host,
        port: smtpConfig.port,
        user: smtpConfig.auth.user,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao inicializar Email transporter', err);
    }
  }

  /**
   * Lê os PDFs de boas-vindas do diretório configurado em WELCOME_PDFS_PATH (ex.: volume no Portainer).
   * Retorna array de anexos para o Nodemailer; se o diretório ou arquivos não existirem, retorna [].
   */
  private async getWelcomePdfAttachments(): Promise<Array<{ filename: string; content: Buffer }>> {
    const rawPath = process.env.WELCOME_PDFS_PATH || '/data/welcome-pdfs';
    const basePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    const attachments: Array<{ filename: string; content: Buffer }> = [];
    try {
      if (!fs.existsSync(basePath)) {
        this.logger.debug('WELCOME_PDFS_PATH não existe, email sem anexos', { basePath });
        return attachments;
      }
      for (const filename of WELCOME_PDF_FILENAMES) {
        const filePath = path.join(basePath, filename);
        if (!fs.existsSync(filePath)) continue;
        const content = await fs.promises.readFile(filePath);
        attachments.push({ filename, content });
      }
      if (attachments.length > 0) {
        this.logger.info('PDFs de boas-vindas anexados ao email', {
          count: attachments.length,
          files: attachments.map((a) => a.filename),
        });
      }
    } catch (err) {
      this.logger.warn('Erro ao ler PDFs de boas-vindas; email será enviado sem anexos', {
        basePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return attachments;
  }

  /**
   * Envia email de boas-vindas com senha temporária
   */
  async sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
    const { to, nome, tempPassword, empresaNome } = data;

    this.logger.info('📧 Enviando email de boas-vindas', {
      to,
      nome,
      empresaNome,
    });

    // Se transporter não foi inicializado, apenas loga
    if (!this.transporter) {
      this.logger.warn('⚠️ Email transporter não disponível. Email não foi enviado.', { to });
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const logoUrl = getEmailLogoUrl();
      const verde = '#1d990c';
      const azul = '#2563eb';
      const verdeClaro = '#dcfce7';
      const azulClaro = '#eff6ff';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; }
            .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
            .header { background: linear-gradient(135deg, ${verde} 0%, ${azul} 100%); color: white; padding: 28px 24px; text-align: center; }
            .header img.email-logo { max-height: 48px; width: auto; display: block; margin: 0 auto 12px; }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
            .content { padding: 28px 24px; }
            .credentials { background: ${verdeClaro}; padding: 20px; border-radius: 8px; border-left: 4px solid ${verde}; margin: 20px 0; }
            .credentials-item { padding: 8px 0; }
            .credentials-label { color: #166534; font-size: 12px; }
            .credentials-value { font-family: monospace; font-weight: bold; color: #333; }
            .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 6px; font-size: 13px; color: #92400e; }
            .steps { margin: 20px 0; padding-left: 20px; }
            .steps li { margin: 8px 0; }
            .button { display: inline-block; background: ${verde}; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 16px 0; }
            .button-wrap { text-align: center; }
            .footer { background: ${azulClaro}; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body style="background: #f1f5f9; padding: 24px 16px;">
          <div class="container">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="Disparo Rápido" class="email-logo" width="160" height="48" />` : ''}
              <h1>Bem-vindo ao Disparo Rápido!</h1>
              <p style="margin: 8px 0 0; opacity: 0.95;">Sua conta em ${empresaNome} foi criada</p>
            </div>
            <div class="content">
              <p>Olá, <strong>${nome}</strong>!</p>
              <p>Sua conta foi criada com sucesso. Use as credenciais abaixo para acessar a ferramenta:</p>
              <div class="credentials">
                <div class="credentials-item">
                  <div class="credentials-label">📧 Email</div>
                  <div class="credentials-value">${to}</div>
                </div>
                <div class="credentials-item">
                  <div class="credentials-label">🔐 Senha temporária</div>
                  <div class="credentials-value">${tempPassword}</div>
                </div>
              </div>
              <div class="warning">
                <strong>Por segurança:</strong> altere sua senha no primeiro acesso (ferramenta no Chrome → Esqueci a senha ou alterar senha).
              </div>
              <p><strong>Próximos passos:</strong></p>
              <ol class="steps">
                <li>Instale a ferramenta Disparo Rápido na Chrome Web Store</li>
                <li>Faça login com o email e a senha temporária acima</li>
                <li>Altere sua senha e comece a usar!</li>
              </ol>
              <p class="button-wrap">
                <a href="${CHROME_WEB_STORE_URL}" class="button">Instalar ferramenta na Chrome Web Store</a>
              </p>
              <p style="font-size: 13px; color: #64748b;">Dúvidas? <a href="mailto:suporte@disparorapido.com.br" style="color: ${azul};">suporte@disparorapido.com.br</a></p>
            </div>
            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} Disparo Rápido. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const attachments = await this.getWelcomePdfAttachments();
      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Bem-vindo ao Disparo Rápido - Suas Credenciais',
        html: htmlContent,
        text: `Olá ${nome},\n\nBem-vindo ao Disparo Rápido!\n\nEmail: ${to}\nSenha Temporária: ${tempPassword}\n\nAlter sua senha no primeiro acesso.\n\nDisparo Rápido`,
        ...(attachments.length > 0 && { attachments }),
      });

      this.logger.info('✅ Email de boas-vindas enviado com sucesso', {
        to,
        messageId: info.messageId,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de boas-vindas', err, { to });
      throw error;
    }
  }

  /**
   * Envia email de boas-vindas para cliente novo do checkout (senha já definida no cadastro).
   * Inclui os PDFs de boas-vindas. Usado apenas no PAYMENT_CONFIRMED do webhook, uma vez por cliente.
   */
  async sendWelcomeEmailCheckout(data: { to: string; nome: string; empresaNome: string }): Promise<void> {
    const { to, nome, empresaNome } = data;

    this.logger.info('📧 Enviando email de boas-vindas (checkout)', { to, nome, empresaNome });

    if (!this.transporter) {
      this.logger.warn('⚠️ Email transporter não disponível. Email não foi enviado.', { to });
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const logoUrl = getEmailLogoUrl();
      const headerContent = logoUrl
        ? `<img src="${logoUrl}" alt="Lead Rápido" style="max-height: 48px; width: auto; display: block; margin: 0 auto; border: 0;" />`
        : '<h1 style="color: #0056b3; margin: 0; font-size: 24px; letter-spacing: 1px;">🚀 Lead Rápido</h1>';

      const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sua conta na Lead Rápido está ativa!</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, Arial; color: #333333; line-height: 1.6; }
        table { border-spacing: 0; width: 100%; }
        td { padding: 0; }
        img { border: 0; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-top: 40px; padding-bottom: 40px; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden; }
        .header { background-color: #ffffff; padding: 30px 20px; text-align: center; border-bottom: 3px solid #0056b3; }
        .header h1 { color: #0056b3; margin: 0; font-size: 24px; letter-spacing: 1px; }
        .content { padding: 40px 30px; }
        .content h2 { color: #2c3e50; font-size: 20px; margin-top: 0; margin-bottom: 20px; }
        .content p { font-size: 16px; color: #555555; margin-bottom: 20px; }
        .btn-container { text-align: center; margin: 35px 0; }
        .btn { background-color: #25D366; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block; }
        .btn:hover { background-color: #128C7E; }
        .support-box { background-color: #f9f9f9; border-left: 4px solid #0056b3; padding: 15px 20px; margin-top: 30px; border-radius: 0 4px 4px 0; }
        .support-box p { margin: 0; font-size: 15px; }
        .attachment-list { list-style-type: none; padding-left: 0; margin-bottom: 25px; }
        .attachment-list li { background-color: #f9f9f9; margin-bottom: 8px; padding: 10px 15px; border-radius: 4px; border-left: 3px solid #25D366; font-size: 15px; color: #444; }
        .support-link { color: #0056b3; text-decoration: none; font-weight: bold; }
        .whatsapp-link { color: #25D366; text-decoration: none; font-weight: bold; }
        .footer { background-color: #f1f1f1; padding: 20px; text-align: center; font-size: 14px; color: #777777; }
        @media screen and (max-width: 600px) {
            .content { padding: 30px 20px !important; }
            .btn { display: block !important; width: 100% !important; box-sizing: border-box !important; }
        }
    </style>
</head>
<body>
    <center class="wrapper">
        <table class="main" width="100%">
            <tr>
                <td class="header">
                    ${headerContent}
                </td>
            </tr>
            <tr>
                <td class="content">
                    <h2>Olá, ${empresaNome}, tudo bem?</h2>
                    <p>Seu pagamento foi confirmado e sua conta na <strong>Lead Rápido</strong> já está ativa! 🎉</p>
                    <p>Em anexo a este e-mail, enviamos todos os materiais exclusivos para você extrair o máximo da nossa ferramenta e turbinar suas vendas:</p>
                    <ul class="attachment-list">
                        <li>🛡️ Manual Antibanimento</li>
                        <li>📘 Manual Prático de Vendas no WhatsApp</li>
                        <li>🤖 Agente de IA "Estratégias de Marketing"</li>
                        <li>✍️ Agente de IA "Copywriter"</li>
                        <li>⚙️ Manual de Uso da Ferramenta</li>
                        <li>📊 Arquivo Modelo para upload da lista de contatos</li>
                    </ul>
                    <div class="btn-container">
                        <a href="${CHROME_WEB_STORE_URL}" class="btn" style="color: #ffffff !important; background-color: #25D366; text-decoration: none;" target="_blank">Instalar Extensão no Chrome</a>
                    </div>
                    <p><strong>Próximo passo:</strong><br>Após instalar a extensão, faça login utilizando o <strong>mesmo e-mail e a senha</strong> cadastrados no momento da compra.</p>
                    <div class="support-box">
                        <p><strong>Precisa de ajuda?</strong><br>Nosso suporte está à disposição para ajudar você:</p>
                        <p style="margin-top: 10px;">✉️ E-mail: <a href="mailto:contato@leadrapido.com.br" class="support-link">contato@leadrapido.com.br</a></p>
                        <p style="margin-top: 5px;">📱 WhatsApp: <a href="https://wa.me/5516992933505" class="whatsapp-link" target="_blank">(16) 99293-3505</a></p>
                    </div>
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <p style="margin: 0; margin-bottom: 15px;">Atenciosamente,<br><strong>Equipe Lead Rápido</strong></p>
                    <p style="margin: 0; font-size: 12px; color: #aaaaaa;">&copy; ${new Date().getFullYear()} Lead Rápido. Todos os direitos reservados.</p>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
      `.trim();

      const attachments = await this.getWelcomePdfAttachments();
      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Sua conta na Lead Rápido está ativa!',
        html: htmlContent,
        text: `Olá, ${empresaNome}, tudo bem?\n\nSeu pagamento foi confirmado e sua conta na Lead Rápido já está ativa!\n\nEm anexo enviamos os materiais exclusivos. Instale a extensão: ${CHROME_WEB_STORE_URL}\n\nPróximo passo: faça login com o mesmo e-mail e senha cadastrados na compra.\n\nSuporte: contato@leadrapido.com.br | WhatsApp (16) 99293-3505\n\nEquipe Lead Rápido`,
        ...(attachments.length > 0 && { attachments }),
      });

      this.logger.info('✅ Email de boas-vindas (checkout) enviado com sucesso', {
        to,
        messageId: info.messageId,
        attachmentsCount: attachments.length,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de boas-vindas (checkout)', err, { to });
      throw error;
    }
  }

  /**
   * Envia email com a Nota Fiscal autorizada em anexo (PDF/XML) para o cliente,
   * usando o mesmo estilo visual dos demais emails transacionais.
   */
  async sendInvoiceEmail(data: {
    to: string;
    nome: string;
    empresaNome?: string;
    invoiceNumber?: string | null;
    value?: number | null;
    serviceDescription?: string | null;
    pdfUrl?: string | null;
    xmlUrl?: string | null;
    attachments?: Array<{ filename: string; content: Buffer }>;
  }): Promise<void> {
    const { to, nome, empresaNome, invoiceNumber, value, serviceDescription, pdfUrl, xmlUrl, attachments = [] } = data;

    this.logger.info('📧 Enviando email de nota fiscal (INVOICE_AUTHORIZED)', {
      to,
      invoiceNumber,
      hasPdf: !!pdfUrl,
      hasXml: !!xmlUrl,
      attachmentsCount: attachments.length,
    });

    if (!this.transporter) {
      this.logger.warn('⚠️ Email transporter não disponível. Email de nota fiscal não foi enviado.', { to });
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const friendlyName = empresaNome || nome || 'Cliente';
      const formattedValue =
        typeof value === 'number' && !Number.isNaN(value) ? value.toFixed(2).replace('.', ',') : undefined;
      const leadRapidoLogoUrl = process.env.LEADRAPIDO_EMAIL_LOGO_URL?.trim() || 'https://leadrapido.com.br/images/logo-email.png';
      const primaryInvoiceUrl = pdfUrl || xmlUrl || 'https://leadrapido.com.br';
      const friendlyService = 'Publicidade e Propaganda';
      const invoiceAttachments: Array<{ filename: string; content?: Buffer; path?: string }> = [...attachments];
      if (pdfUrl && !invoiceAttachments.some((a) => a.filename.toLowerCase().endsWith('.pdf'))) {
        invoiceAttachments.push({
          filename: `nota-fiscal-${invoiceNumber || 'lead-rapido'}.pdf`,
          path: pdfUrl,
        });
      }
      if (xmlUrl && !invoiceAttachments.some((a) => a.filename.toLowerCase().endsWith('.xml'))) {
        invoiceAttachments.push({
          filename: `nota-fiscal-${invoiceNumber || 'lead-rapido'}.xml`,
          path: xmlUrl,
        });
      }
      const linksHtml =
        pdfUrl || xmlUrl
          ? `<div class="attachment-note">
               📎 <strong>Links da Nota Fiscal:</strong><br/>
               ${pdfUrl ? `• <a href="${pdfUrl}" style="color:#2563eb;text-decoration:none;">Baixar PDF</a><br/>` : ''}
               ${xmlUrl ? `• <a href="${xmlUrl}" style="color:#2563eb;text-decoration:none;">Baixar XML</a>` : ''}
             </div>`
          : `<div class="attachment-note">📎 Sua Nota Fiscal está disponível no botão abaixo.</div>`;

      const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sua Nota Fiscal chegou! - Lead Rápido</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f7f9; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; color: #333; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f9; padding: 40px 0; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; color: #4a4a4a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(30, 58, 138, 0.1); }
    .header { background-color: #ffffff; padding: 40px 20px 30px 20px; text-align: center; border-bottom: 1px solid #f0f4f8; }
    .logo { max-width: 220px; height: auto; display: inline-block; }
    .content { padding: 40px 40px 30px 40px; line-height: 1.6; }
    .greeting { font-size: 22px; font-weight: 800; color: #1e3a8a; margin-bottom: 15px; }
    .intro-text { font-size: 16px; color: #555; margin-bottom: 30px; }
    .summary-title { font-size: 13px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .info-box { background-color: #f8fafc; border-radius: 12px; padding: 25px; margin-bottom: 35px; border: 1px solid #e2e8f0; }
    .info-item { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; }
    .info-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .label { font-weight: 600; color: #64748b; font-size: 14px; }
    .value { font-weight: 700; color: #1e3a8a; font-size: 15px; text-align: right; }
    .button-container { text-align: center; margin-bottom: 35px; }
    .btn-download { background-color: #2563eb; color: #ffffff !important; padding: 18px 35px; text-decoration: none; font-weight: 800; font-size: 16px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3); }
    .attachment-note { text-align: center; font-size: 14px; color: #64748b; margin-bottom: 25px; padding: 15px; background-color: #eff6ff; border-radius: 8px; }
    .footer { text-align: center; padding: 40px; font-size: 12px; color: #94a3b8; background-color: #f8fafc; }
    .signature { font-weight: 700; color: #1e3a8a; margin-top: 5px; }
    @media screen and (max-width: 600px) {
      .main { border-radius: 0; }
      .content { padding: 30px 20px; }
      .info-item { flex-direction: column; text-align: left; }
      .value { text-align: left; margin-top: 4px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" align="center">
      <tr>
        <td class="header">
          <img src="${leadRapidoLogoUrl}" alt="Lead Rápido" class="logo" />
        </td>
      </tr>
      <tr>
        <td class="content">
          <div class="greeting">Sua Nota Fiscal chegou, ${friendlyName}!</div>
          <p class="intro-text">A NFS-e da sua compra foi emitida e autorizada com sucesso.</p>

          <div class="summary-title">Resumo da nota:</div>
          <div class="info-box">
            <div class="info-item">
              <span class="label">Serviço:</span>
              <span class="value">${friendlyService}</span>
            </div>
            ${
              formattedValue
                ? `<div class="info-item">
                     <span class="label">Valor:</span>
                     <span class="value">R$ ${formattedValue}</span>
                   </div>`
                : ''
            }
            ${
              invoiceNumber
                ? `<div class="info-item">
                     <span class="label">Número da NF:</span>
                     <span class="value">#${invoiceNumber}</span>
                   </div>`
                : ''
            }
          </div>

          <div class="button-container">
            <a href="${primaryInvoiceUrl}" class="btn-download">ACESSAR NOTA FISCAL</a>
          </div>

          ${linksHtml}
        </td>
      </tr>
      <tr>
        <td class="footer">
          <div class="signature">contato@leadrapido.com.br</div>
          <p style="margin-top: 15px;">
            <strong>M F SILVA TECNOLOGIA DA INFORMAÇÃO LTDA</strong><br/>
            CNPJ: 35.185.351/0001-07<br/>
            Franca - SP
          </p>
          <p style="margin-top: 20px;">&copy; ${new Date().getFullYear()} Lead Rápido. Todos os direitos reservados.</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
      `.trim();

      const textLines: string[] = [];
      textLines.push(`Olá, ${friendlyName}!`);
      textLines.push(
        'Sua Nota Fiscal de Serviço (NFS-e) relativa ao seu PLANO LEAD RÁPIDO foi emitida e autorizada com sucesso.'
      );
      textLines.push('');
      textLines.push('Resumo da fatura:');
      textLines.push(`- Serviço: ${friendlyService}`);
      if (formattedValue) textLines.push(`- Valor total: R$ ${formattedValue}`);
      if (invoiceNumber) textLines.push(`- Número da NF: #${invoiceNumber}`);
      textLines.push('');
      textLines.push('A Nota Fiscal foi emitida e está disponível nos links abaixo.');
      if (pdfUrl) textLines.push(`PDF: ${pdfUrl}`);
      if (xmlUrl) textLines.push(`XML: ${xmlUrl}`);
      textLines.push('');
      textLines.push('Dica: Guarde este e-mail para facilitar sua conciliação bancária ao final do mês.');

      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Sua Nota Fiscal chegou! - Lead Rápido',
        html: htmlContent,
        text: textLines.join('\n'),
        ...(invoiceAttachments.length > 0 && { attachments: invoiceAttachments }),
      });

      this.logger.info('✅ Email de nota fiscal enviado com sucesso', {
        to,
        messageId: info.messageId,
        attachmentsCount: invoiceAttachments.length,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de nota fiscal', err, { to });
      throw error;
    }
  }

  /**
   * Envia email de reset de senha (Hostinger).
   * Se resetUrl for informado (fluxo Disparo Rápido), o email leva para a página do site; senão exibe o token.
   */
  async sendResetPasswordEmail(data: ResetPasswordEmailData): Promise<void> {
    const { to, nome, resetToken, resetUrl } = data;

    this.logger.info('📧 Enviando email de reset de senha', {
      to,
      nome,
      hasResetUrl: !!resetUrl,
    });

    if (!this.transporter) {
      this.logger.warn('⚠️ Email transporter não disponível. Email não foi enviado.', { to });
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      // Cores Disparo Rápido: verde #1d990c / #22c55e, azul #2563eb / #0ea5e9
      const verde = '#1d990c';
      const azul = '#2563eb';
      const verdeClaro = '#dcfce7';
      const azulClaro = '#eff6ff';

      const ctaHtml = resetUrl
        ? `
          <p style="margin: 24px 0 16px;">
            <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, ${verde} 0%, ${azul} 100%); color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Redefinir minha senha
            </a>
          </p>
          <p style="color: #64748b; font-size: 13px;">Ou copie e cole no navegador:</p>
          <p style="word-break: break-all; font-size: 12px; color: #475569;">${resetUrl}</p>
        `
        : `
          <div style="background: ${verdeClaro}; padding: 16px; border-radius: 8px; border-left: 4px solid ${verde}; margin: 20px 0;">
            <div style="color: #166534; font-size: 12px; margin-bottom: 8px;">🔐 Token de redefinição:</div>
            <div style="font-family: monospace; font-weight: bold; color: #333; word-break: break-all;">${resetToken}</div>
          </div>
          <p>Cole o token acima na página de redefinição de senha para criar uma nova senha.</p>
        `;

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; }
            .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
            .header { background: linear-gradient(135deg, ${verde} 0%, ${azul} 100%); color: white; padding: 28px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
            .header p { margin: 8px 0 0; opacity: 0.95; font-size: 14px; }
            .content { padding: 28px 24px; }
            .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 6px; font-size: 13px; color: #92400e; }
            .footer { background: ${azulClaro}; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body style="background: #f1f5f9; padding: 24px 16px;">
          <div class="container">
            <div class="header">
              <h1>Redefinir senha</h1>
              <p>Disparo Rápido</p>
            </div>
            <div class="content">
              <p>Olá, <strong>${nome}</strong>!</p>
              <p>Você solicitou a redefinição da sua senha. Clique no botão abaixo para criar uma nova senha de forma segura.</p>
              ${ctaHtml}
              <div class="warning">
                <strong>⏰ Este link expira em 1 hora.</strong><br>
                Se você não solicitou essa redefinição, ignore este email. Sua senha permanecerá a mesma.
              </div>
              <p style="margin-top: 24px; font-size: 13px; color: #64748b;">Dúvidas? Entre em contato: <a href="mailto:suporte@disparorapido.com.br" style="color: ${azul};">suporte@disparorapido.com.br</a></p>
            </div>
            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} Disparo Rápido. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = resetUrl
        ? `Olá ${nome},\n\nVocê solicitou a redefinição de senha.\n\nAcesse o link abaixo para criar uma nova senha (válido por 1 hora):\n${resetUrl}\n\nDisparo Rápido`
        : `Olá ${nome},\n\nVocê solicitou a redefinição de senha.\n\nToken: ${resetToken}\n\nEste token expira em 1 hora.\n\nDisparo Rápido`;

      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Redefinir senha - Disparo Rápido',
        html: htmlContent,
        text: textContent,
      });

      this.logger.info('✅ Email de reset de senha enviado com sucesso', {
        to,
        messageId: info.messageId,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de reset de senha', err, { to });
      throw error;
    }
  }

  /**
   * Envia email de confirmação de cadastro (Disparo Rápido)
   */
  async sendEmailConfirmation(data: EmailConfirmationData): Promise<void> {
    const { to, nome, confirmationUrl } = data;

    this.logger.info('📧 Enviando email de confirmação', {
      to,
      nome,
    });

    // Se transporter não foi inicializado, apenas loga
    if (!this.transporter) {
      this.logger.warn('⚠️ Email transporter não disponível. Email não foi enviado.', { to });
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const verde = '#1d990c';
      const azul = '#2563eb';
      const azulClaro = '#eff6ff';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; }
            .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
            .header { background: ${azul}; color: white; padding: 28px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
            .content { padding: 28px 24px; }
            .button { display: inline-block; background: ${verde}; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 16px 0; }
            .footer { background: ${azulClaro}; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; }
            .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 6px; font-size: 13px; color: #92400e; }
          </style>
        </head>
        <body style="background: #f1f5f9; padding: 24px 16px;">
          <div class="container">
            <div class="header">
              <h1>Confirme seu email</h1>
              <p style="margin: 8px 0 0; opacity: 0.95;">Disparo Rápido</p>
            </div>
            <div class="content">
              <p>Olá, <strong>${nome}</strong>!</p>
              <p>Para ativar sua conta da Disparo Rápido, clique no botão abaixo:</p>
              <p style="margin: 24px 0 16px;">
                <a href="${confirmationUrl}" class="button">Confirmar email</a>
              </p>
              <p style="color: #64748b; font-size: 13px;">Ou copie e cole no navegador:</p>
              <p style="word-break: break-all; font-size: 12px; color: #475569;">${confirmationUrl}</p>
              <div class="warning">
                Este link expira em 24 horas. Se você não criou esta conta, ignore este email.
              </div>
              <p style="font-size: 13px; color: #64748b;">Dúvidas? <a href="https://wa.me/5516992933505" style="color: ${azul};">(16) 99293-3505</a></p>
            </div>
            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} Disparo Rápido. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Confirme seu email - Disparo Rápido',
        html: htmlContent,
        text: `Olá ${nome},\n\nPara ativar sua conta da Disparo Rápido, acesse o link: ${confirmationUrl}\n\nEste link expira em 24 horas.\n\nDúvidas? (16) 99293-3505\n\nDisparo Rápido`,
      });

      this.logger.info('✅ Email de confirmação enviado com sucesso', {
        to,
        messageId: info.messageId,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de confirmação', err, { to });
      throw error;
    }
  }

  /**
   * Envia email de renovação de assinatura / reativação (cliente que já tinha conta).
   * Template: "Sua assinatura foi renovada com sucesso!" com header branco e linha azul.
   */
  async sendAccountActivatedEmail(to: string, nome: string): Promise<void> {
    this.logger.info('📧 Enviando email de assinatura renovada (bem-vindo de volta)', { to, nome });

    if (!this.transporter) {
      this.logger.warn('⚠️ Email transporter não disponível. Email não foi enviado.', { to });
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const logoUrl = getEmailLogoUrl();
      const headerContent = logoUrl
        ? `<img src="${logoUrl}" alt="Disparo Rápido" style="max-height: 48px; width: auto; display: block; margin: 0 auto; border: 0;" />`
        : '<h1 style="color: #0056b3; margin: 0; font-size: 24px; letter-spacing: 1px;">🚀 Disparo Rápido</h1>';

      const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sua assinatura foi renovada com sucesso!</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, Arial; color: #333333; line-height: 1.6; }
        table { border-spacing: 0; width: 100%; }
        td { padding: 0; }
        img { border: 0; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-top: 40px; padding-bottom: 40px; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden; }
        .header { background-color: #ffffff; padding: 30px 20px; text-align: center; border-bottom: 3px solid #0056b3; }
        .header h1 { color: #0056b3; margin: 0; font-size: 24px; letter-spacing: 1px; }
        .content { padding: 40px 30px; }
        .content h2 { color: #2c3e50; font-size: 20px; margin-top: 0; margin-bottom: 20px; }
        .content p { font-size: 16px; color: #555555; margin-bottom: 20px; }
        .success-banner { background-color: #e8f5e9; border: 1px solid #a5d6a7; color: #2e7d32; padding: 15px; border-radius: 5px; text-align: center; font-weight: bold; margin-bottom: 25px; }
        .btn-container { text-align: center; margin: 35px 0; }
        .btn { background-color: #0056b3; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block; }
        .btn:hover { background-color: #004494; color: #ffffff !important; }
        .support-box { background-color: #f9f9f9; border-left: 4px solid #25D366; padding: 15px 20px; margin-top: 30px; border-radius: 0 4px 4px 0; }
        .support-box p { margin: 0; font-size: 15px; }
        .whatsapp-link { color: #25D366; text-decoration: none; font-weight: bold; }
        .footer { background-color: #f1f1f1; padding: 20px; text-align: center; font-size: 14px; color: #777777; }
        @media screen and (max-width: 600px) {
            .content { padding: 30px 20px !important; }
            .btn { display: block !important; width: 100% !important; box-sizing: border-box !important; }
        }
    </style>
</head>
<body>
    <center class="wrapper">
        <table class="main" width="100%">
            <tr>
                <td class="header">
                    ${headerContent}
                </td>
            </tr>
            <tr>
                <td class="content">
                    <h2>Olá, ${nome}!</h2>
                    <div class="success-banner">✅ Assinatura renovada com sucesso!</div>
                    <p>Boas notícias! O pagamento da sua assinatura foi confirmado e seu acesso à <strong>Disparo Rápido</strong> foi renovado automaticamente.</p>
                    <p>Estamos muito felizes em continuar essa parceria. Você já pode continuar aproveitando todos os recursos da ferramenta para escalar o seu negócio.</p>
                    <div class="btn-container">
                        <a href="${CHROME_WEB_STORE_URL}" class="btn" style="color: #ffffff !important; background-color: #0056b3; text-decoration: none;" target="_blank">Abrir a Extensão</a>
                    </div>
                    <div class="support-box">
                        <p><strong>Ficou com alguma dúvida ou precisa de suporte?</strong><br>Nossa equipe continua à sua total disposição:</p>
                        <p style="margin-top: 10px;">📱 WhatsApp: <a href="https://wa.me/5516992933505" class="whatsapp-link" target="_blank">(16) 99293-3505</a><br>📧 E-mail: <a href="mailto:contato@disparorapido.com.br" style="color: #0056b3; text-decoration: none; font-weight: bold;">contato@disparorapido.com.br</a></p>
                    </div>
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <p style="margin: 0; margin-bottom: 15px;">Muito obrigado por confiar em nosso trabalho!<br>Atenciosamente,<br><strong>Equipe Disparo Rápido</strong></p>
                    <p style="margin: 0; font-size: 12px; color: #aaaaaa;">&copy; ${new Date().getFullYear()} Disparo Rápido. Todos os direitos reservados.</p>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
      `.trim();

      await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Sua assinatura foi renovada com sucesso!',
        html: htmlContent,
        text: `Olá, ${nome}!\n\n✅ Assinatura renovada com sucesso!\n\nO pagamento da sua assinatura foi confirmado e seu acesso à Disparo Rápido foi renovado automaticamente.\n\nAbrir a extensão: ${CHROME_WEB_STORE_URL}\n\nSuporte: contato@disparorapido.com.br | WhatsApp (16) 99293-3505\n\nEquipe Disparo Rápido`,
      });

      this.logger.info('✅ Email de conta ativada enviado', { to });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de conta ativada', err, { to });
      throw error;
    }
  }

  /**
   * Enviar email de pagamento falho
   */
  async sendPaymentFailedEmail(to: string, empresaNome: string, paymentUrl?: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('⚠️ SMTP não está configurado. Email de falha de pagamento não será enviado.');
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const paymentLink = paymentUrl || 'https://disparorapido.com.br/checkout';
      const verde = '#1d990c';
      const azul = '#2563eb';
      const azulClaro = '#eff6ff';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; }
            .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
            .header { background: linear-gradient(135deg, ${verde} 0%, ${azul} 100%); color: white; padding: 28px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
            .content { padding: 28px 24px; }
            .button { display: inline-block; background: linear-gradient(135deg, ${verde} 0%, ${azul} 100%); color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 16px 0; }
            .footer { background: ${azulClaro}; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; }
            .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 6px; font-size: 13px; color: #92400e; }
          </style>
        </head>
        <body style="background: #f1f5f9; padding: 24px 16px;">
          <div class="container">
            <div class="header">
              <h1>Falha no pagamento</h1>
              <p style="margin: 8px 0 0; opacity: 0.95;">Disparo Rápido</p>
            </div>
            <div class="content">
              <p>Olá, <strong>${empresaNome}</strong>,</p>
              <p>Seu pagamento foi recusado. Tente novamente ou use outro método de pagamento.</p>
              <div class="warning">Clique no botão abaixo para tentar novamente.</div>
              <p style="margin: 24px 0 16px;"><a href="${paymentLink}" class="button">Tentar novamente</a></p>
              <p style="font-size: 13px; color: #64748b;">Problemas? <a href="mailto:suporte@disparorapido.com.br" style="color: ${azul};">suporte@disparorapido.com.br</a></p>
            </div>
            <div class="footer"><p style="margin: 0;">&copy; ${new Date().getFullYear()} Disparo Rápido.</p></div>
          </div>
        </body>
        </html>
      `;

      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: '❌ Falha no Pagamento - Disparo Rápido',
        html: htmlContent,
        text: `Olá ${empresaNome},\n\nSeu pagamento foi recusado.\n\nPor favor, tente novamente em: ${paymentLink}\n\nDisparo Rápido`,
      });

      this.logger.info('✅ Email de falha de pagamento enviado', { to, messageId: info.messageId });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de falha de pagamento', err, { to });
      throw error;
    }
  }

  /**
   * Enviar email de pendência de pagamento (PAYMENT_OVERDUE).
   * Template: "Aviso Importante: Pendência de Pagamento" com header branco e linha azul.
   */
  async sendSubscriptionOverdueEmail(to: string, empresaNome: string, _daysOverdue?: number): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('⚠️ SMTP não está configurado. Email de pendência não será enviado.');
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const logoUrl = getEmailLogoUrl();
      const crmUrl = 'https://crm.disparorapido.com.br';
      const headerContent = logoUrl
        ? `<img src="${logoUrl}" alt="Disparo Rápido" style="max-width: 260px; height: auto; display: block; margin: 0 auto; border: 0;" />`
        : '<h1 style="color: #0056b3; margin: 0; font-size: 24px; letter-spacing: 1px;">🚀 Disparo Rápido</h1>';

      const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aviso Importante: Pendência de Pagamento</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, Arial; color: #333333; line-height: 1.6; }
        table { border-spacing: 0; width: 100%; }
        td { padding: 0; }
        img { border: 0; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-top: 40px; padding-bottom: 40px; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden; }
        .header { background-color: #ffffff; padding: 30px 20px; text-align: center; border-bottom: 4px solid #0056b3; }
        .header h1 { color: #0056b3; margin: 0; font-size: 24px; letter-spacing: 1px; }
        .content { padding: 40px 30px; }
        .content h2 { color: #2c3e50; font-size: 20px; margin-top: 0; margin-bottom: 20px; }
        .content p { font-size: 16px; color: #555555; margin-bottom: 20px; }
        .warning-banner { background-color: #fff3cd; border: 1px solid #ffe69c; color: #856404; padding: 15px; border-radius: 5px; text-align: center; font-weight: bold; margin-bottom: 25px; }
        .steps-box { background-color: #f8f9fa; border: 1px dashed #ced4da; padding: 20px; margin: 25px 0; border-radius: 5px; }
        .steps-box p { margin-bottom: 10px; color: #333; }
        .btn-container { text-align: center; margin: 35px 0; }
        .btn { background-color: #d9534f; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block; }
        .btn:hover { background-color: #c9302c; color: #ffffff !important; }
        .support-box { background-color: #f9f9f9; border-left: 4px solid #0056b3; padding: 15px 20px; margin-top: 30px; border-radius: 0 4px 4px 0; }
        .support-box p { margin: 0; font-size: 15px; }
        .whatsapp-link { color: #25D366; text-decoration: none; font-weight: bold; }
        .footer { background-color: #f1f1f1; padding: 20px; text-align: center; font-size: 14px; color: #777777; }
        @media screen and (max-width: 600px) {
            .content { padding: 30px 20px !important; }
            .btn { display: block !important; width: 100% !important; box-sizing: border-box !important; }
        }
    </style>
</head>
<body>
    <center class="wrapper">
        <table class="main" width="100%">
            <tr>
                <td class="header">
                    ${headerContent}
                </td>
            </tr>
            <tr>
                <td class="content">
                    <h2>Olá, ${empresaNome}.</h2>
                    <div class="warning-banner">⚠️ Pendência em sua assinatura</div>
                    <p>Ainda não identificamos o pagamento da sua última fatura na <strong>Disparo Rápido</strong>.</p>
                    <p>Para evitar a interrupção dos seus envios, preparamos um passo a passo simples para você regularizar sua situação:</p>
                    <div class="steps-box">
                        <p><strong>Como regularizar sua conta:</strong></p>
                        <ol style="margin: 0; padding-left: 20px; color: #555; font-size: 15px;">
                            <li style="margin-bottom: 8px;">Acesse o nosso painel: <strong>crm.disparorapido.com.br</strong></li>
                            <li style="margin-bottom: 8px;">Faça login com seu e-mail e senha cadastrados.</li>
                            <li style="margin-bottom: 8px;">No menu lateral esquerdo, clique na aba <strong>Assinatura</strong>.</li>
                            <li style="margin-bottom: 0;">Localize seu plano e clique em <strong>Regularizar / Pagar com cartão</strong>.</li>
                        </ol>
                    </div>
                    <div class="btn-container">
                        <a href="${crmUrl}" class="btn" style="color: #ffffff !important; background-color: #d9534f; text-decoration: none;" target="_blank">Regularizar Pagamento</a>
                    </div>
                    <p style="font-size: 14px; color: #777; text-align: center;"><em>Caso já tenha efetuado o pagamento nas últimas 48 horas, por favor, desconsidere este aviso.</em></p>
                    <div class="support-box">
                        <p><strong>Precisa de ajuda com o pagamento?</strong><br>Nossa equipe está à disposição:</p>
                        <p style="margin-top: 10px;">📱 WhatsApp: <a href="https://wa.me/5516992933505" class="whatsapp-link" target="_blank">(16) 99293-3505</a><br>📧 E-mail: <a href="mailto:contato@disparorapido.com.br" style="color: #0056b3; text-decoration: none; font-weight: bold;">contato@disparorapido.com.br</a></p>
                    </div>
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <p style="margin: 0; margin-bottom: 15px;">Atenciosamente,<br><strong>Equipe Disparo Rápido</strong></p>
                    <p style="margin: 0; font-size: 12px; color: #aaaaaa;">&copy; ${new Date().getFullYear()} Disparo Rápido. Todos os direitos reservados.</p>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
      `.trim();

      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Aviso Importante: Pendência de Pagamento',
        html: htmlContent,
        text: `Olá, ${empresaNome}.\n\n⚠️ Pendência em sua assinatura\n\nAinda não identificamos o pagamento da sua última fatura na Disparo Rápido.\n\nComo regularizar: acesse crm.disparorapido.com.br → Assinatura → Regularizar / Pagar com cartão.\n\nRegularizar: ${crmUrl}\n\nSuporte: contato@disparorapido.com.br | WhatsApp (16) 99293-3505\n\nEquipe Disparo Rápido`,
      });

      this.logger.info('✅ Email de pendência de pagamento enviado', { to, messageId: info.messageId });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de pendência', err, { to });
      throw error;
    }
  }

  /**
   * Enviar email de conta suspensa
   */
  async sendAccountSuspendedEmail(to: string, empresaNome: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('⚠️ SMTP não está configurado. Email de suspensão não será enviado.');
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const reactivateLink = 'https://disparorapido.com.br/checkout';
      const verde = '#1d990c';
      const azul = '#2563eb';
      const azulClaro = '#eff6ff';

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; }
            .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
            .header { background: linear-gradient(135deg, ${verde} 0%, ${azul} 100%); color: white; padding: 28px 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
            .content { padding: 28px 24px; }
            .button { display: inline-block; background: linear-gradient(135deg, ${verde} 0%, ${azul} 100%); color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 16px 0; }
            .footer { background: ${azulClaro}; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; }
            .alert { background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0; border-radius: 6px; font-size: 13px; color: #991b1b; }
          </style>
        </head>
        <body style="background: #f1f5f9; padding: 24px 16px;">
          <div class="container">
            <div class="header">
              <h1>Conta suspensa</h1>
              <p style="margin: 8px 0 0; opacity: 0.95;">Disparo Rápido</p>
            </div>
            <div class="content">
              <p>Olá, <strong>${empresaNome}</strong>,</p>
              <p>Sua conta foi suspensa por falta de pagamento. Reative para voltar a usar a extensão.</p>
              <div class="alert">Acesso bloqueado até a reativação.</div>
              <p style="margin: 24px 0 16px;"><a href="${reactivateLink}" class="button">Reativar conta</a></p>
              <p style="font-size: 13px; color: #64748b;">Dúvidas? <a href="mailto:suporte@disparorapido.com.br" style="color: ${azul};">suporte@disparorapido.com.br</a></p>
            </div>
            <div class="footer"><p style="margin: 0;">&copy; ${new Date().getFullYear()} Disparo Rápido.</p></div>
          </div>
        </body>
        </html>
      `;

      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: '🚫 Sua Conta foi Suspensa - Disparo Rápido',
        html: htmlContent,
        text: `Olá ${empresaNome},\n\nSua conta foi suspensa por falta de pagamento.\n\nReative agora em: ${reactivateLink}\n\nDisparo Rápido`,
      });

      this.logger.info('✅ Email de suspensão enviado', { to, messageId: info.messageId });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de suspensão', err, { to });
      throw error;
    }
  }

  /**
   * Enviar email de confirmação de cancelamento de assinatura (SUBSCRIPTION_DELETED).
   * Template: "Confirmação de Cancelamento de Assinatura" com header branco e linha azul.
   */
  async sendSubscriptionCancelledEmail(to: string, empresaNome: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('⚠️ SMTP não está configurado. Email de cancelamento não será enviado.');
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const logoUrl = getEmailLogoUrl();
      const crmUrl = 'https://crm.disparorapido.com.br';
      const headerContent = logoUrl
        ? `<img src="${logoUrl}" alt="Disparo Rápido" style="max-width: 260px; height: auto; display: block; margin: 0 auto; border: 0;" />`
        : '<h1 style="color: #0056b3; margin: 0; font-size: 24px; letter-spacing: 1px;">🚀 Disparo Rápido</h1>';

      const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmação de Cancelamento de Assinatura</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, Arial; color: #333333; line-height: 1.6; }
        table { border-spacing: 0; width: 100%; }
        td { padding: 0; }
        img { border: 0; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f6; padding-top: 40px; padding-bottom: 40px; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); overflow: hidden; }
        .header { background-color: #ffffff; padding: 30px 20px; text-align: center; border-bottom: 4px solid #0056b3; }
        .header h1 { color: #0056b3; margin: 0; font-size: 24px; letter-spacing: 1px; }
        .content { padding: 40px 30px; }
        .content h2 { color: #2c3e50; font-size: 20px; margin-top: 0; margin-bottom: 20px; }
        .content p { font-size: 16px; color: #555555; margin-bottom: 20px; }
        .cancel-banner { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px; text-align: center; font-weight: bold; margin-bottom: 25px; }
        .reactivate-box { background-color: #f0f7ff; border: 1px solid #cce5ff; padding: 20px; border-radius: 5px; margin-top: 30px; }
        .reactivate-box h3 { color: #004085; margin-top: 0; font-size: 18px; }
        .steps-list { padding-left: 20px; color: #004085; margin-bottom: 20px; font-size: 15px; }
        .steps-list li { margin-bottom: 8px; }
        .btn-container { text-align: center; margin: 25px 0 10px 0; }
        .btn { background-color: #0056b3; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block; }
        .btn:hover { background-color: #004494; color: #ffffff !important; }
        .support-box { background-color: #f9f9f9; border-left: 4px solid #777777; padding: 15px 20px; margin-top: 30px; border-radius: 0 4px 4px 0; }
        .support-box p { margin: 0; font-size: 15px; }
        .whatsapp-link { color: #25D366; text-decoration: none; font-weight: bold; }
        .footer { background-color: #f1f1f1; padding: 20px; text-align: center; font-size: 14px; color: #777777; }
        @media screen and (max-width: 600px) {
            .content { padding: 30px 20px !important; }
            .btn { display: block !important; width: 100% !important; box-sizing: border-box !important; }
        }
    </style>
</head>
<body>
    <center class="wrapper">
        <table class="main" width="100%">
            <tr>
                <td class="header">
                    ${headerContent}
                </td>
            </tr>
            <tr>
                <td class="content">
                    <h2>Olá, ${empresaNome}.</h2>
                    <div class="cancel-banner">Sua assinatura foi cancelada.</div>
                    <p>Confirmamos que o cancelamento da sua assinatura da <strong>Disparo Rápido</strong> foi processado com sucesso. Sentimos muito em ver você partir!</p>
                    <p>Lembramos que o seu acesso continuará ativo até o final do período que já foi pago. Após essa data, as funcionalidades exclusivas serão bloqueadas.</p>
                    <div class="reactivate-box">
                        <h3>Mudou de ideia?</h3>
                        <p style="margin-top: 0; color: #004085; font-size: 15px;">Se você cancelou por engano ou decidiu voltar a turbinar suas vendas com a nossa ferramenta, é muito fácil reverter:</p>
                        <ol class="steps-list">
                            <li>Acesse o seu <strong>Painel do Cliente</strong>.</li>
                            <li>Faça o login com seu e-mail e senha.</li>
                            <li>Vá até a aba <strong>"Assinatura"</strong>.</li>
                            <li>Clique no botão <strong>"Reativar a assinatura"</strong>.</li>
                        </ol>
                        <div class="btn-container">
                            <a href="${crmUrl}" class="btn" style="color: #ffffff !important; background-color: #0056b3; text-decoration: none;" target="_blank">Acessar Painel do Cliente</a>
                        </div>
                    </div>
                    <div class="support-box">
                        <p><strong>Tem algum feedback para nós ou precisa de ajuda?</strong><br>Nossa equipe está sempre à disposição:</p>
                        <p style="margin-top: 10px;">📱 WhatsApp: <a href="https://wa.me/5516992933505" class="whatsapp-link" target="_blank">(16) 99293-3505</a><br>📧 E-mail: <a href="mailto:contato@disparorapido.com.br" style="color: #0056b3; text-decoration: none; font-weight: bold;">contato@disparorapido.com.br</a></p>
                    </div>
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <p style="margin: 0; margin-bottom: 15px;">Agradecemos pelo tempo que passamos juntos. As portas estarão sempre abertas!<br><br>Atenciosamente,<br><strong>Equipe Disparo Rápido</strong></p>
                    <p style="margin: 0; font-size: 12px; color: #aaaaaa;">&copy; ${new Date().getFullYear()} Disparo Rápido. Todos os direitos reservados.</p>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
      `.trim();

      const info = await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Confirmação de Cancelamento de Assinatura',
        html: htmlContent,
        text: `Olá, ${empresaNome}.\n\nSua assinatura foi cancelada.\n\nConfirmamos que o cancelamento da sua assinatura da Disparo Rápido foi processado com sucesso.\n\nAcesse o painel para reativar: ${crmUrl}\n\nSuporte: contato@disparorapido.com.br | WhatsApp (16) 99293-3505\n\nEquipe Disparo Rápido`,
      });

      this.logger.info('✅ Email de cancelamento de assinatura enviado', { to, messageId: info.messageId });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de cancelamento', err, { to });
      throw error;
    }
  }

  /**
   * Envia o arquivo de leads comprado (CSV compatível com Excel) por email.
   */
  async sendLeadPurchaseDeliveryEmail(data: LeadPurchaseDeliveryEmailData): Promise<void> {
    const { to, nome, state, segment, quantity, totalPaid, attachments } = data;

    if (!this.transporter) {
      this.logger.warn('⚠️ SMTP não está configurado. Email de entrega de leads não será enviado.', { to });
      return;
    }

    try {
      const smtpConfig = getSmtpConfig();
      const formattedTotal = totalPaid.toFixed(2).replace('.', ',');
      const leadRapidoLogoUrl = process.env.LEADRAPIDO_EMAIL_LOGO_URL?.trim() || 'https://leadrapido.com.br/images/logo-email.png';
      const leadRapidoDownloadUrl = process.env.LEADRAPIDO_DOWNLOAD_URL?.trim() || 'https://leadrapido.com.br';

      const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sua Lista de Leads chegou! - Lead Rápido</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f7f9; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; color: #333; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f9; padding: 40px 0; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; color: #4a4a4a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(30, 58, 138, 0.1); }
    .header { background-color: #ffffff; padding: 40px 20px 30px 20px; text-align: center; border-bottom: 1px solid #f0f4f8; }
    .logo { max-width: 220px; height: auto; display: inline-block; }
    .content { padding: 40px 40px 30px 40px; line-height: 1.6; }
    .greeting { font-size: 22px; font-weight: 800; color: #1e3a8a; margin-bottom: 15px; }
    .intro-text { font-size: 16px; color: #555; margin-bottom: 30px; }
    .summary-title { font-size: 13px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .info-box { background-color: #f8fafc; border-radius: 12px; padding: 25px; margin-bottom: 35px; border: 1px solid #e2e8f0; }
    .info-item { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; }
    .info-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .label { font-weight: 600; color: #64748b; font-size: 14px; }
    .value { font-weight: 700; color: #1e3a8a; font-size: 15px; text-align: right; }
    .button-container { text-align: center; margin-bottom: 35px; }
    .btn-download { background-color: #2563eb; color: #ffffff !important; padding: 18px 35px; text-decoration: none; font-weight: 800; font-size: 16px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3); }
    .attachment-note { text-align: center; font-size: 14px; color: #64748b; margin-bottom: 25px; padding: 15px; background-color: #eff6ff; border-radius: 8px; }
    .partners-box { border-top: 1px solid #f1f5f9; padding-top: 30px; margin-top: 20px; }
    .partner-link { display: block; font-size: 14px; color: #2563eb; text-decoration: none; font-weight: 600; margin-bottom: 5px; }
    .footer { text-align: center; padding: 40px; font-size: 12px; color: #94a3b8; background-color: #f8fafc; }
    .signature { font-weight: 700; color: #1e3a8a; margin-top: 5px; }
    @media screen and (max-width: 600px) {
      .main { border-radius: 0; }
      .content { padding: 30px 20px; }
      .info-item { flex-direction: column; text-align: left; }
      .value { text-align: left; margin-top: 4px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" align="center">
      <tr>
        <td class="header">
          <img src="${leadRapidoLogoUrl}" alt="Lead Rápido" class="logo" />
        </td>
      </tr>
      <tr>
        <td class="content">
          <div class="greeting">Suas oportunidades chegaram, ${nome}!</div>
          <p class="intro-text">Tudo pronto! A sua lista de leads personalizados foi gerada com sucesso e já está disponível para impulsionar suas vendas.</p>

          <div class="summary-title">Resumo da sua lista:</div>
          <div class="info-box">
            <div class="info-item">
              <span class="label">Segmento:</span>
              <span class="value">${segment}</span>
            </div>
            <div class="info-item">
              <span class="label">Localização:</span>
              <span class="value">${state}</span>
            </div>
            <div class="info-item">
              <span class="label">Quantidade:</span>
              <span class="value">${quantity} leads</span>
            </div>
            <div class="info-item">
              <span class="label">Investimento:</span>
              <span class="value">R$ ${formattedTotal}</span>
            </div>
            <div class="info-item">
              <span class="label">Dados inclusos:</span>
              <span class="value">Tel, E-mail, Site e WhatsApp</span>
            </div>
          </div>

          <div class="button-container">
            <a href="${leadRapidoDownloadUrl}" class="btn-download">BAIXAR PLANILHA DE LEADS</a>
          </div>

          <div class="attachment-note">
            📎 Sua planilha já está anexada neste e-mail.<br/>
            💡 <strong>Dica Comercial:</strong> Suba essa lista no seu CRM para organizar a abordagem e aumentar sua taxa de conversão.
          </div>

          <div class="partners-box">
            <p style="font-size: 13px; color: #475569; margin-bottom: 10px;"><strong>Turbine seus resultados:</strong></p>
            <a href="https://www.disparorapido.com.br" class="partner-link">🚀 Disparo Rápido: Envie mensagens automáticas para essa lista</a>
            <a href="https://publix.ia.br" class="partner-link">🤖 Publix CRM: Organize seus leads com Inteligência Artificial</a>
          </div>
        </td>
      </tr>
      <tr>
        <td class="footer">
          <div class="signature">contato@leadrapido.com.br</div>
          <p style="margin-top: 15px;">
            <strong>M F SILVA TECNOLOGIA DA INFORMAÇÃO LTDA</strong><br/>
            CNPJ: 35.185.351/0001-07<br/>
            Franca - SP
          </p>
          <p style="margin-top: 20px;">&copy; ${new Date().getFullYear()} Lead Rápido. Todos os direitos reservados.</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
      `;

      await this.transporter.sendMail({
        from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
        to,
        subject: 'Sua Lista de Leads chegou! - Lead Rápido',
        html: htmlContent,
        text:
          `Suas oportunidades chegaram, ${nome}!\n\n` +
          `Sua lista de leads foi gerada com sucesso.\n` +
          `Segmento: ${segment}\n` +
          `Localização: ${state}\n` +
          `Quantidade: ${quantity} leads\n` +
          `Investimento: R$ ${formattedTotal}\n\n` +
          `A planilha está anexada neste email.\n` +
          `Acesse também: ${leadRapidoDownloadUrl}\n\n` +
          `contato@leadrapido.com.br`,
        attachments,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Erro ao enviar email de entrega de leads', err, { to });
      throw err;
    }
  }
}
