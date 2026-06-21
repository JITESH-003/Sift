import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { CreateDataSourceDto } from './dto/create-datasource.dto';
import { IntrospectionService } from './introspection.service';
import { TargetDbService } from './target-db.service';
import { VizService, type Chart } from './viz.service';

type CachedPayload = {
  rows: Record<string, unknown>[];
  rowCount: number;
  chart: Chart;
};

type RunResult =
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
  | { status: 'error'; sql: string; error: string };

@Injectable()
export class DataSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly introspection: IntrospectionService,
    private readonly safety: SafetyService,
    private readonly targetDb: TargetDbService,
    private readonly viz: VizService,
  ) {}

  create(userId: string, dto: CreateDataSourceDto) {
    return this.prisma.dataSource.create({
      data: {
        userId,
        name: dto.name,
        connectionRef: JSON.stringify({ mode: 'local', schema: dto.schema }),
      },
    });
  }

  list(userId: string) {
    return this.prisma.dataSource.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const dataSource = await this.findOwned(userId, id);
    const snapshot = await this.prisma.schemaSnapshot.findFirst({
      where: { dataSourceId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { ...dataSource, snapshot };
  }

  async introspect(userId: string, id: string) {
    const dataSource = await this.findOwned(userId, id);
    const schema = this.resolveSchema(dataSource.connectionRef);
    const { schemaJson, compactText } =
      await this.introspection.introspect(schema);
    return this.prisma.schemaSnapshot.create({
      data: {
        dataSourceId: id,
        schemaJson: schemaJson,
        compactText,
      },
    });
  }

  async run(userId: string, id: string, sql: string): Promise<RunResult> {
    const dataSource = await this.findOwned(userId, id);
    const schema = this.resolveSchema(dataSource.connectionRef);
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
        await this.targetDb.runReadOnly(schema, verdict.sql);
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

  private resolveSchema(connectionRef: string): string {
    const parsed = this.safeParse(connectionRef);
    if (parsed?.mode === 'local' && parsed.schema) {
      return parsed.schema;
    }
    throw new BadRequestException('Unsupported data source connection');
  }

  private safeParse(value: string): { mode?: string; schema?: string } | null {
    try {
      return JSON.parse(value) as { mode?: string; schema?: string };
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
