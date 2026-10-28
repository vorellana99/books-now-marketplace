import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { RequestContext } from '../observability/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxRegistry } from './outbox.registry.js';

export const LEASE_MS = 2 * 60_000; // bloqueo de cada entrega reclamada
export const STOP_TIMEOUT_MS = 15_000; // cuánto espera el cierre a una vuelta en curso (antes de que el orquestador mate el proceso)
export const BATCH = 10; // BATCH × duración máxima por entrega (10 s) = 100 s < LEASE_MS

type Claimed = {
  eventId: string;
  consumer: string;
  attempts: number;
  payload: unknown;
  occurredOn: Date;
  correlationId: string | null;
};

// El bloqueo de esta entrega venció y otra instancia la reclamó: lo que hizo esta ya no vale
class LeaseLostError extends Error {
  constructor(d: Claimed) {
    super(`Entrega ${d.consumer}/${d.eventId} reclamada por otra instancia`);
  }
}

@Injectable()
export class OutboxRelay implements BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private running = false;
  private runStartedAt: number | null = null;
  private lastRunAt: number | null = null;
  private stopping = false;
  private currentRun: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxRegistry,
    private readonly config: ConfigService,
  ) {}

  // Viva si está en una vuelta que aún no supera el bloqueo, o si terminó una hace menos de 1 minuto.
  // Una vuelta legítima dura hasta ~100 s (10 × 10 s): mientras no supere LEASE_MS, cuenta como viva
  isAlive(now = Date.now()): boolean {
    if (this.running && this.runStartedAt !== null)
      return now - this.runStartedAt < LEASE_MS;
    return this.lastRunAt !== null && now - this.lastRunAt < 60_000;
  }

  get lastRunAtIso(): string | null {
    return this.lastRunAt === null
      ? null
      : new Date(this.lastRunAt).toISOString();
  }

  @Interval(1000)
  async tick(): Promise<void> {
    if (this.running || this.stopping) return; // una vuelta a la vez por instancia, y ninguna nueva al cerrar
    this.running = true;
    this.runStartedAt = Date.now();
    const run = (async () => {
      try {
        await this.runOnce();
        this.lastRunAt = Date.now(); // solo cuenta una vuelta que terminó bien
      } catch (err) {
        this.logger.error(`Vuelta del relay fallida: ${String(err)}`);
      } finally {
        this.running = false;
        this.runStartedAt = null;
      }
    })();
    this.currentRun = run;
    await run;
    this.currentRun = null;
  }

  // Deja de empezar vueltas y espera (con un tope) a la que esté en curso, para no cortar una entrega a medias
  async stop(timeoutMs = STOP_TIMEOUT_MS): Promise<void> {
    this.stopping = true;
    const run = this.currentRun;
    if (!run) return;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      run.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    if (timedOut) {
      this.logger.warn(
        `La vuelta del relay no terminó en ${timeoutMs} ms; se cierra igual (sus entregas se reintentan al vencer el bloqueo)`,
      );
    }
  }

  // Antes de que se cierre la conexión a la base: ver PrismaService.onApplicationShutdown
  async beforeApplicationShutdown(): Promise<void> {
    await this.stop();
  }

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
      if (err instanceof LeaseLostError) {
        this.logger.warn(`${err.message}; efecto revertido`);
        return;
      }
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
        const { count } = await tx.delivery.updateMany({
          where: mine,
          data: { status: 'DONE', lockedUntil: null },
        });
        // Si el bloqueo venció y otra instancia reclamó la entrega, `attempts` ya cambió: se revierte también el efecto
        if (count === 0) throw new LeaseLostError(d);
      });
    } else {
      // Efecto externo: ninguna transacción abierta mientras se espera la red
      await consumer.handle(d.payload, ctx);
      const { count } = await this.prisma.delivery.updateMany({
        where: mine,
        data: { status: 'DONE', lockedUntil: null },
      });
      // El efecto externo no se puede deshacer: puede haberse repetido, por eso el proveedor recibe `eventId`
      if (count === 0) {
        this.logger.warn(
          `Entrega ${d.consumer}/${d.eventId} reclamada por otra instancia; puede repetirse (idempotencia por eventId)`,
        );
      }
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
    const updated = await this.prisma.$executeRaw`
      UPDATE messaging.deliveries
      SET status = ${status}::messaging."DeliveryStatus",
          next_attempt_at = now() + make_interval(secs => ${backoffSeconds}),
          locked_until = NULL,
          last_error = ${reason}
      WHERE event_id = ${d.eventId}::uuid AND consumer = ${d.consumer}
        AND attempts = ${d.attempts} AND status = 'PENDING'::messaging."DeliveryStatus"`;

    const message = `Entrega ${d.consumer} de ${d.eventId}, intento ${d.attempts}: ${String(err)}`;
    if (updated === 0) {
      // Otra instancia ya la reclamó o la terminó: este fallo es tardío y no cambia nada, ni debe anunciar un FAILED
      this.logger.warn(
        `${message} (ignorado: la entrega ya es de otra instancia)`,
      );
      return;
    }
    if (failed) this.logger.error(`FAILED. ${message}`);
    else this.logger.warn(message);
  }
}
