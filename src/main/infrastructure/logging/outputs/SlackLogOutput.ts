import os from 'os';
import { LogContext, LogEntry, LogLevel, LogOutput } from '../Logger';

type SlackCategory = 'critical' | 'usage' | 'business';

interface SlackChannel {
  id: SlackCategory;
  webhookUrl: string;
  name: string;
  emoji: string;
}

interface SlackAttachmentField {
  title: string;
  value: string;
  short: boolean;
}

const SENSITIVE_KEYS = [
  'password',
  'senha',
  'secret',
  'secreto',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'refreshToken',
  'jwt',
  'authorization',
  'creditCard',
  'cardNumber',
  'card_number',
  'cvv',
  'webhookUrl',
];

const DEFAULT_TIMEOUT_MS = 5000;
const SLOW_HTTP_THRESHOLD_MS = 3000;
const SLOW_USECASE_THRESHOLD_MS = 2000;
const DEFAULT_STRING_LIMIT = 100;
const CONTEXT_FIELD_LIMIT = 700;
const STACK_TRACE_LIMIT = 5;
const DEFAULT_BOT_USERNAME = process.env.SLACK_BOT_USERNAME?.trim() || 'LeanQuality Bot';

export class SlackLogOutput implements LogOutput {
  private readonly enabled: boolean;
  private readonly channels: Map<SlackCategory, SlackChannel>;
  private readonly fetchFn?: typeof fetch;
  private readonly timeoutMs: number;

  constructor(fetchFn?: typeof fetch, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.fetchFn = fetchFn ?? globalThis.fetch;
    this.timeoutMs = timeoutMs;
    this.channels = new Map();

    const enabledFlag = String(process.env.SLACK_NOTIFICATIONS_ENABLED ?? '').toLowerCase();
    const requestedEnabled = enabledFlag === 'true' || enabledFlag === '1';

    const criticalWebhook = (process.env.SLACK_WEBHOOK_CRITICAL ?? '').trim();
    const usageWebhook = (process.env.SLACK_WEBHOOK_USAGE ?? '').trim();
    const businessWebhook = (process.env.SLACK_WEBHOOK_BUSINESS ?? '').trim();

    if (criticalWebhook) {
      this.channels.set('critical', {
        id: 'critical',
        webhookUrl: criticalWebhook,
        name: '#alerts-critical',
        emoji: '🚨',
      });
    }

    if (usageWebhook) {
      this.channels.set('usage', {
        id: 'usage',
        webhookUrl: usageWebhook,
        name: '#system-usage',
        emoji: '📊',
      });
    }

    if (businessWebhook) {
      this.channels.set('business', {
        id: 'business',
        webhookUrl: businessWebhook,
        name: '#business-insights',
        emoji: '💼',
      });
    }

    const hasAllRequiredChannels = Boolean(criticalWebhook && usageWebhook && businessWebhook);
    this.enabled = requestedEnabled && hasAllRequiredChannels && !!this.fetchFn;

    if (requestedEnabled && !this.enabled) {
      console.warn(
        '[SlackLogOutput] Slack notifications requested but disabled due to missing configuration (webhooks or fetch API).'
      );
    }

    // Log de diagnóstico para validar URLs configuradas
    if (this.enabled) {
      const validateWebhookUrl = (url: string, channel: string): void => {
        if (!url.startsWith('https://hooks.slack.com/services/')) {
          console.error(
            `[SlackLogOutput] ⚠️ Invalid webhook URL for ${channel}. Expected format: https://hooks.slack.com/services/T.../B.../... Got: ${url.substring(0, 50)}...`
          );
        }
      };
      validateWebhookUrl(criticalWebhook, 'CRITICAL');
      validateWebhookUrl(usageWebhook, 'USAGE');
      validateWebhookUrl(businessWebhook, 'BUSINESS');

      console.info('[SlackLogOutput] ✅ Slack notifications enabled with 3 channels configured.');
    }
  }

  async write(entry: LogEntry): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const channel = this.categorizeLogEntry(entry);
    if (!channel) {
      return;
    }

    const sanitizedContext = this.sanitizeContext(entry.context ?? {});
    const safeEntry: LogEntry = {
      ...entry,
      context: sanitizedContext,
    };

    const message = this.formatSlackMessage(safeEntry, channel);
    if (!message) {
      return;
    }

