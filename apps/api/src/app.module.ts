import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConnectionModule } from './connections/connection.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DataSourcesModule } from './datasources/datasources.module';
import { HealthController } from './health/health.controller';
import { LlmModule } from './llm/llm.module';
import { PrismaModule } from './prisma/prisma.module';
import { SafetyModule } from './safety/safety.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ConnectionModule,
    PrismaModule,
    AuthModule,
    DataSourcesModule,
    SafetyModule,
    LlmModule,
    ConversationsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
