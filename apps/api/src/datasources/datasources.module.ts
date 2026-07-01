import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { SafetyModule } from '../safety/safety.module';
import { DataSourcesController } from './datasources.controller';
import { DataSourcesService } from './datasources.service';
import { IntrospectionService } from './introspection.service';
import { TargetDbService } from './target-db.service';
import { VizService } from './viz.service';

@Module({
  imports: [SafetyModule, RagModule],
  controllers: [DataSourcesController],
  providers: [
    DataSourcesService,
    IntrospectionService,
    TargetDbService,
    VizService,
  ],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
