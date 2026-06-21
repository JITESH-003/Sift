import { Module } from '@nestjs/common';
import { DataSourcesController } from './datasources.controller';
import { DataSourcesService } from './datasources.service';
import { IntrospectionService } from './introspection.service';
import { TargetDbService } from './target-db.service';

@Module({
  controllers: [DataSourcesController],
  providers: [DataSourcesService, IntrospectionService, TargetDbService],
})
export class DataSourcesModule {}
