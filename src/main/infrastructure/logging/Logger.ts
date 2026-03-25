/**
 * ═══════════════════════════════════════════════════════════════
 * 📝 LOGGER - HEXAGONAL ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════
 *
 * Sistema de logging seguindo padrões da Arquitetura Hexagonal.
 * Fornece logging estruturado com múltiplos outputs e níveis
 * configuráveis.
 *
 * Padrões Aplicados:
 * - Strategy Pattern para outputs de log
 * - Configuração por Environment Variables
 * - Logging estruturado com contexto
 * - Suporte a múltiplos targets (console, file, etc)
 * ═══════════════════════════════════════════════════════════════
 */

import { injectable } from 'inversify';
import { SlackLogOutput } from '@infra/logging/outputs/SlackLogOutput';
import { DiscordLogOutput } from '@infra/logging/outputs/DiscordLogOutput';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogContext {
  [key: string]: unknown;
  component?: string;
  operation?: string;
  duration?: number;
  userId?: string;
  requestId?: string;
  traceId?: string;
  trace_id?: string;
  spanId?: string;
  span_id?: string;
  parentSpanId?: string;
  parent_span_id?: string;
  port?: number;
  url?: string;
  queueName?: string;
  service?: string;
  handlers?: unknown;
  timeout?: number;
  responseSize?: number;
  method?: string;
  statusCode?: number;
  timestamp?: unknown;
  response?: unknown;
  ip?: string;
  userAgent?: string;
  stack?: unknown;
  error?: unknown;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: LogContext;
  userId?: string;
  requestId?: string;
  component?: string;
  operation?: string;
  duration?: number;
  error?: Error;
  // OpenTelemetry integration
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
}

export interface LogOutput {
  write(entry: LogEntry): Promise<void>;
}

@injectable()
export class Logger {
  private outputs: LogOutput[] = [];
  private minLevel!: LogLevel;
  private defaultContext: LogContext = {};

  constructor() {
    this.initializeLogLevel();
    this.initializeOutputs();
  }

  // =====================================
  // Configuration Methods
  // =====================================

  addOutput(output: LogOutput): void {
    this.outputs.push(output);
  }

  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  getLogLevel(): LogLevel {
    return this.minLevel;
  }

  setLogLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  // =====================================
  // Basic Logging Methods
  // =====================================

  async debug(message: string, context?: LogContext): Promise<void> {
    await this.log(LogLevel.DEBUG, message, context);
  }

  async info(message: string, context?: LogContext): Promise<void> {
    await this.log(LogLevel.INFO, message, context);
  }

  async warning(message: string, context?: LogContext): Promise<void> {
    await this.log(LogLevel.WARNING, message, context);
  }

  async warn(message: string, context?: LogContext): Promise<void> {
    await this.log(LogLevel.WARNING, message, context);
  }

  // =====================================
  // Startup Logging Methods (Condensed)
  // =====================================

  /**
   * Sets trace context for all subsequent logs in this logger instance
   */
  setTraceContext(traceId: string, spanId?: string, parentSpanId?: string): void {
    this.defaultContext = {
      ...this.defaultContext,
      traceId,
      spanId,
      parentSpanId,
    };
  }

  /**
   * Clears trace context
   */
  clearTraceContext(): void {
    const { traceId, spanId, parentSpanId, ...restContext } = this.defaultContext;
    this.defaultContext = restContext;
  }

  async startupInfo(message: string, details?: LogContext): Promise<void> {
    if (!details) {
      await this.log(LogLevel.INFO, message);
      return;
    }

    // Condensar detalhes em uma linha mais limpa
    const condensedDetails = this.condenseStartupDetails(details);
    await this.log(LogLevel.INFO, `${message} ${condensedDetails}`);
  }

  async startupSuccess(service: string, components: string[] = [], port?: number): Promise<void> {
    const serviceInfo = port ? `${service} (http://localhost:${port}/api/v1/docs)` : service;
    const componentsInfo = components.length > 0 ? ` [${components.join(', ')}]` : '';
    await this.log(LogLevel.INFO, `✅ ${serviceInfo} started${componentsInfo}`);
  }

  async startupConnection(service: string, url?: string): Promise<void> {
    const urlInfo = url ? ` (${this.maskSensitiveUrl(url)})` : '';
    await this.log(LogLevel.INFO, `🔌 ${service} connected${urlInfo}`);
  }

  async startupQueue(queueName: string, action: 'created' | 'subscribed' = 'created'): Promise<void> {
    const emoji = action === 'created' ? '📋' : '🔄';
    const verb = action === 'created' ? 'Ready' : 'Listening';
    await this.log(LogLevel.INFO, `${emoji} ${verb}: ${queueName}`);
  }

