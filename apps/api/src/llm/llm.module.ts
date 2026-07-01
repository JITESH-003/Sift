import { Module } from '@nestjs/common';
import { LlmBudgetService } from './llm-budget.service';
import { LlmService } from './llm.service';

@Module({
  providers: [LlmService, LlmBudgetService],
  exports: [LlmService],
})
export class LlmModule {}
