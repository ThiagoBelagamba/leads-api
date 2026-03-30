import express from 'express';
import cors from 'cors';
import type { Server } from 'http';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { Logger } from '../logging/Logger';
import publicLeadRoutes from '../../routes/PublicLeadCheckoutRoutes';

dotenv.config({ override: true });

export class ApiServer {
  private app: express.Application;
  private logger: Logger;
  private server: Server | null = null;

  constructor() {
    this.app = express();
    this.app.set('trust proxy', true);
    this.logger = new Logger();
  }

  private async initialize(): Promise<void> {
    this.configureMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();
  }

  private getRequestId(req: express.Request): string {
    const requestId = (req as express.Request & { requestId?: string }).requestId;
    return requestId || 'unknown';
  }

  public async initForTest(): Promise<void> {
    await this.initialize();
  }

  private configureMiddleware(): void {
    this.app.use(
      cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
      })
    );

    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    this.app.use((req, res, next) => {
      const incomingRequestId = req.header('x-request-id');
      const requestId = incomingRequestId && incomingRequestId.trim().length > 0 ? incomingRequestId : randomUUID();

      (req as express.Request & { requestId?: string }).requestId = requestId;
      res.setHeader('x-request-id', requestId);
      next();
    });
  }

  private configureRoutes(): void {
    const healthResponse = (_req: express.Request, res: express.Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'leadrapidos-api',
        version: process.env.npm_package_version || '1.0.0',
      });
    };

    this.app.get('/health', healthResponse);
    this.app.get('/api/v1/health', healthResponse);
    this.app.use('/api/v1/public-leads', publicLeadRoutes);

    // Alias para webhook do Asaas (caminho curto configurado no painel)
    this.app.post('/api/v1/webhooks/asaas', (req, res, next) => {
      req.url = '/webhooks/asaas';
      publicLeadRoutes(req, res, next);
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        requestId: this.getRequestId(req),
        timestamp: new Date().toISOString(),
      });
    });
  }

  private configureErrorHandling(): void {
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      const statusCode = error.statusCode || error.status || 500;
      const message = error.message || 'Internal Server Error';

      // 🚨 CRITICAL: Erros 500 não tratados são críticos
      if (statusCode >= 500) {
        this.logger.error('🚨 Unhandled server error', error, {
          component: 'application',
          severity: 'critical',
          event: 'unhandled_error',
          statusCode,
          method: req.method,
          url: req.url,
          requestId: this.getRequestId(req),
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      } else {
        // Erros 4xx são normais, log padrão
        this.logger.error('Request error', error, {
          method: req.method,
          url: req.url,
          requestId: this.getRequestId(req),
          statusCode,
        });
      }

      const code = error.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
      res.status(statusCode).json({
        success: false,
        code,
        message: statusCode >= 500 ? 'Internal Server Error' : message,
        requestId: this.getRequestId(req),
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && {
          details: error.details,
          stack: error.stack,
        }),
      });
    });
  }

  public async start(port: number = 3000): Promise<void> {
    try {
      await this.initialize();

      this.server = this.app.listen(port, () => {
        this.logger.info('API iniciada com sucesso', { port });
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    } catch (error) {
      this.logger.error('Failed to start API server', error as Error);
      process.exit(1);
    }
  }

  public async shutdown(): Promise<void> {
    this.logger.startupInfo('🔄 shutting down gracefully...');

    try {
      // Close HTTP server
      if (this.server) {
        this.server.close(() => {
          this.logger.info('✅ API server closed successfully');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    } catch (error) {
      this.logger.error('❌ Error during shutdown', error as Error);
      process.exit(1);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Bootstrap the API server if this file is run directly
if (require.main === module) {
  const apiServer = new ApiServer();
  const port = parseInt(process.env.PORT || '3000', 10);

  // Start server asynchronously
  apiServer.start(port).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