  async error(message: string, error?: Error, context?: LogContext): Promise<void> {
    await this.log(LogLevel.ERROR, message, { ...(context ?? {}), error });
  }

  async critical(message: string, error?: Error, context?: LogContext): Promise<void> {
    await this.log(LogLevel.CRITICAL, message, { ...(context ?? {}), error });
  }

  // =====================================
  // Specialized Logging Methods
  // =====================================

  async logRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    userId?: string,
    traceId?: string,
    spanId?: string
  ): Promise<void> {
    const emoji = this.getStatusCodeEmoji(statusCode);
    await this.info(`${emoji} ${method} ${url}`, {
      component: 'HTTP',
      operation: 'request',
      statusCode,
      duration,
      userId,
      traceId,
      spanId,
    });
  }

  async logUseCase(
    useCaseName: string,
    operation: string,
    duration: number,
    userId?: string,
    success: boolean = true
  ): Promise<void> {
    const emoji = success ? '✅' : '❌';
    const level = success ? LogLevel.INFO : LogLevel.ERROR;

    await this.log(level, `${emoji} Use case: ${useCaseName}`, {
      component: 'UseCase',
      operation,
      duration,
      userId,
      success,
    });
  }

  async logDatabase(operation: string, table: string, duration: number, error?: Error): Promise<void> {
    const level = error ? LogLevel.ERROR : LogLevel.DEBUG;
    const emoji = error ? '❌' : '🗄️';
    const message = error
      ? `${emoji} Database error: ${operation} on ${table}`
      : `${emoji} Database: ${operation} on ${table}`;

    await this.log(level, message, {
      component: 'Database',
      operation,
      table,
      duration,
      error,
    });
  }

  async logExternalService(
    service: string,
    operation: string,
    duration: number,
    success: boolean,
    error?: Error
  ): Promise<void> {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const emoji = success ? '🌐' : '❌';
    const message = `${emoji} External service: ${service} ${operation} ${success ? 'succeeded' : 'failed'}`;

    await this.log(level, message, {
      component: 'ExternalService',
      service,
      operation,
      duration,
      success,
      error,
    });
  }

  async logMessageBus(operation: string, queue: string, success: boolean, error?: Error): Promise<void> {
    const level = success ? LogLevel.DEBUG : LogLevel.ERROR;
    const emoji = success ? '📨' : '❌';
    const message = `${emoji} Message bus: ${operation} on ${queue}`;

    await this.log(level, message, {
      component: 'MessageBus',
      operation,
      queue,
      success,
      error,
    });
  }

  async logTranscription(
    provider: string,
    duration: number,
    wordCount: number,
    success: boolean,
    error?: Error
  ): Promise<void> {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const emoji = success ? '🎤' : '❌';
    const message = `${emoji} Transcription: ${provider}`;

    await this.log(level, message, {
      component: 'Transcription',
      provider,
      duration,
      wordCount,
      success,
      error,
    });
  }

  // =====================================
  // Performance Logging
  // =====================================

  async logPerformance(operation: string, duration: number, metadata?: LogContext): Promise<void> {
    const emoji = duration > 5000 ? '🐌' : duration > 1000 ? '⏱️' : '⚡';
    const level = duration > 5000 ? LogLevel.WARNING : LogLevel.DEBUG;

    await this.log(level, `${emoji} Performance: ${operation} took ${duration}ms`, {
      component: 'Performance',
      operation,
      duration,
      ...(metadata ?? {}),
    });
  }

  async logMetrics(metricName: string, value: number, unit: string, tags?: Record<string, string>): Promise<void> {
    await this.debug(`📊 Metric: ${metricName} = ${value} ${unit}`, {
      component: 'Metrics',
      metric: metricName,
      value,
      unit,
      tags,
    });
  }

  // =====================================
  // Security and Audit Logging
  // =====================================

  async logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    userId?: string,
    details?: LogContext
  ): Promise<void> {
    const level =
      severity === 'critical'
        ? LogLevel.CRITICAL
        : severity === 'high'
          ? LogLevel.ERROR
          : severity === 'medium'
            ? LogLevel.WARNING
            : LogLevel.INFO;

    const emoji = severity === 'critical' ? '🚨' : severity === 'high' ? '⚠️' : severity === 'medium' ? '🔒' : '🔐';

    await this.log(level, `${emoji} Security event: ${event}`, {
      component: 'Security',
      event,
      severity,
      userId,
      ...(details ?? {}),
    });
  }

  async logAuditEvent(
    action: string,
    entityType: string,
    entityId: string,
    userId: string,
    changes?: LogContext
  ): Promise<void> {
    await this.info(`📋 Audit: ${action} ${entityType}`, {
      component: 'Audit',
      action,
      entityType,
      entityId,
      userId,
      ...(changes ?? {}),
    });
  }

  // =====================================
  // Private Methods
  // =====================================

  private initializeLogLevel(): void {
    // Configurar nível mínimo baseado em environment variable
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'DEBUG':
        this.minLevel = LogLevel.DEBUG;
        break;
      case 'INFO':
        this.minLevel = LogLevel.INFO;
        break;
      case 'WARNING':
        this.minLevel = LogLevel.WARNING;
        break;
      case 'ERROR':
        this.minLevel = LogLevel.ERROR;
        break;
      case 'CRITICAL':
        this.minLevel = LogLevel.CRITICAL;
        break;
      case 'NONE':
        this.minLevel = LogLevel.CRITICAL + 1; // Disable logging
        break;
      default:
        this.minLevel = LogLevel.INFO;
    }
  }

  private initializeOutputs(): void {
    // Adicionar console output por padrão
    this.addOutput(new ConsoleLogOutput());

    // Adicionar Slack output se habilitado (legado)
    try {
      const slackOutput = new SlackLogOutput();
      if (slackOutput.isEnabled()) {
        this.addOutput(slackOutput);
      }
    } catch (error) {
      console.error('[Logger] Failed to initialize SlackLogOutput.', error);
    }

    // Adicionar Discord output se habilitado
    try {
      const discordOutput = new DiscordLogOutput();
      if (discordOutput.isEnabled()) {
        this.addOutput(discordOutput);
      }
    } catch (error) {
      console.error('[Logger] Failed to initialize DiscordLogOutput.', error);
    }
  }

  // =====================================
  // Startup Helper Methods
  // =====================================

  private condenseStartupDetails(details: LogContext): string {
    const important: string[] = [];

    // Priorizar informações mais relevantes
    const port = this.getNumberFromContext(details, 'port');
    if (port !== undefined) important.push(`port:${port}`);

    const url = this.getStringFromContext(details, 'url');
    if (url) important.push(`url:${this.maskSensitiveUrl(url)}`);

    const queueName = this.getStringFromContext(details, 'queueName');
    if (queueName) important.push(`queue:${queueName}`);

    const service = this.getStringFromContext(details, 'service');
    if (service) important.push(`service:${service}`);

    const handlers = details.handlers;
    if (Array.isArray(handlers)) {
      important.push(`handlers:${handlers.length}`);
    } else if (typeof handlers === 'number') {
      important.push(`handlers:${handlers}`);
    }

    const timeout = this.getNumberFromContext(details, 'timeout');
    if (timeout !== undefined) important.push(`timeout:${timeout}ms`);

    return important.length > 0 ? `(${important.join(' | ')})` : '';
  }

  private maskSensitiveUrl(url: string): string {
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://*****:*****@');
  }

  private getStatusCodeEmoji(statusCode: number): string {
    if (statusCode >= 200 && statusCode < 300) return '✅';
    if (statusCode >= 300 && statusCode < 400) return '↩️';
    if (statusCode >= 400 && statusCode < 500) return '❌';
    if (statusCode >= 500) return '💥';
    return '📡';
  }

  private getStringFromContext(context: LogContext, key: keyof LogContext): string | undefined {
    const value = context[key];
    return typeof value === 'string' ? value : undefined;
  }

  private getNumberFromContext(context: LogContext, key: keyof LogContext): number | undefined {
    const value = context[key];
    return typeof value === 'number' ? value : undefined;
  }

  protected async log(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    if (level < this.minLevel) {
      return;
    }

    const mergedContext: LogContext = { ...this.defaultContext, ...(context ?? {}) };
    const errorFromContext = mergedContext.error instanceof Error ? mergedContext.error : undefined;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: mergedContext,
      component: this.getStringFromContext(mergedContext, 'component'),
      operation: this.getStringFromContext(mergedContext, 'operation'),
      duration: this.getNumberFromContext(mergedContext, 'duration'),
      userId: this.getStringFromContext(mergedContext, 'userId'),
      requestId: this.getStringFromContext(mergedContext, 'requestId'),
      error: errorFromContext,
      // Extract OpenTelemetry trace info from context
      traceId:
        this.getStringFromContext(mergedContext, 'traceId') ?? this.getStringFromContext(mergedContext, 'trace_id'),
      spanId: this.getStringFromContext(mergedContext, 'spanId') ?? this.getStringFromContext(mergedContext, 'span_id'),
      parentSpanId:
        this.getStringFromContext(mergedContext, 'parentSpanId') ??
        this.getStringFromContext(mergedContext, 'parent_span_id'),
    };

    // Write to all outputs in parallel
    const writePromises = this.outputs.map(output =>
      output.write(entry).catch(err => console.error('Failed to write log entry:', err))
    );

    await Promise.all(writePromises);
  }
}

