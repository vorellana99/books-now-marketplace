import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxRelay } from './outbox.relay.js';

// Lo usa GET /health/outbox, pensado para monitoreo y alertas (no para el balanceador)
@Injectable()
export class OutboxHealthIndicator {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly prisma: PrismaService,
    private readonly health: HealthIndicatorService,
  ) {}

  async check(key = 'outbox') {
    const indicator = this.health.check(key);
    const relayLastRunAt = this.relay.lastRunAtIso;
    try {
      // Solo informativo: no cambia el estado. Qué cantidad es "demasiada" lo decide el monitoreo
      const [failed, due] = await Promise.all([
        this.prisma.delivery.count({ where: { status: 'FAILED' } }),
        this.prisma.delivery.count({
          where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        }),
      ]);
      const details = { relayLastRunAt, failed, due };
      // Marca down solo si el relay de esta instancia está detenido: una FAILED antigua o un reintento en espera no
      return this.relay.isAlive()
        ? indicator.up(details)
        : indicator.down(details);
    } catch (error) {
      return indicator.down({ relayLastRunAt, error: String(error) });
    }
  }
}
