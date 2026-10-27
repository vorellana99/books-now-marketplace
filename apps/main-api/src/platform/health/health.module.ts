import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DbHealthIndicator } from './db.health.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule], // HealthCheckService y HealthIndicatorService
  controllers: [HealthController],
  providers: [DbHealthIndicator],
})
export class HealthModule {}
