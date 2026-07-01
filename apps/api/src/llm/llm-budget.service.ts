import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LlmBudgetService {
  private readonly logger = new Logger(LlmBudgetService.name);
  private readonly dailyLimit: number;
  private day = '';
  private count = 0;

  constructor(config: ConfigService) {
    this.dailyLimit = Number(config.get<string>('LLM_DAILY_LIMIT') ?? 500);
  }

  consume(): void {
    if (!Number.isFinite(this.dailyLimit) || this.dailyLimit <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.count = 0;
    }
    if (this.count >= this.dailyLimit) {
      this.logger.warn(`Daily LLM limit (${this.dailyLimit}) reached`);
      throw new ServiceUnavailableException(
        'The demo has reached its daily query limit. Please try again tomorrow.',
      );
    }
    this.count += 1;
  }
}