// =====================================
// Console Output Implementation
// =====================================

class ConsoleLogOutput implements LogOutput {
  private readonly colors = {
    [LogLevel.DEBUG]: '\x1b[37m', // White
    [LogLevel.INFO]: '\x1b[34m', // Blue
    [LogLevel.WARNING]: '\x1b[33m', // Yellow
    [LogLevel.ERROR]: '\x1b[31m', // Red
    [LogLevel.CRITICAL]: '\x1b[35m', // Magenta
  };

  private readonly reset = '\x1b[0m';

  async write(entry: LogEntry): Promise<void> {
    // Use structured format based on your specification:
    // [%d{yyyy-MM-dd HH:mm:ss.SSS}][%-5level][%X{traceId}][%thread][%logger{0}.%M][${HOSTNAME}][${APP_NAME}][${APP_VERSION}] - %msg%n

    const color = this.colors[entry.level];
    const levelName = LogLevel[entry.level].padEnd(5); // %-5level
    const timestamp = this.formatTimestamp(entry.timestamp); // yyyy-MM-dd HH:mm:ss.SSS
    const traceId = this.formatTraceId(entry.traceId); // %X{traceId}
    const thread = this.getThreadInfo(); // %thread
    const logger = this.formatLogger(entry.component, entry.operation); // %logger{0}.%M
    const hostname = process.env.HOSTNAME || 'localhost'; // ${HOSTNAME}
    const appName = process.env.APP_NAME || 'scany-backend'; // ${APP_NAME}
    const appVersion = process.env.APP_VERSION || '1.0.0'; // ${APP_VERSION}

    // Compact structured log line
    let logLine = `${color}[${timestamp}][${levelName}][${traceId}][${thread}][${logger}][${hostname}][${appName}][${appVersion}]${this.reset} - ${entry.message}`;

    // Add duration if present (avoid duplication if already in message)
    if (entry.duration !== undefined && !entry.message.includes('(' + entry.duration + 'ms')) {
      logLine += ` (${entry.duration}ms)`;
    }

    // Add user info if present
    if (entry.userId) {
      logLine += ` [user:${entry.userId}]`;
    }

    console.log(logLine);

    // Only log additional context if it contains important data not already shown
    if (this.hasImportantContext(entry)) {
      this.logAdditionalContext(entry);
    }

    // Always log errors with full details
    if (entry.error) {
      const errorColor = '\x1b[31m';
      console.log(`${errorColor}  ↳ ERROR: ${entry.error.message}${this.reset}`);
      if (entry.error.stack && entry.level >= LogLevel.ERROR) {
        console.log(`${errorColor}  ↳ STACK: ${entry.error.stack.split('\n').slice(0, 3).join('\n')}${this.reset}`);
      }
    }
  }

