import { Module } from '@nestjs/common';
import { DataSourcesModule } from '../datasources/datasources.module';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [DataSourcesModule, LlmModule, RagModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
