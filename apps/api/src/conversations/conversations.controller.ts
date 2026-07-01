import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { AskDto } from './dto/ask.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { FeedbackDto } from './dto/feedback.dto';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversations.create(userId, dto);
  }

  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.conversations.list(userId);
  }

  @Get(':id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.conversations.get(userId, id);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post(':id/ask')
  ask(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: AskDto,
  ) {
    return this.conversations.ask(userId, id, dto.question);
  }

  @HttpCode(HttpStatus.OK)
  @Post('messages/:messageId/feedback')
  feedback(
    @CurrentUser('userId') userId: string,
    @Param('messageId') messageId: string,
    @Body() dto: FeedbackDto,
  ) {
    return this.conversations.recordFeedback(userId, messageId, dto.vote);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post(':id/ask/stream')
  async askStream(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: AskDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const final = await this.conversations.ask(
        userId,
        id,
        dto.question,
        (event) => {
          send(event.type, event);
        },
      );
      send('final', final);
    } catch (error) {
      send('error', {
        message: error instanceof Error ? error.message : 'Request failed',
      });
    } finally {
      res.end();
    }
  }
}