  private formatTimestamp(date: Date): string {
    // Format: yyyy-MM-dd HH:mm:ss.SSS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  private formatTraceId(traceId?: string): string {
    if (!traceId) {
      return '---'; // Placeholder for no trace
    }
    // Take first 8 chars for compact display
    return traceId.length > 8 ? traceId.substring(0, 8) : traceId;
  }

  private getThreadInfo(): string {
    // Node.js doesn't have real threads, but we can show process info
    return `main`; // Or could use process.pid
  }

  private formatLogger(component?: string, operation?: string): string {
    if (component && operation) {
      return `${component}.${operation}`;
    }
    if (component) {
      return `${component}.exec`;
    }
    return 'app.log';
  }

  private hasImportantContext(entry: LogEntry): boolean {
    if (!entry.context) return false;

    const filteredContext: LogContext = { ...entry.context };
    // Remove already displayed fields
    delete filteredContext.error;
    delete filteredContext.component;
    delete filteredContext.operation;
    delete filteredContext.duration;
    delete filteredContext.userId;
    delete filteredContext.traceId;
    delete filteredContext.trace_id;
    delete filteredContext.spanId;
    delete filteredContext.span_id;
    delete filteredContext.parentSpanId;
    delete filteredContext.parent_span_id;

    // ✅ FILTROS ADICIONAIS: Remove campos redundantes/verbosos
    delete filteredContext.method; // Já no log principal
    delete filteredContext.url; // Já no log principal
    delete filteredContext.statusCode; // Já no log principal
    delete filteredContext.timestamp; // Já no timestamp do log
    delete filteredContext.response; // Muito verboso, remover
    delete filteredContext.ip; // Raramente útil
    delete filteredContext.userAgent; // Muito verboso
    delete filteredContext.stack; // Tratado separadamente como error

    // Só mostrar context se tiver informações realmente relevantes
    const remainingKeys = Object.keys(filteredContext);
    if (remainingKeys.length === 0) return false;

    // Se só tem responseSize e é pequeno, não vale a pena mostrar
    if (
      remainingKeys.length === 1 &&
      remainingKeys[0] === 'responseSize' &&
      typeof filteredContext.responseSize === 'number' &&
      filteredContext.responseSize < 1000
    ) {
      return false;
    }

    return true;
  }

