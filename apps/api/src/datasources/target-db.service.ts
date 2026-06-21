import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResultRow } from 'pg';

@Injectable()
export class TargetDbService implements OnModuleDestroy {
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  private getPool(): Pool {
    this.pool ??= new Pool({
      connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
    return this.pool;
  }

  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.getPool().query<T>(text, params);
    return result.rows;
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
