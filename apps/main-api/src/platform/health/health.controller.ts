import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DbHealthIndicator } from './db.health.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DbHealthIndicator, // SELECT 1
  ) {}

  // liveness: el proceso responde (no toca la BD)
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  // readiness: para el balanceador (solo la BD)
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.check()]);
  }
}
