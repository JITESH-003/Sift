import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    ConnectionModule,
    PrismaModule,
    AuthModule,
    DataSourcesModule,
    SafetyModule,
    LlmModule,
    ConversationsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
