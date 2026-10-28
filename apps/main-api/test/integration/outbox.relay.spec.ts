import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import {
  BATCH,
  LEASE_MS,
  OutboxRelay,
} from '../../src/platform/outbox/outbox.relay.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  deliveryRows,
  expireLease,
  makeDeliveriesDue,
  outboxRows,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import {
  DbProbe,
  ExternalProbe,
  ProbeEvent,
  appWithProbes,
  probe,
} from '../support/outbox-probes.js';

describe('OutboxRelay: reclamar y entregar (PostgreSQL real)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;
  let writer: OutboxWriter;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await appWithProbes(DbProbe, ExternalProbe);
    relay = app.get(OutboxRelay);
    writer = app.get(OutboxWriter);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    probe.reset();
  });

  // Guarda un evento como lo haría un pedido: en su propia transacción
  const publish = (
    eventName: string,
    aggregateId: string = randomUUID(),
    note = '',
  ) =>
    prisma.$transaction((tx) =>
      writer.append(tx, [new ProbeEvent(eventName, aggregateId, note)]),
    );

  const idleInTransaction = async () =>
    Number(
      (
        await query<{ n: string }>(
          "SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction'",
        )
      )[0].n,
    );

  const effectsOf = (eventId: string) =>
    query<{ isbn: string }>(
      'SELECT isbn FROM inventory.reservations WHERE order_id = $1',
      [eventId],
    );

  describe('entrega', () => {
    it('entrega el evento a un consumidor db y marca la entrega DONE', async () => {
      await publish('test.db.event', 'agg-1', 'hola');
      const [event] = await outboxRows();

      const claimed = await relay.runOnce();

      expect(claimed).toBe(1);
      expect(probe.calls).toHaveLength(1);
      const [call] = probe.calls;
      expect(call.consumer).toBe('test.db');
      expect(call.event).toMatchObject({ aggregateId: 'agg-1', note: 'hola' });
      expect(call.ctx).toMatchObject({
        eventId: event.id,
        attempt: 1,
        correlationId: null,
      });
      expect(call.ctx.occurredOn.toISOString()).toBe(
        event.occurred_on.toISOString(),
      );
      const [delivery] = await deliveryRows();
      expect(delivery).toMatchObject({
        status: 'DONE',
        attempts: 1,
        locked_until: null,
      });
    });

    it('entrega el evento a un consumidor external y marca la entrega DONE', async () => {
      await publish('test.external.event');

      expect(await relay.runOnce()).toBe(1);

      expect(probe.calls.map((c) => c.consumer)).toEqual(['test.external']);
      expect((await deliveryRows())[0]).toMatchObject({
        status: 'DONE',
        attempts: 1,
        locked_until: null,
      });
    });

    it('no vuelve a entregar lo que ya está DONE', async () => {
      await publish('test.db.event');
      await relay.runOnce();

      expect(await relay.runOnce()).toBe(0);
      expect(probe.calls).toHaveLength(1);
    });

    it('sin entregas pendientes devuelve 0 y no hace nada', async () => {
      expect(await relay.runOnce()).toBe(0);
      expect(probe.calls).toEqual([]);
    });

    it('al reclamar, la entrega queda bloqueada por 2 minutos y con un intento más', async () => {
      await publish('test.external.event');
      let seen: Awaited<ReturnType<typeof deliveryRows>>[number] | undefined;
      probe.behavior = async () => {
        [seen] = await deliveryRows(); // otra conexión, mientras el consumidor todavía corre
      };

      await relay.runOnce();

      expect(seen).toMatchObject({ status: 'PENDING', attempts: 1 });
      const lockedFor = seen!.locked_until!.getTime() - Date.now();
      expect(lockedFor).toBeGreaterThan(LEASE_MS - 15_000);
      expect(lockedFor).toBeLessThanOrEqual(LEASE_MS);
    });
  });

  describe('qué entregas reclama', () => {
    it('no reclama una entrega cuyo reintento todavía no toca', async () => {
      await publish('test.db.event');
      await query(
        "UPDATE messaging.deliveries SET next_attempt_at = now() + interval '1 hour'",
      );

      expect(await relay.runOnce()).toBe(0);

      await makeDeliveriesDue();
      expect(await relay.runOnce()).toBe(1);
    });

    it('no reclama una entrega con el bloqueo vigente', async () => {
      await publish('test.db.event');
      await query(
        "UPDATE messaging.deliveries SET locked_until = now() + interval '1 minute'",
      );

      expect(await relay.runOnce()).toBe(0);
    });

    it('reclama como mucho un lote por vuelta, las más antiguas primero', async () => {
      for (let i = 0; i < 25; i++)
        await publish('test.external.event', randomUUID(), String(i));

      expect(await relay.runOnce()).toBe(BATCH);
      expect(
        probe.calls.map((c) => Number((c.event as { note: string }).note)),
      ).toEqual(Array.from({ length: BATCH }, (_, i) => i));

      expect(await relay.runOnce()).toBe(BATCH);
      expect(await relay.runOnce()).toBe(5);
      expect(await relay.runOnce()).toBe(0);
      expect(probe.calls).toHaveLength(25);
    });
  });

  describe('el lote sale en orden de antigüedad, no en el orden físico de la tabla', () => {
    // Desordena todo lo que un plan sin ORDER BY podría usar para devolver las filas "en orden": el orden físico de
    // outbox y de deliveries, y el índice por next_attempt_at. Las `n` filas más antiguas quedan al final de las
    // dos tablas y con un next_attempt_at posterior al de las nuevas (todas siguen vencidas)
    const scrambleOrder = async (n: number) => {
      const oldest = `(SELECT id FROM messaging.outbox ORDER BY id LIMIT ${n})`;
      await query(
        `UPDATE messaging.deliveries SET next_attempt_at = now() - interval '1 hour' WHERE event_id NOT IN ${oldest}`,
      );
      await query(
        `UPDATE messaging.deliveries SET next_attempt_at = now() - interval '1 minute' WHERE event_id IN ${oldest}`,
      );
      await query(
        `UPDATE messaging.outbox SET correlation_id = correlation_id WHERE id IN ${oldest}`,
      );
      await query(`ANALYZE messaging.deliveries`);
    };

    // Actualizar una fila en PostgreSQL deja su versión nueva al final de la tabla: así las más antiguas quedan
    // físicamente detrás de las nuevas. Sin ORDER BY, el lote saldría en ese orden físico
    it('reclama primero las más antiguas aunque estén al final de la tabla', async () => {
      for (let i = 0; i < 25; i++)
        await publish('test.external.event', randomUUID(), String(i));
      await scrambleOrder(10);

      await relay.runOnce();

      expect(
        probe.calls.map((c) => Number((c.event as { note: string }).note)),
      ).toEqual(Array.from({ length: BATCH }, (_, i) => i));
    });

    it('dentro del lote, entrega en orden de antigüedad', async () => {
      for (let i = 0; i < 5; i++)
        await publish('test.external.event', randomUUID(), String(i));
      await scrambleOrder(2);

      await relay.runOnce();

      expect(
        probe.calls.map((c) => Number((c.event as { note: string }).note)),
      ).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('db: el efecto y DONE van en la misma transacción', () => {
    it('hasta que el consumidor termina, nadie ve el efecto ni el DONE; después, los dos a la vez', async () => {
      await publish('test.db.event');
      const [event] = await outboxRows();
      let during: { effects: number; status: string } | undefined;
      probe.behavior = async () => {
        // el consumidor ya hizo su efecto, pero la transacción sigue abierta
        during = {
          effects: (await effectsOf(event.id)).length,
          status: (await deliveryRows())[0].status,
        };
      };

      await relay.runOnce();

      expect(during).toEqual({ effects: 0, status: 'PENDING' });
      expect((await effectsOf(event.id)).map((e) => e.isbn)).toEqual([
        '0000000000001',
      ]);
      expect((await deliveryRows())[0].status).toBe('DONE');
    });

    it('el consumidor db corre dentro de una transacción abierta', async () => {
      await publish('test.db.event');
      let open = -1;
      probe.behavior = async () => {
        open = await idleInTransaction();
      };

      await relay.runOnce();

      expect(open).toBeGreaterThanOrEqual(1); // control: la medición detecta una transacción abierta
    });
  });

  describe('external: sin transacción abierta mientras espera', () => {
    it('no hay ninguna transacción abierta mientras corre el consumidor', async () => {
      await publish('test.external.event');
      let open = -1;
      probe.behavior = async () => {
        open = await idleInTransaction();
      };

      await relay.runOnce();

      expect(open).toBe(0);
    });
  });

  describe('correlationId', () => {
    it('restaura el requestId de origen mientras corre el consumidor', async () => {
      await RequestContext.run('r-origen', () =>
        publish('test.external.event'),
      );

      await relay.runOnce();

      const [call] = probe.calls;
      expect(call.requestId).toBe('r-origen');
      expect(call.ctx.correlationId).toBe('r-origen');
    });

    it('sin requestId de origen usa event-<id> para que los logs sigan siendo rastreables', async () => {
      await publish('test.external.event');
      const [event] = await outboxRows();

      await relay.runOnce();

      const [call] = probe.calls;
      expect(call.requestId).toBe(`event-${event.id}`);
      expect(call.ctx.correlationId).toBeNull();
    });

    it('el requestId no se filtra fuera de la entrega', async () => {
      await RequestContext.run('r-origen', () =>
        publish('test.external.event'),
      );
      await relay.runOnce();
      expect(RequestContext.requestId()).toBeUndefined();
    });
  });

  describe('orden por pedido', () => {
    it('no entrega un evento mientras el anterior del mismo pedido siga pendiente', async () => {
      await publish('test.external.event', 'pedido-1', 'primero');
      await publish('test.external.event', 'pedido-1', 'segundo');

      expect(await relay.runOnce()).toBe(1); // solo el primero
      expect(
        probe.calls.map((c) => (c.event as { note: string }).note),
      ).toEqual(['primero']);

      expect(await relay.runOnce()).toBe(1);
      expect(
        probe.calls.map((c) => (c.event as { note: string }).note),
      ).toEqual(['primero', 'segundo']);
    });

    it('eventos del mismo pedido guardados juntos también se entregan en orden', async () => {
      await prisma.$transaction((tx) =>
        writer.append(tx, [
          new ProbeEvent('test.external.event', 'pedido-1', 'a'),
          new ProbeEvent('test.external.event', 'pedido-1', 'b'),
          new ProbeEvent('test.external.event', 'pedido-1', 'c'),
        ]),
      );

      while ((await relay.runOnce()) > 0);

      expect(
        probe.calls.map((c) => (c.event as { note: string }).note),
      ).toEqual(['a', 'b', 'c']);
    });

    it('pedidos distintos no se esperan: se entregan en la misma vuelta', async () => {
      await publish('test.external.event', 'pedido-1');
      await publish('test.external.event', 'pedido-2');

      expect(await relay.runOnce()).toBe(2);
    });

    it('el orden es por consumidor: un evento pendiente de un consumidor no frena a otro', async () => {
      // dos consumidores distintos sobre pedidos distintos de eventos distintos: no interfieren
      await publish('test.db.event', 'pedido-1');
      await publish('test.external.event', 'pedido-1');

      expect(await relay.runOnce()).toBe(2);
    });
  });

  it('un bloqueo vencido vuelve a ser reclamable (el reclamo anterior se perdió)', async () => {
    await publish('test.db.event');
    const [event] = await outboxRows();
    await query(
      "UPDATE messaging.deliveries SET locked_until = now() + interval '1 minute', attempts = 1",
    );
    expect(await relay.runOnce()).toBe(0);

    await expireLease(event.id);

    expect(await relay.runOnce()).toBe(1);
    expect(probe.calls[0].ctx.attempt).toBe(2); // es el segundo intento
    expect((await deliveryRows())[0]).toMatchObject({
      status: 'DONE',
      attempts: 2,
    });
  });
});
