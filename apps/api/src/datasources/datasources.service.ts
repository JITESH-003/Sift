import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { assertPublicPostgresUrl } from '../common/ssrf';
import { ConnectionRegistry } from '../connections/connection-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from '../rag/retrieval.service';
import { SafetyService } from '../safety/safety.service';
import { CreateDataSourceDto } from './dto/create-datasource.dto';
import { IntrospectionService, type SchemaJson } from './introspection.service';
import { TargetDbService, type Target } from './target-db.service';
import { VizService, type Chart } from './viz.service';

type CachedPayload = {
  rows: Record<string, unknown>[];
  rowCount: number;
  chart: Chart;
};

export type RunResult =
  | {
      status: 'ok';
      sql: string;
      cached: boolean;
      rowCount: number;
      latencyMs: number;
      chart: Chart;
      rows: Record<string, unknown>[];
    }
  | { status: 'blocked'; reason: string }
  | { status: 'error'; sql: string; error: string }
  | { status: 'disconnected' };

type ConnectionRef = { mode?: string; schema?: string; label?: string };

@Injectable()
export class DataSourcesService {
  private readonly logger = new Logger(DataSourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly introspection: IntrospectionService,
    private readonly safety: SafetyService,
    private readonly targetDb: TargetDbService,
    private readonly viz: VizService,
    private readonly registry: ConnectionRegistry,
    private readonly retrieval: RetrievalService,
  ) {}

  async create(userId: string, dto: CreateDataSourceDto) {
    if (dto.connectionString) {
      await assertPublicPostgresUrl(dto.connectionString);
      const schema = dto.schema ?? 'public';
      const target: Target = {
        connectionString: dto.connectionString,
        schema,
        readonlyRole: false,
      };
      const { schemaJson, compactText } =
        await this.introspection.introspect(target);
      const dataSource = await this.prisma.dataSource.create({
        data: {
          userId,
          name: dto.name,
          connectionRef: JSON.stringify({
            mode: 'external',
            schema,
            label: this.label(dto.connectionString),
          }),
        },
      });
      await this.prisma.schemaSnapshot.create({
        data: { dataSourceId: dataSource.id, schemaJson, compactText },
      });
      this.registry.set(userId, dataSource.id, dto.connectionString, schema);
      await this.indexSchemaSafe(dataSource.id, schemaJson);
      return dataSource;
    }
    if (dto.schema) {
      return this.prisma.dataSource.create({
        data: {
          userId,
          name: dto.name,
          connectionRef: JSON.stringify({ mode: 'local', schema: dto.schema }),
        },
      });
    }
    throw new BadRequestException('Provide a schema or a connectionString');
  }

  async connect(userId: string, id: string, connectionString: string) {
    const dataSource = await this.findOwned(userId, id);
    const parsed = this.safeParse(dataSource.connectionRef);
    if (parsed?.mode !== 'external') {
      throw new BadRequestException(
        'This data source does not use a connection string',
      );
    }
    await assertPublicPostgresUrl(connectionString);
    const schema = parsed.schema ?? 'public';
    this.registry.set(userId, id, connectionString, schema);
    const { schemaJson, compactText } = await this.introspection.introspect({
      connectionString,
      schema,
      readonlyRole: false,
    });
    await this.prisma.schemaSnapshot.create({
      data: { dataSourceId: id, schemaJson, compactText },
    });
    await this.indexSchemaSafe(id, schemaJson);
    return { connected: true };
  }

  async list(userId: string) {
    const rows = await this.prisma.dataSource.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((ds) => ({
      ...ds,
      connected: this.isConnected(ds.connectionRef, userId, ds.id),
    }));
  }

