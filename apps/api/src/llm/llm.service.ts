import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmBudgetService } from './llm-budget.service';

type Usage = { promptTokens: number; completionTokens: number };

type GenResult = { sql: string; usage: Usage; provider: string };

export type FewShotExample = { question: string; sql: string };

export type GenerateOptions = {
  errorFeedback?: string;
  examples?: FewShotExample[];
  model?: string;
};

type Provider = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

type ChatResponse = {
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const CATALOG: Record<
  string,
  {
    urlKey: string;
    keyKey: string;
    modelKey: string;
    defaultUrl: string;
    defaultModel: string;
  }
> = {
  gemini: {
    urlKey: 'GEMINI_BASE_URL',
    keyKey: 'GEMINI_API_KEY',
    modelKey: 'GEMINI_MODEL',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash',
  },
  groq: {
    urlKey: 'GROQ_BASE_URL',
    keyKey: 'GROQ_API_KEY',
    modelKey: 'GROQ_MODEL',
    defaultUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly budget: LlmBudgetService,
  ) {}

  async generateSql(
    schemaContext: string,
    question: string,
    options: GenerateOptions = {},
  ): Promise<GenResult> {
    const providers = this.providers();
    if (providers.length === 0) {
      throw new Error(
        'No LLM provider configured (set GEMINI_API_KEY or GROQ_API_KEY)',
      );
    }
    this.budget.consume();
    const messages = this.buildMessages(schemaContext, question, options);
    const failures: string[] = [];
    for (const provider of providers) {
      try {
        return await this.call(provider, messages, options.model);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider.name} (${message})`);
        this.logger.warn(`LLM provider "${provider.name}" failed: ${message}`);
      }
    }
    throw new Error(`All LLM providers failed: ${failures.join(' -> ')}`);
  }

  private providers(): Provider[] {
    const order = (
      this.config.get<string>('LLM_FALLBACK_ORDER') ?? 'gemini,groq'
    )
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
    const providers: Provider[] = [];
    for (const name of order) {
      const def = CATALOG[name];
      if (!def) continue;
      const apiKey = this.config.get<string>(def.keyKey)?.trim();
      if (!apiKey) continue;
      providers.push({
        name,
        baseUrl: this.config.get<string>(def.urlKey) ?? def.defaultUrl,
        apiKey,
        model: this.config.get<string>(def.modelKey) ?? def.defaultModel,
      });
    }
    return providers;
  }

  private buildMessages(
    schemaContext: string,
    question: string,
    options: GenerateOptions,
  ): { role: string; content: string }[] {
    const system = [
      'You are a PostgreSQL expert that writes a single read-only SQL query to answer a question.',
      'Rules:',
      '- Output ONLY the SQL. No prose, no markdown, no comments.',
      '- Exactly one statement, and it must be a SELECT (CTEs are allowed).',
      '- Never modify data. Use only the tables and columns in the schema below.',
      '- Copy every table and column name EXACTLY as written in the schema below, including any double quotes shown — never drop the quotes from a quoted name. PostgreSQL lowercases unquoted identifiers, so writing "Ticket" as Ticket will fail with "relation does not exist".',
      '- For time series, GROUP BY date_trunc on the timestamp column (one date column), not separate year/month columns.',
      '- Add a sensible ORDER BY and LIMIT for "top N" style questions.',
      '- Any example question/SQL pairs shown are known-good queries for this schema — follow their conventions and identifier quoting.',
      '',
      'Schema:',
      schemaContext,
    ].join('\n');
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: system },
    ];
    for (const example of options.examples ?? []) {
      messages.push({ role: 'user', content: example.question });
      messages.push({ role: 'assistant', content: example.sql });
    }
    messages.push({ role: 'user', content: question });
    if (options.errorFeedback) {
      messages.push({
        role: 'user',
        content: `The previous query failed with this error:\n${options.errorFeedback}\nReturn a corrected SQL query.`,
      });
    }
    return messages;
  }

  private async call(
    provider: Provider,
    messages: { role: string; content: string }[],
    modelOverride?: string,
  ): Promise<GenResult> {
    const base = provider.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: modelOverride ?? provider.model,
        messages,
        temperature: 0,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`HTTP ${response.status} ${detail}`);
    }
    const data = (await response.json()) as ChatResponse;
    const raw = data.choices[0]?.message?.content ?? '';
    return {
      sql: this.extractSql(raw),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
      provider: provider.name,
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
