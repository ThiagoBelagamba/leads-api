import { inject, injectable } from 'inversify';
import { TYPES } from '../container/types';
import { DatabaseService } from '../database/DatabaseService';
import { Logger } from '../logging/Logger';

const REFRESH_INTERVAL_MS = 600_000;

@injectable()
export class CacheRefreshService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @inject(TYPES.DatabaseService) private readonly database: DatabaseService,
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.runRefresh();
    }, REFRESH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runRefresh(): Promise<void> {
    try {
      await this.logger.info('🔄 Atualizando cache de leads...');
      await this.database.query('REFRESH MATERIALIZED VIEW CONCURRENTLY public.resumo_leads_mv;');
      await this.logger.info('✅ Cache atualizado');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.logger.error('Falha ao atualizar cache de leads (MV)', err, {
        component: 'CacheRefreshService',
        operation: 'refresh_materialized_view',
      });
    }
  }
}
