import { Injectable } from '@nestjs/common';
import { RequestContext } from '../observability/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxRegistry } from './outbox.registry.js';

export const LEASE_MS = 2 * 60_000; // bloqueo de cada entrega reclamada
export const BATCH = 10; // BATCH × duración máxima por entrega (10 s) = 100 s < LEASE_MS

type Claimed = {
  eventId: string;
  consumer: string;
  attempts: number;
  payload: unknown;
  occurredOn: Date;
  correlationId: string | null;
};

@Injectable()
export class OutboxRelay {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxRegistry,
  ) {}

  // Una vuelta: reclama un lote acotado y entrega cada elemento. Devuelve cuántas entregas reclamó
  async runOnce(): Promise<number> {
    // SKIP LOCKED: dos instancias nunca toman la misma entrega.
    // NOT EXISTS: no adelanta un evento si el mismo consumidor tiene pendiente uno anterior
    // del mismo agregado (orden por agregado y consumidor).
    const claimed = await this.prisma.$queryRaw<Claimed[]>`
      WITH c AS (
        UPDATE messaging.deliveries d
        SET locked_until = now() + make_interval(secs => ${LEASE_MS / 1000}),
            attempts = d.attempts + 1
        WHERE (d.event_id, d.consumer) IN (
          SELECT d2.event_id, d2.consumer
          FROM messaging.deliveries d2
          JOIN messaging.outbox o2 ON o2.id = d2.event_id
          WHERE d2.status = 'PENDING' AND d2.next_attempt_at <= now()
            AND (d2.locked_until IS NULL OR d2.locked_until < now())
            AND NOT EXISTS (
              SELECT 1 FROM messaging.deliveries p
              JOIN messaging.outbox po ON po.id = p.event_id
              WHERE p.consumer = d2.consumer AND po.aggregate_id = o2.aggregate_id
                AND p.status = 'PENDING' AND p.event_id < d2.event_id)
          ORDER BY d2.event_id
          LIMIT ${BATCH}
          FOR UPDATE OF d2 SKIP LOCKED)
        RETURNING d.event_id, d.consumer, d.attempts)
      SELECT c.event_id AS "eventId", c.consumer, c.attempts, o.payload,
             o.occurred_on AS "occurredOn", o.correlation_id AS "correlationId"
      FROM c JOIN messaging.outbox o ON o.id = c.event_id
      ORDER BY c.event_id`;

    for (const delivery of claimed) {
      // Restaura el requestId de origen: los logs del consumidor (y los eventos que genere) lo heredan
      await RequestContext.run(
        delivery.correlationId ?? `event-${delivery.eventId}`,
        () => this.deliver(delivery),
      );
    }
    return claimed.length;
  }

  private async deliver(d: Claimed): Promise<void> {
    const consumer = this.registry.get(d.consumer);
    if (!consumer) throw new Error(`Consumidor no registrado: ${d.consumer}`);

    // Cada actualización exige que la entrega siga siendo nuestra (mismo intento, aún PENDING)
    const mine = {
      eventId: d.eventId,
      consumer: d.consumer,
      attempts: d.attempts,
      status: 'PENDING' as const,
    };
    const ctx = {
      eventId: d.eventId,
      occurredOn: d.occurredOn,
      attempt: d.attempts,
      correlationId: d.correlationId,
    };

    if (consumer.kind === 'db') {
      // Efecto local + DONE en la misma transacción: se confirman juntos o ninguno
      await this.prisma.$transaction(async (tx) => {
        await consumer.handle(d.payload, { ...ctx, tx });
        await tx.delivery.updateMany({
          where: mine,
          data: { status: 'DONE', lockedUntil: null },
        });
      });
    } else {
      // Efecto externo: ninguna transacción abierta mientras se espera la red
      await consumer.handle(d.payload, ctx);
      await this.prisma.delivery.updateMany({
        where: mine,
        data: { status: 'DONE', lockedUntil: null },
      });
    }
  }
}
