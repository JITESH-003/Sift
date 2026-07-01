import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DataSourcesService } from './datasources.service';
import { ConnectDataSourceDto } from './dto/connect-datasource.dto';
import { CreateDataSourceDto } from './dto/create-datasource.dto';
import { RunSqlDto } from './dto/run-sql.dto';

@UseGuards(JwtAuthGuard)
@Controller('datasources')
export class DataSourcesController {
  constructor(private readonly dataSources: DataSourcesService) {}

  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateDataSourceDto,
  ) {
    return this.dataSources.create(userId, dto);
  }

  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.dataSources.list(userId);
  }

  @Get(':id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.dataSources.get(userId, id);
  }

  @Post(':id/introspect')
  introspect(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.dataSources.introspect(userId, id);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/run')
  run(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: RunSqlDto,
  ) {
    return this.dataSources.run(userId, id, dto.sql);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/connect')
  connect(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: ConnectDataSourceDto,
  ) {
    return this.dataSources.connect(userId, id, dto.connectionString);
  }
}