    await this.sendToSlack(channel.webhookUrl, message);
  }

  protected categorizeLogEntry(entry: LogEntry): SlackChannel | null {
    const context = entry.context ?? {};

    if (this.getBooleanContextValue(context, 'businessEvent')) {
      return this.channels.get('business') ?? null;
    }

    if (entry.level >= LogLevel.ERROR) {
      return this.channels.get('critical') ?? null;
    }

    const severity = this.getStringContextValue(context, 'severity');
    if (severity && (severity.toLowerCase() === 'critical' || severity.toLowerCase() === 'high')) {
      return this.channels.get('critical') ?? null;
    }

    const component = this.getComponentName(entry, context);
    if (component === 'security') {
      return this.channels.get('critical') ?? null;
    }

    const statusCode = this.getNumericContextValue(context, 'statusCode');
    if (component === 'http' && typeof statusCode === 'number' && statusCode >= 500) {
      return this.channels.get('critical') ?? null;
    }

    const duration = this.getDuration(entry, context);

    if (component === 'http') {
      const isSlowHttp = typeof duration === 'number' && duration > SLOW_HTTP_THRESHOLD_MS;
      const isClientError = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;

      if (isSlowHttp || isClientError) {
        return this.channels.get('usage') ?? null;
      }

      if (!isSlowHttp && !isClientError) {
        return null;
      }
    }

    if (component === 'usecase') {
      const success = this.getBooleanContextValue(context, 'success');
      const isSlowUseCase = typeof duration === 'number' && duration > SLOW_USECASE_THRESHOLD_MS;

      if (isSlowUseCase || success === false) {
        return this.channels.get('usage') ?? null;
      }

      if (success === true && !isSlowUseCase) {
        return null;
      }
    }

    if (['performance', 'database', 'externalservice', 'external_service', 'external-service'].includes(component)) {
      return this.channels.get('usage') ?? null;
    }

    if (entry.level === LogLevel.WARNING) {
      return this.channels.get('usage') ?? null;
    }

    return null;
  }

  private getComponentName(entry: LogEntry, context: LogContext): string {
    const component = entry.component ?? this.getStringContextValue(context, 'component');
    return component ? String(component).toLowerCase() : '';
  }

  private getDuration(entry: LogEntry, context: LogContext): number | undefined {
    if (typeof entry.duration === 'number') {
      return entry.duration;
    }

    const contextDuration = context.duration;
    if (typeof contextDuration === 'number') {
      return contextDuration;
    }

    if (typeof contextDuration === 'string') {
      const parsed = Number(contextDuration);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private getNumericContextValue(context: LogContext, key: keyof LogContext): number | undefined {
    const value = context[key];
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private getBooleanContextValue(context: LogContext, key: keyof LogContext): boolean | undefined {
    const value = context[key];
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lowered = value.toLowerCase();
      if (lowered === 'true') return true;
      if (lowered === 'false') return false;
    }

    return undefined;
  }

  private getStringContextValue(context: LogContext, key: keyof LogContext): string | undefined {
    const value = context[key];
    return typeof value === 'string' ? value : undefined;
  }

  protected formatSlackMessage(entry: LogEntry, channel: SlackChannel): Record<string, unknown> | null {
    const context = entry.context ?? {};
    const fields: SlackAttachmentField[] = [];
    const usedContextKeys = new Set<string>();

    const timestamp = entry.timestamp.toISOString();
    this.pushField(fields, usedContextKeys, 'Timestamp', timestamp, { short: true });

    const componentDisplay = entry.component ?? this.getStringContextValue(context, 'component');
    if (componentDisplay) {
      this.pushField(fields, usedContextKeys, 'Component', componentDisplay, {
        short: true,
        contextKey: 'component',
      });
    }

    const operationDisplay = entry.operation ?? this.getStringContextValue(context, 'operation');
    if (operationDisplay) {
      this.pushField(fields, usedContextKeys, 'Operation', operationDisplay, {
        short: true,
        contextKey: 'operation',
      });
    }

    const duration = this.getDuration(entry, context);
    const durationValue = this.formatDurationValue(duration, componentDisplay ?? '');
    if (durationValue) {
      this.pushField(fields, usedContextKeys, 'Duration', durationValue, {
        short: true,
        contextKey: 'duration',
        preformatted: true,
      });
    }

    const userId =
      entry.userId ?? this.getStringContextValue(context, 'userId') ?? this.getStringContextValue(context, 'user_id');
    if (userId) {
      this.pushField(fields, usedContextKeys, 'User ID', userId, { short: true, contextKey: 'userId' });
      usedContextKeys.add('user_id');
    }

    const empresaId =
      this.getStringContextValue(context, 'empresaId') ?? this.getStringContextValue(context, 'empresa_id');
    if (empresaId) {
      this.pushField(fields, usedContextKeys, 'Empresa ID', empresaId, { short: true, contextKey: 'empresaId' });
      usedContextKeys.add('empresa_id');
    }

    // Nome da empresa para identificação humana (prioridade sobre IDs)
    const empresaNome =
      this.getStringContextValue(context, 'empresaNome') ?? this.getStringContextValue(context, 'empresa_nome');
    if (empresaNome) {
      this.pushField(fields, usedContextKeys, '🏢 Empresa', empresaNome, { short: true, contextKey: 'empresaNome' });
      usedContextKeys.add('empresa_nome');
    }

    // Email do usuário para identificação humana
    const userEmail =
      this.getStringContextValue(context, 'userEmail') ?? this.getStringContextValue(context, 'user_email');
    if (userEmail) {
      this.pushField(fields, usedContextKeys, '📧 Usuário', userEmail, { short: true, contextKey: 'userEmail' });
      usedContextKeys.add('user_email');
    }

    const requestId = entry.requestId ?? this.getStringContextValue(context, 'requestId');
    if (requestId) {
      this.pushField(fields, usedContextKeys, 'Request ID', requestId, { short: true, contextKey: 'requestId' });
    }

    const traceId =
      entry.traceId ??
      this.getStringContextValue(context, 'traceId') ??
      this.getStringContextValue(context, 'trace_id');
    if (traceId) {
      this.pushField(fields, usedContextKeys, 'Trace ID', traceId, { short: true, contextKey: 'traceId' });
      usedContextKeys.add('trace_id');
    }

    const spanId =
      entry.spanId ?? this.getStringContextValue(context, 'spanId') ?? this.getStringContextValue(context, 'span_id');
    if (spanId) {
      this.pushField(fields, usedContextKeys, 'Span ID', spanId, { short: true, contextKey: 'spanId' });
      usedContextKeys.add('span_id');
    }

    const method = this.getStringContextValue(context, 'method');
    if (method) {
      this.pushField(fields, usedContextKeys, 'Method', method, { short: true, contextKey: 'method' });
    }

    const statusCode = this.getNumericContextValue(context, 'statusCode');
    const statusCodeValue = this.formatStatusCode(statusCode);
    if (statusCodeValue) {
      this.pushField(fields, usedContextKeys, 'Status Code', statusCodeValue, {
        short: true,
        contextKey: 'statusCode',
        preformatted: true,
      });
    }

    const url = this.getStringContextValue(context, 'url');
    if (url) {
      this.pushField(fields, usedContextKeys, 'URL', url, { short: false, contextKey: 'url', maxLength: 120 });
    }

    const success = this.getBooleanContextValue(context, 'success');
    const successValue = this.formatSuccess(success);
    if (successValue) {
      this.pushField(fields, usedContextKeys, 'Success', successValue, {
        short: true,
        contextKey: 'success',
        preformatted: true,
      });
    }

    if (this.getBooleanContextValue(context, 'businessEvent')) {
      usedContextKeys.add('businessEvent');
      const eventType =
        this.getStringContextValue(context, 'eventType') ?? this.getStringContextValue(context, 'event_type');
      if (eventType) {
        this.pushField(fields, usedContextKeys, 'Event Type', eventType, {
          short: true,
          contextKey: 'eventType',
        });
        usedContextKeys.add('event_type');
      }

      const amount = this.getNumericContextValue(context, 'amount');
      if (typeof amount === 'number') {
        this.pushField(fields, usedContextKeys, 'Amount', this.formatCurrency(amount), {
          short: true,
          contextKey: 'amount',
          preformatted: true,
        });
      }

      const plan = this.getStringContextValue(context, 'plan');
      if (plan) {
        this.pushField(fields, usedContextKeys, 'Plan', plan, { short: true, contextKey: 'plan' });
      }
      // empresaNome agora é adicionado globalmente acima, não precisa duplicar aqui
    }

    if (entry.error) {
      this.pushField(fields, usedContextKeys, 'Error', this.prepareFieldValue(entry.error.message, 300), {
        short: false,
        preformatted: true,
      });

      const stackTrace = this.formatStackTrace(entry.error.stack);
      if (stackTrace) {
        this.pushField(fields, usedContextKeys, 'Stack Trace', `\`\`\`${stackTrace}\`\`\``, {
          short: false,
          preformatted: true,
        });
        usedContextKeys.add('stack');
      }

      usedContextKeys.add('error');
    } else {
      const errorMessage = this.getStringContextValue(context, 'errorMessage');
      if (errorMessage) {
        this.pushField(fields, usedContextKeys, 'Error', errorMessage, { short: false, contextKey: 'errorMessage' });
      }
    }

    const remainingContext = this.buildRemainingContext(context, usedContextKeys);
    if (remainingContext) {
      fields.push({ title: 'Context', value: `\`\`\`${remainingContext}\`\`\``, short: false });
    }

    const iconEmoji = channel.id === 'business' ? this.getBusinessEventEmoji(context) : channel.emoji;
    const attachment = {
      color: this.getAttachmentColor(channel.id, entry, context),
      title: this.formatTitle(entry, channel, iconEmoji),
      text: this.prepareFieldValue(entry.message, 180),
      fields,
      footer: this.buildFooter(),
      ts: Math.floor(entry.timestamp.getTime() / 1000),
      mrkdwn_in: ['fields', 'text'] as const,
    };

    return {
      username: DEFAULT_BOT_USERNAME,
      icon_emoji: iconEmoji,
      attachments: [attachment],
    };
  }

  private pushField(
    fields: SlackAttachmentField[],
    usedContextKeys: Set<string>,
    title: string,
    value: unknown,
    options: {
      short?: boolean;
      contextKey?: string;
      maxLength?: number;
      preformatted?: boolean;
    } = {}
  ): void {
    if (value === undefined || value === null) {
      return;
    }

    const { short = true, contextKey, maxLength = DEFAULT_STRING_LIMIT, preformatted = false } = options;

    let finalValue: string;
    if (preformatted) {
      finalValue = typeof value === 'string' ? value : String(value);
    } else {
      finalValue = this.prepareFieldValue(value, maxLength);
    }

    if (!finalValue) {
      return;
    }

    fields.push({ title, value: finalValue, short });

    if (contextKey) {
      usedContextKeys.add(contextKey);
    }
  }

  private prepareFieldValue(value: unknown, maxLength: number = DEFAULT_STRING_LIMIT): string {
    if (value === undefined || value === null) {
      return '';
    }

    let stringValue: string;

    if (typeof value === 'string') {
      stringValue = value;
    } else if (typeof value === 'number' || typeof value === 'bigint') {
      stringValue = value.toString();
    } else if (typeof value === 'boolean') {
      stringValue = value ? 'true' : 'false';
    } else if (value instanceof Date) {
      stringValue = value.toISOString();
    } else {
      stringValue = JSON.stringify(value);
    }

    return this.truncateString(stringValue, maxLength);
  }

  private formatDurationValue(duration: number | undefined, componentDisplay: string): string | undefined {
    if (duration === undefined) {
      return undefined;
    }

    let formatted = `${duration}ms`;
    const normalizedComponent = componentDisplay?.toLowerCase() ?? '';
    const isSlowHttp = normalizedComponent === 'http' && duration > SLOW_HTTP_THRESHOLD_MS;
    const isSlowUseCase = normalizedComponent === 'usecase' && duration > SLOW_USECASE_THRESHOLD_MS;

    if (isSlowHttp || isSlowUseCase) {
      formatted += ' ⚠️ (slow)';
    }

    return formatted;
  }

  private formatStatusCode(statusCode?: number): string | undefined {
    if (statusCode === undefined || Number.isNaN(statusCode)) {
      return undefined;
    }

    let icon = '✅';
    if (statusCode >= 500) {
      icon = '💥';
    } else if (statusCode >= 400) {
      icon = '❌';
    } else if (statusCode >= 300) {
      icon = '↩️';
    }

    return `${icon} ${statusCode}`;
  }

  private formatSuccess(success?: boolean): string | undefined {
    if (success === undefined) {
      return undefined;
    }

    return success ? '✅ Success' : '❌ Failed';
  }

  private formatCurrency(amountInCents: number): string {
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    return formatter.format(amountInCents / 100).replace(/\u00a0/g, ' ');
  }

  private formatStackTrace(stack?: string): string | undefined {
    if (!stack) {
      return undefined;
    }

    const lines = stack
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, STACK_TRACE_LIMIT);

    if (lines.length === 0) {
      return undefined;
    }

    return lines.join('\n');
  }

  private getAttachmentColor(channelId: SlackCategory, entry: LogEntry, context: LogContext): string {
    if (channelId === 'critical') {
      return '#dc3545';
    }

    if (channelId === 'usage') {
      const statusCode = this.getNumericContextValue(context, 'statusCode');
      if (typeof statusCode === 'number' && statusCode >= 500) {
        return '#dc3545';
      }

      if (entry.level >= LogLevel.WARNING) {
        return '#ffc107';
      }

      return '#0dcaf0';
    }

    if (channelId === 'business') {
      return '#198754';
    }

    return this.getLevelColor(entry.level);
  }

  private buildFooter(): string {
    const appName = (process.env.APP_NAME ?? 'LeanQuality').trim();
    const hostname = (process.env.HOSTNAME ?? os.hostname()).trim();
    const environment = process.env.NODE_ENV?.trim();

    return environment ? `${appName} | ${hostname} | ${environment}` : `${appName} | ${hostname}`;
  }

  private buildRemainingContext(context: LogContext, usedContextKeys: Set<string>): string | undefined {
    const remaining: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (usedContextKeys.has(key)) {
        continue;
      }

      remaining[key] = value;
    }

    if (Object.keys(remaining).length === 0) {
      return undefined;
    }

    const serialized = JSON.stringify(remaining, null, 2);
    return this.truncateString(serialized, CONTEXT_FIELD_LIMIT);
  }

  private formatTitle(entry: LogEntry, channel: SlackChannel, iconEmoji: string): string {
    const level = LogLevel[entry.level] ?? 'INFO';
    const sanitizedMessage = this.prepareFieldValue(entry.message, 140);
    return `${iconEmoji} [${level}] ${sanitizedMessage}`;
  }

  private getBusinessEventEmoji(context: LogContext): string {
    const eventType =
      this.getStringContextValue(context, 'eventType') ?? this.getStringContextValue(context, 'event_type');
    switch (eventType?.toLowerCase()) {
      case 'conversion':
        return '🎉';
      case 'revenue':
        return '💰';
      case 'product_usage':
        return '📦';
      default:
        return '💼';
    }
  }

  protected getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR:
        return '#dc3545';
      case LogLevel.CRITICAL:
        return '#6f42c1';
      case LogLevel.WARNING:
        return '#ffc107';
      case LogLevel.INFO:
        return '#0dcaf0';
      case LogLevel.DEBUG:
      default:
        return '#6c757d';
    }
  }

  protected sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (SENSITIVE_KEYS.includes(key)) {
        continue;
      }

      sanitized[key] = this.sanitizeValue(value);
    }

    return sanitized;
  }

  private sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.truncateString(value);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeValue(item));
    }

    if (typeof value === 'object') {
      return this.sanitizeObject(value as Record<string, unknown>);
    }

    return value;
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (SENSITIVE_KEYS.includes(key)) {
        continue;
      }

      sanitized[key] = this.sanitizeValue(value);
    }
    return sanitized;
  }

  private truncateString(value: string, maxLength: number = DEFAULT_STRING_LIMIT): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}...`;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  protected async sendToSlack(webhookUrl: string, message: Record<string, unknown>): Promise<void> {
    if (!this.fetchFn) {
      console.error('[SlackLogOutput] Fetch API is not available. Cannot send Slack notification.');
      return;
    }

    // Validar formato da URL do webhook
    if (!webhookUrl.startsWith('https://hooks.slack.com/services/')) {
      console.error(
        `[SlackLogOutput] Invalid webhook URL format. Expected URL starting with 'https://hooks.slack.com/services/'. Got: ${webhookUrl.substring(0, 50)}...`
      );
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        console.error(
          `[SlackLogOutput] Failed to send Slack notification: ${response.status} ${response.statusText || ''}`.trim()
        );
        console.error('[SlackLogOutput] Debug info:', {
          webhookUrlPrefix: webhookUrl.substring(0, 60) + '...',
          webhookUrlLength: webhookUrl.length,
          webhookUrlSuffix: '...' + webhookUrl.substring(webhookUrl.length - 15),
          responseBody: responseBody.substring(0, 500),
          hint:
            response.status === 404
              ? 'Webhook URL may be invalid, deleted, or the Slack app was removed. Please regenerate the webhook in Slack.'
              : response.status === 400
                ? 'Bad request - check message format'
                : undefined,
        });
      }
    } catch (error) {
      console.error('[SlackLogOutput] Error while sending Slack notification.', error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