  async get(userId: string, id: string) {
    const dataSource = await this.findOwned(userId, id);
    const snapshot = await this.prisma.schemaSnapshot.findFirst({
      where: { dataSourceId: id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...dataSource,
      snapshot,
      connected: this.isConnected(dataSource.connectionRef, userId, id),
    };
  }

  async connectionState(userId: string, id: string): Promise<boolean> {
    const dataSource = await this.findOwned(userId, id);
    return this.isConnected(dataSource.connectionRef, userId, id);
  }

  async introspect(userId: string, id: string) {
    const dataSource = await this.findOwned(userId, id);
    const target = this.resolveTarget(
      userId,
      dataSource.id,
      dataSource.connectionRef,
    );
    if (!target) {
      throw new BadRequestException('Reconnect this database first');
    }
    const { schemaJson, compactText } =
      await this.introspection.introspect(target);
    const snapshot = await this.prisma.schemaSnapshot.create({
      data: { dataSourceId: id, schemaJson, compactText },
    });
    await this.indexSchemaSafe(id, schemaJson);
    return snapshot;
  }

  private async indexSchemaSafe(
    dataSourceId: string,
    schemaJson: SchemaJson,
  ): Promise<void> {
    try {
      await this.retrieval.indexSchema(dataSourceId, schemaJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Schema embedding failed for ${dataSourceId}: ${message}`,
      );
    }
  }

  async run(userId: string, id: string, sql: string): Promise<RunResult> {
    const dataSource = await this.findOwned(userId, id);
    const target = this.resolveTarget(
      userId,
      dataSource.id,
      dataSource.connectionRef,
    );
    if (!target) {
      return { status: 'disconnected' };
    }
    const verdict = this.safety.validate(sql);
    if (!verdict.ok) {
      return { status: 'blocked', reason: verdict.reason };
    }

    const queryHash = createHash('sha256')
      .update(`${id}::${verdict.sql}`)
      .digest('hex');
    const cached = await this.prisma.queryResultCache.findUnique({
      where: { queryHash },
    });
    if (cached) {
      const payload = cached.resultJson as unknown as CachedPayload;
      return {
        status: 'ok',
        sql: verdict.sql,
        cached: true,
        rowCount: payload.rowCount,
        latencyMs: 0,
        chart: payload.chart,
        rows: payload.rows,
      };
    }

    try {
      const { rows, fields, rowCount, latencyMs } =
        await this.targetDb.runReadOnly(target, verdict.sql);
      const chart = this.viz.pick(fields, rows);
      await this.prisma.queryResultCache
        .create({
          data: {
            queryHash,
            resultJson: {
              rows,
              rowCount,
              chart,
            } as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
      return {
        status: 'ok',
        sql: verdict.sql,
        cached: false,
        rowCount,
        latencyMs,
        chart,
        rows,
      };
    } catch (error) {
      return {
        status: 'error',
        sql: verdict.sql,
        error: error instanceof Error ? error.message : 'Execution failed',
      };
    }
  }

  private isConnected(
    connectionRef: string,
    userId: string,
    id: string,
  ): boolean {
    const parsed = this.safeParse(connectionRef);
    if (parsed?.mode === 'local') return true;
    return this.registry.has(userId, id);
  }

  private resolveTarget(
    userId: string,
    id: string,
    connectionRef: string,
  ): Target | null {
    const parsed = this.safeParse(connectionRef);
    if (parsed?.mode === 'local' && parsed.schema) {
      return {
        connectionString: this.targetDb.appConnectionString(),
        schema: parsed.schema,
        readonlyRole: true,
      };
    }
    if (parsed?.mode === 'external') {
      const live = this.registry.get(userId, id);
      if (!live) return null;
      return {
        connectionString: live.connectionString,
        schema: parsed.schema ?? 'public',
        readonlyRole: false,
      };
    }
    return null;
  }

  private label(connectionString: string): string {
    try {
      const url = new URL(connectionString);
      return `${url.host}${url.pathname}`;
    } catch {
      return 'external';
    }
  }

  private safeParse(value: string): ConnectionRef | null {
    try {
      return JSON.parse(value) as ConnectionRef;
    } catch {
      return null;
    }
  }

  private async findOwned(userId: string, id: string) {
    const dataSource = await this.prisma.dataSource.findUnique({
      where: { id },
    });
    if (!dataSource) {
      throw new NotFoundException('Data source not found');
    }
    if (dataSource.userId !== userId) {
      throw new ForbiddenException();
    }
    return dataSource;
  }
}
