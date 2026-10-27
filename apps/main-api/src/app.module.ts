import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { envSchema } from './platform/config/env.schema.js';
import { HealthModule } from './platform/health/health.module.js';
import { PrismaModule } from './platform/prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => envSchema.parse(env),
    }),
    CqrsModule.forRoot(), // CommandBus y QueryBus
    ScheduleModule.forRoot(), // @Interval del relay y @Cron del job de recuperación
    PrismaModule, // @Global: exporta PrismaService
    HealthModule,
  ],
})
export class AppModule {}
