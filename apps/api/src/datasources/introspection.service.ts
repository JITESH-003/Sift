import { Injectable } from '@nestjs/common';
import { TargetDbService } from './target-db.service';

export type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  references?: string;
};

export type TableInfo = { name: string; columns: ColumnInfo[] };

export type SchemaJson = { schema: string; tables: TableInfo[] };

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
};

type KeyRow = { table_name: string; column_name: string };

type FkRow = {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
};

@Injectable()
export class IntrospectionService {
  constructor(private readonly db: TargetDbService) {}

  async introspect(
    schema: string,
  ): Promise<{ schemaJson: SchemaJson; compactText: string }> {
    const tableRows = await this.db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema],
    );
    const columnRows = await this.db.query<ColumnRow>(
      `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1
       ORDER BY table_name, ordinal_position`,
      [schema],
    );
    const pkRows = await this.db.query<KeyRow>(
      `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
      [schema],
    );
    const fkRows = await this.db.query<FkRow>(
      `SELECT tc.table_name,
              kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
       WHERE tc.table_schema = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
      [schema],
    );

    const pkSet = new Set(
      pkRows.map((r) => `${r.table_name}.${r.column_name}`),
    );
    const fkMap = new Map<string, string>();
    for (const r of fkRows) {
      fkMap.set(
        `${r.table_name}.${r.column_name}`,
        `${r.foreign_table_name}.${r.foreign_column_name}`,
      );
    }

    const tables: TableInfo[] = tableRows.map((t) => {
      const columns: ColumnInfo[] = columnRows
        .filter((c) => c.table_name === t.table_name)
        .map((c) => {
          const key = `${c.table_name}.${c.column_name}`;
          const column: ColumnInfo = {
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === 'YES',
            isPrimaryKey: pkSet.has(key),
          };
          const ref = fkMap.get(key);
          if (ref) {
            column.references = ref;
          }
          return column;
        });
      return { name: t.table_name, columns };
    });

    const schemaJson: SchemaJson = { schema, tables };
    return { schemaJson, compactText: this.toCompactText(schemaJson) };
  }

  private toCompactText(schemaJson: SchemaJson): string {
    const lines = schemaJson.tables.map((table) => {
      const cols = table.columns.map((c) => {
        let entry = `${c.name} ${c.type}`;
        if (c.isPrimaryKey) {
          entry += ' PK';
        }
        if (c.references) {
          entry += ` -> ${c.references}`;
        }
        return entry;
      });
      return `${table.name}(${cols.join(', ')})`;
    });
    return `Schema "${schemaJson.schema}" (PostgreSQL)\n\n${lines.join('\n')}`;
  }
}
