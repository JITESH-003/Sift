import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { SchemaJson } from '../datasources/introspection.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

export type RetrievedExample = { question: string; sql: string };

export type Retrieved = {
  schemaChunks: string[];
  examples: RetrievedExample[];
};

type MatchRow = {
  kind: string;
  content: string;
  metaJson: Prisma.JsonValue;
  score: number;
};

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async indexSchema(
    dataSourceId: string,
    schemaJson: SchemaJson,
  ): Promise<void> {
    const chunks = this.schemaChunks(schemaJson);
    await this.prisma.embedding.deleteMany({
      where: { dataSourceId, kind: 'schema_chunk' },
    });
    if (chunks.length === 0) return;
    const vectors = await this.embeddings.embedPassages(chunks);
    for (let i = 0; i < chunks.length; i++) {
      await this.insert(dataSourceId, 'schema_chunk', chunks[i], vectors[i], {
        provider: 'local',
        model: this.embeddings.model,
        dim: this.embeddings.dim,
      });
    }
  }

  async addQaPair(
    dataSourceId: string,
    question: string,
    sql: string,
  ): Promise<void> {
    await this.prisma.embedding.deleteMany({
      where: { dataSourceId, kind: 'qa_pair', content: question },
    });
    const [vector] = await this.embeddings.embedPassages([question]);
    await this.insert(dataSourceId, 'qa_pair', question, vector, {
      provider: 'local',
      model: this.embeddings.model,
      dim: this.embeddings.dim,
      sql,
    });
  }

  async retrieve(
    dataSourceId: string,
    question: string,
    k = 5,
  ): Promise<Retrieved> {
    const literal = this.toVectorLiteral(
      await this.embeddings.embedQuery(question),
    );
    const rows = await this.prisma.$queryRaw<MatchRow[]>(Prisma.sql`
      SELECT "kind", "content", "metaJson",
             1 - ("embedding" <=> ${literal}::vector) AS score
      FROM "Embedding"
      WHERE "dataSourceId" = ${dataSourceId} AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${literal}::vector
      LIMIT ${k}
    `);
    const schemaChunks: string[] = [];
    const examples: RetrievedExample[] = [];
    for (const row of rows) {
      if (row.kind === 'qa_pair') {
        const sql = this.metaSql(row.metaJson);
        if (sql) examples.push({ question: row.content, sql });
      } else {
        schemaChunks.push(row.content);
      }
    }
    return { schemaChunks, examples };
  }

  private async insert(
    dataSourceId: string,
    kind: 'schema_chunk' | 'qa_pair',
    content: string,
    vector: number[],
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Embedding" ("id", "dataSourceId", "kind", "content", "metaJson", "embedding", "createdAt")
      VALUES (
        ${randomUUID()},
        ${dataSourceId},
        ${kind}::"EmbeddingKind",
        ${content},
        ${JSON.stringify(meta)}::jsonb,
        ${this.toVectorLiteral(vector)}::vector,
        now()
      )
    `);
  }

  private schemaChunks(schemaJson: SchemaJson): string[] {
    return schemaJson.tables.map((table) => {
      const cols = table.columns.map((c) => {
        let entry = `${c.name} (${c.type})`;
        if (c.isPrimaryKey) entry += ' primary key';
        if (c.references) entry += ` references ${c.references}`;
        return entry;
      });
      return `Table ${table.name}: ${cols.join(', ')}.`;
    });
  }

  private metaSql(meta: Prisma.JsonValue): string | null {
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      const sql = (meta as Record<string, unknown>).sql;
      if (typeof sql === 'string') return sql;
    }
    return null;
  }

  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }
}
