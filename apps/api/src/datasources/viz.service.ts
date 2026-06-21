import { Injectable } from '@nestjs/common';
import type { FieldInfo } from './target-db.service';

export type Chart =
  | { type: 'stat'; label: string; value: unknown }
  | { type: 'line'; x: string; y: string }
  | { type: 'bar'; x: string; y: string }
  | { type: 'table'; columns: string[] };

@Injectable()
export class VizService {
  pick(fields: FieldInfo[], rows: Record<string, unknown>[]): Chart {
    const numbers = fields.filter((f) => f.kind === 'number');
    const dates = fields.filter((f) => f.kind === 'date');
    const categories = fields.filter((f) => f.kind === 'string');

    if (rows.length === 1 && fields.length === 1 && numbers.length === 1) {
      return {
        type: 'stat',
        label: numbers[0].name,
        value: rows[0][numbers[0].name],
      };
    }
    if (dates.length >= 1 && numbers.length >= 1) {
      return { type: 'line', x: dates[0].name, y: numbers[0].name };
    }
    if (categories.length >= 1 && numbers.length >= 1 && rows.length <= 50) {
      return { type: 'bar', x: categories[0].name, y: numbers[0].name };
    }
    return { type: 'table', columns: fields.map((f) => f.name) };
  }
}
