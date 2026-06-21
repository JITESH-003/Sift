import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Usage = { promptTokens: number; completionTokens: number };

type ChatResponse = {
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

@Injectable()
export class LlmService {
  constructor(private readonly config: ConfigService) {}

  async generateSql(
    schemaContext: string,
    question: string,
    errorFeedback?: string,
  ): Promise<{ sql: string; usage: Usage }> {
    const system = [
      'You are a PostgreSQL expert that writes a single read-only SQL query to answer a question.',
      'Rules:',
      '- Output ONLY the SQL. No prose, no markdown, no comments.',
      '- Exactly one statement, and it must be a SELECT (CTEs are allowed).',
      '- Never modify data. Use only the tables and columns in the schema below.',
      '- Add a sensible ORDER BY and LIMIT for "top N" style questions.',
      '',
      'Schema:',
      schemaContext,
    ].join('\n');

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: system },
      { role: 'user', content: question },
    ];
    if (errorFeedback) {
      messages.push({
        role: 'user',
        content: `The previous query failed with this error:\n${errorFeedback}\nReturn a corrected SQL query.`,
      });
    }

    const response = await fetch(
      `${this.config.getOrThrow<string>('LLM_BASE_URL')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.getOrThrow<string>('LLM_API_KEY')}`,
        },
        body: JSON.stringify({
          model: this.config.getOrThrow<string>('LLM_MODEL'),
          messages,
          temperature: 0,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as ChatResponse;
    const raw = data.choices[0]?.message?.content ?? '';
    return {
      sql: this.extractSql(raw),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  private extractSql(raw: string): string {
    let text = raw.trim();
    const fenced = /```(?:sql)?\s*([\s\S]*?)```/i.exec(text);
    if (fenced) {
      text = fenced[1].trim();
    }
    return text.replace(/;\s*$/, '').trim();
  }
}
