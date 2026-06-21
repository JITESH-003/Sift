import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResultRow } from 'pg';

export type ColumnKind = 'number' | 'date' | 'string';
export type FieldInfo = { name: string; kind: ColumnKind };

const NUMERIC_OIDS = new Set([20, 21, 23, 26, 700, 701, 790, 1700]);
const DATE_OIDS = new Set([1082, 1083, 1114, 1184, 1266]);

function kindFromOid(oid: number): ColumnKind {
  if (NUMERIC_OIDS.has(oid)) return 'number';
  if (DATE_OIDS.has(oid)) return 'date';
  return 'string';
}

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

  async runReadOnly(
    schema: string,
    sql: string,
    timeoutMs = 5000,
  ): Promise<{
    rows: Record<string, unknown>[];
    fields: FieldInfo[];
    rowCount: number;
    latencyMs: number;
  }> {
    const client = await this.getPool().connect();
    const startedAt = Date.now();
    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query('SET LOCAL ROLE copilot_ro');
      const result = await client.query<Record<string, unknown>>(sql);
      await client.query('COMMIT');
      return {
        rows: result.rows,
        fields: result.fields.map((f) => ({
          name: f.name,
          kind: kindFromOid(f.dataTypeID),
        })),
        rowCount: result.rowCount ?? result.rows.length,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
