import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSourcesService,
  type RunResult,
} from '../datasources/datasources.service';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataSources: DataSourcesService,
    private readonly llm: LlmService,
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

  async ask(userId: string, id: string, question: string) {
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

    await this.prisma.message.create({
      data: { conversationId: id, role: 'user', content: question },
    });

    const generated = await this.llm.generateSql(
      snapshot.compactText,
      question,
    );
    const result = await this.dataSources.run(
      userId,
      conversation.dataSourceId,
      generated.sql,
    );
    const confidence = result.status === 'ok' ? 'high' : 'low';

    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId: id,
        role: 'assistant',
        content: this.summarize(result),
      },
    });

    await this.prisma.query.create({
      data: {
        messageId: assistantMessage.id,
        sql: result.status === 'blocked' ? generated.sql : result.sql,
        status: result.status,
        rowCount: result.status === 'ok' ? result.rowCount : null,
        latencyMs: result.status === 'ok' ? result.latencyMs : null,
        promptTokens: generated.usage.promptTokens,
        completionTokens: generated.usage.completionTokens,
        confidence,
        errorText:
          result.status === 'error'
            ? result.error
            : result.status === 'blocked'
              ? result.reason
              : null,
      },
    });

    return {
      ...result,
      meta: {
        confidence,
        provider: generated.provider,
        promptTokens: generated.usage.promptTokens,
        completionTokens: generated.usage.completionTokens,
      },
    };
  }

  private summarize(result: RunResult): string {
    if (result.status === 'ok') {
      return `Returned ${result.rowCount} row(s).`;
    }
    if (result.status === 'blocked') {
      return `Blocked: ${result.reason}`;
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
