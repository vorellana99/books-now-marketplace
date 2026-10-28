import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { OutboxHealthIndicator } from '../outbox/outbox.health.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { DbHealthIndicator } from './db.health.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, OutboxModule], // HealthCheckService, HealthIndicatorService y el relay
  controllers: [HealthController],
  providers: [DbHealthIndicator, OutboxHealthIndicator],
})
export class HealthModule {}
