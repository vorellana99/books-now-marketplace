import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  private readonly logger = new Logger(OutboxRelay.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxRegistry,
    private readonly config: ConfigService,
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
    try {
      await this.attempt(d);
    } catch (err) {
      await this.recordFailure(d, err);
    }
  }

  private async attempt(d: Claimed): Promise<void> {
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

  // Deja la entrega lista para otro intento, o la da por FAILED si ya no quedan.
  // La hora del próximo intento sale del reloj de la base de datos, el mismo que usa el bloqueo: las columnas son
  // TIMESTAMP sin zona horaria, y mezclar la hora de la aplicación con `now()` las desfasaría si difieren
  private async recordFailure(d: Claimed, err: unknown): Promise<void> {
    const max = this.config.get<number>('OUTBOX_MAX_ATTEMPTS', 8);
    const failed = d.attempts >= max;
    const backoffSeconds = Math.min(2 ** d.attempts, 5 * 60); // 2 s, 4 s, 8 s… hasta 5 min
    const reason = String(err).slice(0, 1000);
    const status = failed ? 'FAILED' : 'PENDING';

    // También con la comprobación del intento: no pisa lo que haya hecho otra instancia
    await this.prisma.$executeRaw`
      UPDATE messaging.deliveries
      SET status = ${status}::messaging."DeliveryStatus",
          next_attempt_at = now() + make_interval(secs => ${backoffSeconds}),
          locked_until = NULL,
          last_error = ${reason}
      WHERE event_id = ${d.eventId}::uuid AND consumer = ${d.consumer}
        AND attempts = ${d.attempts} AND status = 'PENDING'::messaging."DeliveryStatus"`;

    const message = `Entrega ${d.consumer} de ${d.eventId}, intento ${d.attempts}: ${String(err)}`;
    if (failed) this.logger.error(`FAILED. ${message}`);
    else this.logger.warn(message);
  }
}
