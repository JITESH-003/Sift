import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSourcesService,
  type RunResult,
} from '../datasources/datasources.service';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService, type Retrieved } from '../rag/retrieval.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

export type AskStreamEvent =
  | { type: 'status'; value: 'generating' | 'executing' | 'retrying' }
  | { type: 'sql'; sql: string };

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataSources: DataSourcesService,
    private readonly llm: LlmService,
    private readonly retrieval: RetrievalService,
  ) {}

  async create(userId: string, dto: CreateConversationDto) {
    const dataSource = await this.prisma.dataSource.findUnique({
      where: { id: dto.dataSourceId },
    });
    if (!dataSource) {
      throw new NotFoundException('Data source not found');
    }
    if (dataSource.userId !== userId) {
      throw new ForbiddenException();
    }
    return this.prisma.conversation.create({
      data: {
        userId,
        dataSourceId: dto.dataSourceId,
        title: dto.title ?? null,
      },
    });
  }

  list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const conversation = await this.findOwned(userId, id);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      include: { query: true },
    });
    return { ...conversation, messages };
  }

  async ask(
    userId: string,
    id: string,
    question: string,
    onEvent: (event: AskStreamEvent) => void = () => undefined,
  ) {
    const conversation = await this.findOwned(userId, id);
    const snapshot = await this.prisma.schemaSnapshot.findFirst({
      where: { dataSourceId: conversation.dataSourceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!snapshot) {
      throw new BadRequestException(
        'Introspect the data source before asking questions',
      );
    }

    const connected = await this.dataSources.connectionState(
      userId,
      conversation.dataSourceId,
    );
    if (!connected) {
      return {
        status: 'disconnected' as const,
        meta: {
          confidence: 'low',
          retried: false,
          provider: '-',
          promptTokens: 0,
          completionTokens: 0,
          examplesUsed: 0,
        },
      };
    }

    if (!conversation.title) {
      await this.prisma.conversation.update({
        where: { id },
        data: { title: question.slice(0, 60) },
      });
    }

    await this.prisma.message.create({
      data: { conversationId: id, role: 'user', content: question },
    });

    const retrieved = await this.retrieveSafe(
      conversation.dataSourceId,
      question,
    );

    onEvent({ type: 'status', value: 'generating' });
    let generated = await this.llm.generateSql(snapshot.compactText, question, {
      examples: retrieved.examples,
    });
    onEvent({ type: 'sql', sql: generated.sql });
    onEvent({ type: 'status', value: 'executing' });
    let result = await this.dataSources.run(
      userId,
      conversation.dataSourceId,
      generated.sql,
    );
    let promptTokens = generated.usage.promptTokens;
    let completionTokens = generated.usage.completionTokens;
    let retried = false;

    if (result.status === 'error' || result.status === 'blocked') {
      onEvent({ type: 'status', value: 'retrying' });
      let feedback = result.status === 'error' ? result.error : result.reason;
      if (result.status === 'error' && /does not exist/i.test(result.error)) {
        feedback +=
          '\nIdentifiers are case-sensitive — wrap table and column names in double quotes (e.g. "TableName").';
      }
      const retry = await this.llm.generateSql(snapshot.compactText, question, {
        errorFeedback: feedback,
        examples: retrieved.examples,
      });
      onEvent({ type: 'sql', sql: retry.sql });
      onEvent({ type: 'status', value: 'executing' });
      result = await this.dataSources.run(
        userId,
        conversation.dataSourceId,
        retry.sql,
      );
      retried = true;
      generated = retry;
      promptTokens += retry.usage.promptTokens;
      completionTokens += retry.usage.completionTokens;
    }

    const confidence =
      result.status === 'ok' ? (retried ? 'medium' : 'high') : 'low';

    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId: id,
        role: 'assistant',
        content: this.summarize(result),
      },
    });

    if (result.status !== 'disconnected') {
      await this.prisma.query.create({
        data: {
          messageId: assistantMessage.id,
          sql: result.status === 'blocked' ? generated.sql : result.sql,
          status: result.status,
          rowCount: result.status === 'ok' ? result.rowCount : null,
          latencyMs: result.status === 'ok' ? result.latencyMs : null,
          promptTokens,
          completionTokens,
          confidence,
          retried,
          errorText:
            result.status === 'error'
              ? result.error
              : result.status === 'blocked'
                ? result.reason
                : null,
        },
      });
    }

    return {
      ...result,
      messageId: assistantMessage.id,
      meta: {
        confidence,
        retried,
        provider: generated.provider,
        promptTokens,
        completionTokens,
        examplesUsed: retrieved.examples.length,
      },
    };
  }

  async recordFeedback(
    userId: string,
    messageId: string,
    vote: 'up' | 'down',
  ): Promise<{ vote: 'up' | 'down'; promoted: boolean }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true, query: true },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (message.conversation.userId !== userId) {
      throw new ForbiddenException();
    }

    const existing = await this.prisma.feedback.findFirst({
      where: { messageId, userId },
    });
    const alreadyUp = existing?.vote === 'up';
    if (existing) {
      await this.prisma.feedback.update({
        where: { id: existing.id },
        data: { vote },
      });
    } else {
      await this.prisma.feedback.create({
        data: { messageId, userId, vote },
      });
    }

    let promoted = false;
    if (
      vote === 'up' &&
      !alreadyUp &&
      message.role === 'assistant' &&
      message.query?.status === 'ok'
    ) {
      const question = await this.prisma.message.findFirst({
        where: {
          conversationId: message.conversationId,
          role: 'user',
          createdAt: { lt: message.createdAt },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (question) {
        await this.retrieval.addQaPair(
          message.conversation.dataSourceId,
          question.content,
          message.query.sql,
        );
        promoted = true;
      }
    }
    return { vote, promoted };
  }

  private async retrieveSafe(
    dataSourceId: string,
    question: string,
  ): Promise<Retrieved> {
    try {
      return await this.retrieval.retrieve(dataSourceId, question);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Retrieval failed for ${dataSourceId}: ${message}`);
      return { schemaChunks: [], examples: [] };
    }
  }

  private summarize(result: RunResult): string {
    if (result.status === 'ok') {
      return `Returned ${result.rowCount} row(s).`;
    }
    if (result.status === 'blocked') {
      return `Blocked: ${result.reason}`;
    }
    if (result.status === 'disconnected') {
      return 'Reconnect the database to run this query.';
    }
    return `Error: ${result.error}`;
  }

  private async findOwned(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException();
    }
    return conversation;
  }
}
