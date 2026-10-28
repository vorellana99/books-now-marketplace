import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import {
  BATCH,
  LEASE_MS,
  OutboxRelay,
} from '../../src/platform/outbox/outbox.relay.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { deliveryRows, expireLease, outboxRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { withEnv } from '../support/nest.js';
import {
  DbProbe,
  ExternalProbe,
  ProbeEvent,
  appWithProbes,
  probe,
} from '../support/outbox-probes.js';

// Un punto de espera: el consumidor avisa que llegó (`entered`) y se queda parado hasta que el test lo suelta
function latch() {
  let release!: () => void;
  let enter!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const entered = new Promise<void>((resolve) => (enter = resolve));
  return { released, release, entered, enter };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('OutboxRelay: concurrencia entre instancias (PostgreSQL real)', () => {
  // Dos aplicaciones = dos instancias del servicio, con su propio relay, sobre la misma base
  let appA: INestApplication;
  let appB: INestApplication;
  let a: OutboxRelay;
  let b: OutboxRelay;
  let writer: OutboxWriter;
  let prisma: PrismaService;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  const pending: Array<() => void> = []; // esperas por soltar al terminar cada test, para no dejar nada colgado

  beforeAll(async () => {
    appA = await appWithProbes(DbProbe, ExternalProbe);
    appB = await appWithProbes(DbProbe, ExternalProbe);
    a = appA.get(OutboxRelay);
    b = appB.get(OutboxRelay);
    writer = appA.get(OutboxWriter);
    prisma = appA.get(PrismaService);
  });
  afterAll(async () => {
    await appA.close();
    await appB.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    probe.reset();
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    pending.splice(0).forEach((release) => release());
    vi.restoreAllMocks();
  });

  const publish = (
    eventName: string,
    aggregateId: string = randomUUID(),
    note = '',
  ) =>
    prisma.$transaction((tx) =>
      writer.append(tx, [new ProbeEvent(eventName, aggregateId, note)]),
    );

  it('el bloqueo dura más que lo que tarda un lote entero, aun en el peor caso', () => {
    const WORST_CASE_PER_DELIVERY_MS = 10_000;
    expect(BATCH * WORST_CASE_PER_DELIVERY_MS).toBeLessThan(LEASE_MS);
  });

  describe('dos relays a la vez', () => {
    it('cada evento se entrega una sola vez', async () => {
      for (let i = 0; i < 30; i++)
        await publish('test.external.event', randomUUID(), String(i));
      probe.behavior = () => sleep(15); // para que los dos relays tengan entregas en curso al mismo tiempo

      const [first, second] = await Promise.all([a.runOnce(), b.runOnce()]);
      expect(first + second).toBe(2 * BATCH); // se repartieron el trabajo sin pisarse
      while (
        (await Promise.all([a.runOnce(), b.runOnce()])).some((n) => n > 0)
      );

      expect(probe.calls).toHaveLength(30);
      expect(new Set(probe.calls.map((c) => c.ctx.eventId)).size).toBe(30);
      const deliveries = await deliveryRows();
      expect(
        deliveries.every((d) => d.status === 'DONE' && d.attempts === 1),
      ).toBe(true);
    });

    it('con eventos de dos pedidos repartidos entre las dos instancias, cada pedido sale en orden', async () => {
      for (let i = 0; i < 5; i++) {
        await publish('test.external.event', 'pedido-1', `p1-${i}`);
        await publish('test.external.event', 'pedido-2', `p2-${i}`);
      }
      probe.behavior = () => sleep(10);

      let delivered = 0;
      do {
        const results = await Promise.all([a.runOnce(), b.runOnce()]);
        delivered = results[0] + results[1];
      } while (delivered > 0);

      for (const prefix of ['p1', 'p2']) {
        const notes = probe.calls
          .map((c) => (c.event as { note: string }).note)
          .filter((n) => n.startsWith(prefix));
        expect(notes).toEqual([0, 1, 2, 3, 4].map((i) => `${prefix}-${i}`));
      }
    });

    it('si una instancia se cae a mitad (reclamó y no terminó), la otra retoma la entrega cuando vence el bloqueo', async () => {
      await publish('test.external.event');
      const [event] = await outboxRows();
      // la instancia caída: reclamó la entrega (intento 1) y nunca volvió
      await query(
        "UPDATE messaging.deliveries SET attempts = 1, locked_until = now() + interval '2 minutes'",
      );
      expect(await b.runOnce()).toBe(0); // mientras el bloqueo siga vigente, nadie la toca

      await expireLease(event.id);

      expect(await b.runOnce()).toBe(1);
      expect(probe.calls[0].ctx.attempt).toBe(2);
      expect((await deliveryRows())[0]).toMatchObject({
        status: 'DONE',
        attempts: 2,
      });
    });
  });

  describe('la instancia lenta, cuyo bloqueo venció y otra retomó', () => {
    // Pasos: A reclama y se queda parada dentro del consumidor → el bloqueo vence → B reclama (intento 2) y termina
    // → A despierta. Se distingue por el número de intento: A es el 1 y B es el 2
    it('db: no pisa el DONE de la otra y su efecto se revierte', async () => {
      await publish('test.db.event');
      const [event] = await outboxRows();
      const slow = latch();
      pending.push(slow.release);
      probe.behavior = async (call) => {
        if (call.ctx.attempt === 1) {
          slow.enter();
          await slow.released;
        }
      };

      const slowRun = a.runOnce(); // A: intento 1, parado dentro del consumidor
      await slow.entered;
      await expireLease(event.id);
      await b.runOnce(); // B: intento 2, termina
      slow.release();
      await slowRun; // A despierta: ya no es dueña de la entrega

      expect((await deliveryRows())[0]).toMatchObject({
        status: 'DONE',
        attempts: 2,
        last_error: null,
      });
      // solo queda el efecto del intento 2: el del intento 1 se revirtió junto con su transacción
      const effects = await query<{ isbn: string }>(
        'SELECT isbn FROM inventory.reservations WHERE order_id = $1 ORDER BY isbn',
        [event.id],
      );
      expect(effects.map((e) => e.isbn)).toEqual(['0000000000002']);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('reclamada por otra instancia'),
      );
      expect(error).not.toHaveBeenCalled(); // no es un fallo del consumidor
    });

    it('external: no pisa el DONE, y el efecto externo pudo repetirse (al menos una vez)', async () => {
      await publish('test.external.event');
      const [event] = await outboxRows();
      const slow = latch();
      pending.push(slow.release);
      probe.behavior = async (call) => {
        if (call.ctx.attempt === 1) {
          slow.enter();
          await slow.released;
        }
      };

      const slowRun = a.runOnce();
      await slow.entered;
      await expireLease(event.id);
      await b.runOnce();
      slow.release();
      await slowRun;

      expect((await deliveryRows())[0]).toMatchObject({
        status: 'DONE',
        attempts: 2,
      });
      expect(probe.calls.map((c) => c.ctx.attempt)).toEqual([1, 2]); // el proveedor recibió dos llamadas
      expect(new Set(probe.calls.map((c) => c.ctx.eventId))).toEqual(
        new Set([event.id]),
      ); // con la misma clave de idempotencia
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('puede repetirse'),
      );
    });

    it('si la lenta falla después de que la otra terminó, no devuelve la entrega a PENDING', async () => {
      await publish('test.external.event');
      const [event] = await outboxRows();
      const slow = latch();
      pending.push(slow.release);
      probe.behavior = async (call) => {
        if (call.ctx.attempt === 1) {
          slow.enter();
          await slow.released;
          throw new Error('el error tardío de la lenta');
        }
      };

      const slowRun = a.runOnce();
      await slow.entered;
      await expireLease(event.id);
      await b.runOnce(); // DONE
      slow.release();
      await slowRun;

      const [delivery] = await deliveryRows();
      expect(delivery).toMatchObject({
        status: 'DONE',
        attempts: 2,
        last_error: null,
      });
      expect(error).not.toHaveBeenCalled(); // no se anuncia un FAILED que no ocurrió
    });

    it('un fallo tardío que habría agotado los intentos tampoco anuncia un FAILED ni lo guarda', async () => {
      // Con un máximo de 1 intento, el fallo de la lenta (intento 1) sería un FAILED si se tomara en cuenta
      const strictA = await withEnv({ OUTBOX_MAX_ATTEMPTS: '1' }, () =>
        appWithProbes(ExternalProbe),
      );
      const strictB = await withEnv({ OUTBOX_MAX_ATTEMPTS: '1' }, () =>
        appWithProbes(ExternalProbe),
      );
      try {
        await publish('test.external.event');
        const [event] = await outboxRows();
        const slow = latch();
        pending.push(slow.release);
        probe.behavior = async (call) => {
          if (call.ctx.attempt === 1) {
            slow.enter();
            await slow.released;
            throw new Error('error tardío');
          }
        };

        const slowRun = strictA.get(OutboxRelay).runOnce();
        await slow.entered;
        await expireLease(event.id);
        await strictB.get(OutboxRelay).runOnce(); // DONE en el intento 2
        slow.release();
        await slowRun;

        expect((await deliveryRows())[0]).toMatchObject({
          status: 'DONE',
          attempts: 2,
          last_error: null,
        });
        expect(error).not.toHaveBeenCalled();
      } finally {
        await strictA.close();
        await strictB.close();
      }
    });

    it('si la lenta falla tarde, no pisa el estado que dejó la otra al fallar también', async () => {
      await publish('test.external.event');
      const [event] = await outboxRows();
      const slow = latch();
      pending.push(slow.release);
      probe.behavior = async (call) => {
        if (call.ctx.attempt === 1) {
          slow.enter();
          await slow.released;
          throw new Error('error de A');
        }
        throw new Error('error de B');
      };

      const slowRun = a.runOnce();
      await slow.entered;
      await expireLease(event.id);
      await b.runOnce(); // B también falla: queda PENDING con su error
      slow.release();
      await slowRun;

      const [delivery] = await deliveryRows();
      expect(delivery).toMatchObject({ status: 'PENDING', attempts: 2 });
      expect(delivery.last_error).toContain('error de B');
    });

    it('si la lenta termina mientras la otra todavía trabaja, no marca DONE ni deja su efecto', async () => {
      await publish('test.db.event');
      const [event] = await outboxRows();
      const slow = latch();
      const fast = latch();
      pending.push(slow.release, fast.release);
      probe.behavior = async (call) => {
        if (call.ctx.attempt === 1) {
          slow.enter();
          await slow.released;
        } else {
          fast.enter(); // B reclamó y sigue dentro de su consumidor
          await fast.released;
        }
      };

      const slowRun = a.runOnce();
      await slow.entered;
      await expireLease(event.id);
      const fastRun = b.runOnce();
      await fast.entered;
      slow.release(); // A termina primero, mientras B sigue trabajando
      await slowRun;
      expect((await deliveryRows())[0].status).toBe('PENDING'); // A no la marcó DONE
      fast.release();
      await fastRun;

      expect((await deliveryRows())[0]).toMatchObject({
        status: 'DONE',
        attempts: 2,
      });
      const effects = await query<{ isbn: string }>(
        'SELECT isbn FROM inventory.reservations WHERE order_id = $1',
        [event.id],
      );
      expect(effects.map((e) => e.isbn)).toEqual(['0000000000002']);
    });
  });
});
