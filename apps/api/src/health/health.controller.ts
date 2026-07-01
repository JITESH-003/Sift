import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; service: string } {
    return { status: 'ok', service: 'sift-api' };
  }
}
