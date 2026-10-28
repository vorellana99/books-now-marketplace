import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { CatalogModule } from './contexts/catalog/catalog.module.js';
import { InventoryModule } from './contexts/inventory/inventory.module.js';
import { SalesModule } from './contexts/sales/sales.module.js';
import { envSchema } from './platform/config/env.schema.js';
import { HealthModule } from './platform/health/health.module.js';
import { OutboxModule } from './platform/outbox/outbox.module.js';
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
    OutboxModule, // writer y relay; el intervalo lo pone en marcha ScheduleModule, de arriba
    HealthModule,
    CatalogModule,
    InventoryModule,
    SalesModule,
  ],
})
export class AppModule {}
