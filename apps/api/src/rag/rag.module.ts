import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { RetrievalService } from './retrieval.service';

@Module({
  providers: [EmbeddingService, RetrievalService],
  exports: [EmbeddingService, RetrievalService],
})
export class RagModule {}