  private logAdditionalContext(entry: LogEntry): void {
    if (!entry.context) return;

    const filteredContext: LogContext = { ...entry.context };
    // Remove already displayed fields
    delete filteredContext.error;
    delete filteredContext.component;
    delete filteredContext.operation;
    delete filteredContext.duration;
    delete filteredContext.userId;
    delete filteredContext.traceId;
    delete filteredContext.trace_id;
    delete filteredContext.spanId;
    delete filteredContext.span_id;
    delete filteredContext.parentSpanId;
    delete filteredContext.parent_span_id;

    // ✅ APLICAR MESMOS FILTROS
    delete filteredContext.method;
    delete filteredContext.url;
    delete filteredContext.statusCode;
    delete filteredContext.timestamp;
    delete filteredContext.response;
    delete filteredContext.ip;
    delete filteredContext.userAgent;
    delete filteredContext.stack;

    if (typeof filteredContext.responseSize === 'number' && filteredContext.responseSize < 1000) {
      delete filteredContext.responseSize;
    }

    const remainingKeys = Object.keys(filteredContext);
    if (remainingKeys.length > 0) {
      // ✅ FORMATO MAIS COMPACTO: Mostrar apenas campos essenciais
      const compactContext: LogContext = {};

      // Incluir apenas campos realmente úteis
      remainingKeys.forEach(key => {
        const value = filteredContext[key];
        if (value === null || value === undefined) {
          return;
        }

        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed.length === 0) {
            return;
          }
          compactContext[key] = trimmed.length > 100 ? `${trimmed.substring(0, 100)}...` : trimmed;
          return;
        }

        compactContext[key] = value;
      });

      if (Object.keys(compactContext).length > 0) {
        console.log(`  ↳ CONTEXT: ${JSON.stringify(compactContext, null, 0)}`);
      }
    }
  }
}

// =====================================
// File Output Implementation
// =====================================

export class FileLogOutput implements LogOutput {
  constructor(private filepath: string) {}

  async write(entry: LogEntry): Promise<void> {
    // Implementation would write to file
    // For now, just a placeholder
    console.log(`Would write to ${this.filepath}:`, entry.message);
  }
}

// =====================================
// JSON Output Implementation
// =====================================

export class JsonLogOutput implements LogOutput {
  async write(entry: LogEntry): Promise<void> {
    const jsonEntry = {
      '@timestamp': entry.timestamp.toISOString(),
      level: LogLevel[entry.level],
      message: entry.message,
      component: entry.component,
      operation: entry.operation,
      duration: entry.duration,
      userId: entry.userId,
      requestId: entry.requestId,
      // OpenTelemetry fields
      traceId: entry.traceId,
      spanId: entry.spanId,
      parentSpanId: entry.parentSpanId,
      // Application metadata
      hostname: process.env.HOSTNAME || 'localhost',
      appName: process.env.APP_NAME || 'backend',
      appVersion: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      // Additional context (filtered)
      context: this.filterContext(entry.context),
      error: entry.error
        ? {
            message: entry.error.message,
            stack: entry.error.stack,
            name: entry.error.name,
            type: entry.error.constructor.name,
          }
        : undefined,
    };

    console.log(JSON.stringify(jsonEntry));
  }

  private filterContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;

    const filtered: LogContext = { ...context };
    // Remove fields that are already at root level
    delete filtered.error;
    delete filtered.component;
    delete filtered.operation;
    delete filtered.duration;
    delete filtered.userId;
    delete filtered.traceId;
    delete filtered.trace_id;
    delete filtered.spanId;
    delete filtered.span_id;
    delete filtered.parentSpanId;
    delete filtered.parent_span_id;

    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }
}

// Types are already exported above, no need to re-export
