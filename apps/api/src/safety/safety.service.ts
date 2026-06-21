import { Injectable } from '@nestjs/common';
import { Parser } from 'node-sql-parser';

export type SafetyResult =
  | { ok: true; sql: string }
  | { ok: false; reason: string };

const ROW_LIMIT = 1000;

const BLOCKED_NESTED_TYPES = new Set([
  'insert',
  'update',
  'delete',
  'replace',
  'merge',
]);

const BLOCKED_FUNCTIONS =
  /\b(pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|lo_get|dblink|dblink_exec|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|set_config)\s*\(/i;

@Injectable()
export class SafetyService {
  private readonly parser = new Parser();

  validate(rawSql: string): SafetyResult {
    const sql = (rawSql ?? '').trim();
    if (!sql) {
      return { ok: false, reason: 'Empty query' };
    }

    let ast: unknown;
    try {
      ast = this.parser.astify(sql, { database: 'postgresql' });
    } catch {
      return { ok: false, reason: 'Could not parse SQL as PostgreSQL' };
    }

    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1) {
      return { ok: false, reason: 'Only a single statement is allowed' };
    }

    const top = statements[0] as { type?: string };
    if (top.type !== 'select') {
      return {
        ok: false,
        reason: `Only SELECT statements are allowed (got "${top.type ?? 'unknown'}")`,
      };
    }

    if (this.containsBlockedType(ast)) {
      return { ok: false, reason: 'Data-modifying statement detected' };
    }

    if (BLOCKED_FUNCTIONS.test(sql)) {
      return { ok: false, reason: 'Blocked function detected' };
    }

    const cleaned = sql.replace(/;\s*$/, '');
    return {
      ok: true,
      sql: `SELECT * FROM (${cleaned}) AS _sift_capped LIMIT ${ROW_LIMIT}`,
    };
  }

  private containsBlockedType(node: unknown): boolean {
    if (!node || typeof node !== 'object') {
      return false;
    }
    if (Array.isArray(node)) {
      return node.some((child) => this.containsBlockedType(child));
    }
    const record = node as Record<string, unknown>;
    const type = record.type;
    if (
      typeof type === 'string' &&
      BLOCKED_NESTED_TYPES.has(type.toLowerCase())
    ) {
      return true;
    }
    return Object.values(record).some((value) =>
      this.containsBlockedType(value),
    );
  }
}
