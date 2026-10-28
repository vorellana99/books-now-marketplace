import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { OutboxHealthIndicator } from '../outbox/outbox.health.js';
import { DbHealthIndicator } from './db.health.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DbHealthIndicator, // SELECT 1
    private readonly outbox: OutboxHealthIndicator,
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

  // para monitoreo y alertas, no para el balanceador: un proveedor de email lento no debe sacar de servicio las instancias
  @Get('outbox')
  @HealthCheck()
  outboxStatus() {
    return this.health.check([() => this.outbox.check()]);
  }
}
