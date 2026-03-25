import express from 'express';
import cors from 'cors';
import type { Server } from 'http';
import dotenv from 'dotenv';
import { Logger } from '../logging/Logger';
import publicLeadRoutes from '@main/routes/PublicLeadCheckoutRoutes';

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

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
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
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      } else {
        // Erros 4xx são normais, log padrão
        this.logger.error('Request error', error, {
          method: req.method,
          url: req.url,
          statusCode,
        });
      }

      res.status(statusCode).json({
        error: statusCode >= 500 ? 'Internal Server Error' : message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
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
