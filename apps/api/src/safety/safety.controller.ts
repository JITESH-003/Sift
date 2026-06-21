import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ValidateSqlDto } from './dto/validate-sql.dto';
import { SafetyService } from './safety.service';

@UseGuards(JwtAuthGuard)
@Controller('sql')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @HttpCode(HttpStatus.OK)
  @Post('validate')
  validate(@Body() dto: ValidateSqlDto) {
    return this.safety.validate(dto.sql);
  }
}
