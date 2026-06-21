import { Module } from '@nestjs/common';
import { SafetyModule } from '../safety/safety.module';
import { DataSourcesController } from './datasources.controller';
import { DataSourcesService } from './datasources.service';
import { IntrospectionService } from './introspection.service';
import { TargetDbService } from './target-db.service';
import { VizService } from './viz.service';

@Module({
  imports: [SafetyModule],
  controllers: [DataSourcesController],
  providers: [
    DataSourcesService,
    IntrospectionService,
    TargetDbService,
    VizService,
  ],
})
export class DataSourcesModule {}
