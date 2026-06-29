import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResultRow } from 'pg';

export type ColumnKind = 'number' | 'date' | 'string';
export type FieldInfo = { name: string; kind: ColumnKind };
export type Target = {
  connectionString: string;
  schema: string;
  readonlyRole: boolean;
};

const NUMERIC_OIDS = new Set([20, 21, 23, 26, 700, 701, 790, 1700]);
const DATE_OIDS = new Set([1082, 1083, 1114, 1184, 1266]);

function kindFromOid(oid: number): ColumnKind {
  if (NUMERIC_OIDS.has(oid)) return 'number';
  if (DATE_OIDS.has(oid)) return 'date';
  return 'string';
}

@Injectable()
export class TargetDbService implements OnModuleDestroy {
  private readonly pools = new Map<string, Pool>();

  constructor(private readonly config: ConfigService) {}

  appConnectionString(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }

  private getPool(connectionString: string): Pool {
    let pool = this.pools.get(connectionString);
    if (!pool) {
      const ssl = connectionString.includes('sslmode=disable')
        ? false
        : { rejectUnauthorized: false };
      pool = new Pool({
        connectionString,
        ssl,
        max: 3,
        connectionTimeoutMillis: 8000,
      });
      this.pools.set(connectionString, pool);
    }
    return pool;
  }

  async query<T extends QueryResultRow>(
    target: Target,
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.getPool(target.connectionString).query<T>(
      text,
      params,
    );
    return result.rows;
  }

  async runReadOnly(
    target: Target,
    sql: string,
    timeoutMs = 5000,
  ): Promise<{
    rows: Record<string, unknown>[];
    fields: FieldInfo[];
    rowCount: number;
    latencyMs: number;
  }> {
    const client = await this.getPool(target.connectionString).connect();
    const startedAt = Date.now();
    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
      await client.query(`SET LOCAL search_path TO "${target.schema}"`);
      if (target.readonlyRole) {
        await client.query('SET LOCAL ROLE copilot_ro');
      }
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
    for (const pool of this.pools.values()) {
      await pool.end();
    }
  }
}
