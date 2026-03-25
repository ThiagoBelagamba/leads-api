/**
 * SMTP Configuration for Hostinger
 * Email: contato@disparorapido.com.br
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  fromName: string;
  fromEmail: string;
}

export const getSmtpConfig = (): SmtpConfig => {
  const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpUser = process.env.SMTP_USER || 'contato@disparorapido.com.br';
  // Remove aspas simples ou duplas da senha se existirem
  let smtpPass = process.env.SMTP_PASSWORD || '';
  if (smtpPass.startsWith("'") && smtpPass.endsWith("'")) {
    smtpPass = smtpPass.slice(1, -1);
  } else if (smtpPass.startsWith('"') && smtpPass.endsWith('"')) {
    smtpPass = smtpPass.slice(1, -1);
  }
  const smtpFromName = process.env.SMTP_FROM_NAME || 'Disparo Rápido';
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;

  if (!smtpPass) {
    console.warn('⚠️  SMTP_PASSWORD não configurada! Emails de confirmação não serão enviados.');
  }

  return {
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    from: smtpFromEmail,
    fromName: smtpFromName,
    fromEmail: smtpFromEmail,
  };
};
