import { injectable } from 'inversify';
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

@injectable()
export class DatabaseService {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool(DatabaseService.buildPoolConfig());
  }

  private static buildPoolConfig(): PoolConfig {
    const ssl = DatabaseService.resolveSslOption();
    const url = process.env.DATABASE_URL?.trim();
    if (url) {
      return {
        connectionString: url,
        max: 20,
        idleTimeoutMillis: 30000,
        ...(ssl !== undefined ? { ssl } : {}),
      };
    }
    return {
      host: process.env.PGHOST?.trim() || '127.0.0.1',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER?.trim() || 'postgres',
      password: process.env.PGPASSWORD ?? '',
      database: process.env.PGDATABASE?.trim() || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      ...(ssl !== undefined ? { ssl } : {}),
    };
  }

  /**
   * PGSSLMODE=require (ou PGSSL=true) ativa TLS.
   * Por padrão usa rejectUnauthorized: false (comum em Postgres com certificado interno);
   * defina PGSSL_REJECT_UNAUTHORIZED=true para validar cadeia (ex.: RDS com CA conhecida).
   */
  private static resolveSslOption(): { rejectUnauthorized: boolean } | undefined {
    const mode = (process.env.PGSSLMODE || '').trim().toLowerCase();
    const flag = (process.env.PGSSL || '').trim().toLowerCase();
    const wantSsl = mode === 'require' || mode === 'verify-ca' || mode === 'verify-full' || flag === '1' || flag === 'true';
    if (!wantSsl) return undefined;
    const strict = (process.env.PGSSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase() === 'true';
    return { rejectUnauthorized: strict };
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as never[] | undefined);
  }

  async dispose(): Promise<void> {
    await this.pool.end();
  }
}
