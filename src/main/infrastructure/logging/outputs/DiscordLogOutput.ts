import { LogEntry, LogLevel } from '../Logger';

export interface DiscordChannelConfig {
  id: string;
  webhookUrl: string;
  name: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

export class DiscordLogOutput {
  private readonly fetchFn: typeof fetch | null;
  private readonly timeoutMs: number;
  private readonly channel: DiscordChannelConfig | null;
  private readonly enabled: boolean;

  constructor(fetchFn?: typeof fetch, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.fetchFn = fetchFn ?? globalThis.fetch ?? null;
    this.timeoutMs = timeoutMs;

    const enabledFlag = String(process.env.DISCORD_LOGS_ENABLED ?? '').toLowerCase();
    const requestedEnabled = enabledFlag === 'true' || enabledFlag === '1';

    const webhookUrl = (process.env.DISCORD_WEBHOOK_LOGS ?? '').trim();

    if (webhookUrl) {
      this.channel = {
        id: 'discord-logs',
        webhookUrl,
        name: '#logs',
      };
    } else {
      this.channel = null;
    }

    this.enabled = requestedEnabled && !!this.fetchFn && !!this.channel;

    if (requestedEnabled && !this.enabled) {
      console.warn(
        '[DiscordLogOutput] Discord notifications requested but disabled due to missing configuration (webhook or fetch API).'
      );
    }

    if (this.enabled) {
      console.info('[DiscordLogOutput] ✅ Discord log notifications enabled.');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async write(entry: LogEntry): Promise<void> {
    if (!this.enabled || !this.fetchFn || !this.channel) {
      return;
    }

    // Apenas logs de aviso pra cima (WARNING, ERROR, FATAL)
    if (entry.level < LogLevel.WARNING) {
      return;
    }

    const context = entry.context ?? {};
    const title = this.buildTitle(entry);
    const description = this.buildDescription(entry);

    const contentLines: string[] = [];
    contentLines.push(`**${title}**`);
    if (description) {
      contentLines.push(description);
    }

    // Opcional: destacar erros mais sérios
    if (entry.level >= LogLevel.ERROR) {
      contentLines.unshift('🚨 **Erro na API Disparo Rápido**');
    }

    const payload = {
      content: contentLines.join('\n'),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      await this.fetchFn(this.channel.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (error) {
      console.warn(
        '[DiscordLogOutput] Failed to send log to Discord.',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private buildTitle(entry: LogEntry): string {
    const levelName = LogLevel[entry.level] ?? 'LOG';
    const component = entry.component ?? (entry.context?.component as string) ?? 'general';
    return `[${levelName}] ${component}`;
  }

  private buildDescription(entry: LogEntry): string | null {
    const parts: string[] = [];
    if (entry.message) {
      parts.push(entry.message);
    }

    const context = entry.context ?? {};

    const path = (context.path ?? context.endpoint ?? context.url) as string | undefined;
    const method = (context.method ?? context.httpMethod) as string | undefined;
    const statusCode = context.statusCode as number | undefined;

    if (path || method || statusCode) {
      const httpBits: string[] = [];
      if (method) httpBits.push(method.toUpperCase());
      if (path) httpBits.push(path);
      if (typeof statusCode === 'number') httpBits.push(`(status ${statusCode})`);
      parts.push(`\`${httpBits.join(' ')}\``);
    }

    const traceId = (context.trace_id ?? context.traceId ?? context.requestId) as string | undefined;
    if (traceId) {
      parts.push(`trace_id: \`${traceId}\``);
    }

    const error = (context.error as string | undefined) ?? (context.err as string | undefined);
    if (error) {
      parts.push(`erro: \`${String(error).slice(0, 300)}\``);
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }
}

