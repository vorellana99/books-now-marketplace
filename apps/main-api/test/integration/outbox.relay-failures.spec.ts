import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  deliveryRows,
  expireLease,
  makeDeliveriesDue,
  outboxRows,
  secondsUntilRetry,
} from '../support/builders.js';
import {
  query,
  resetDatabase,
  useDatabaseTimeZone,
} from '../support/database.js';
import { withEnv } from '../support/nest.js';
import {
  DbProbe,
  ExternalProbe,
  ProbeEvent,
  SharedDbProbe,
  SharedExternalProbe,
  appWithProbes,
  probe,
} from '../support/outbox-probes.js';

const MAX = 3;

describe('OutboxRelay: fallos, reintentos y FAILED (PostgreSQL real)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;
  let writer: OutboxWriter;
  let prisma: PrismaService;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    app = await withEnv({ OUTBOX_MAX_ATTEMPTS: String(MAX) }, () =>
      appWithProbes(DbProbe, ExternalProbe, SharedDbProbe, SharedExternalProbe),
    );
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
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
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

  const failWith = (message: string) => async () => {
    throw new Error(message);
  };

  describe('un consumidor que falla', () => {
    it('la vuelta no falla: la entrega queda PENDING con el error y el bloqueo liberado', async () => {
      await publish('test.external.event');
      probe.behavior = failWith('el proveedor no responde');

      await expect(relay.runOnce()).resolves.toBe(1);

      const [delivery] = await deliveryRows();
      expect(delivery).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        locked_until: null,
      });
      expect(delivery.last_error).toContain('el proveedor no responde');
    });

    it('el primer reintento tarda 2 segundos y no se reclama antes de tiempo', async () => {
      await publish('test.external.event');
      probe.behavior = failWith('boom');
      await relay.runOnce();

      const wait = await secondsUntilRetry();
      expect(wait).toBeGreaterThan(1);
      expect(wait).toBeLessThanOrEqual(2);
      expect(await relay.runOnce()).toBe(0); // todavía no toca
      expect(probe.calls).toHaveLength(1);
    });

    it('al vencer el reintento se vuelve a intentar, con el intento número 2 y una espera mayor', async () => {
      await publish('test.external.event');
      probe.behavior = failWith('boom');
      await relay.runOnce();
      await makeDeliveriesDue();

      await relay.runOnce();

      expect(probe.calls.map((c) => c.ctx.attempt)).toEqual([1, 2]);
      const wait = await secondsUntilRetry();
      expect(wait).toBeGreaterThan(3);
      expect(wait).toBeLessThanOrEqual(4);
    });

    it('si el reintento sale bien, la entrega queda DONE y conserva el último error', async () => {
      await publish('test.external.event');
      probe.behavior = failWith('boom');
      await relay.runOnce();
      await makeDeliveriesDue();
      probe.behavior = undefined;

      await relay.runOnce();

      expect((await deliveryRows())[0]).toMatchObject({
        status: 'DONE',
        attempts: 2,
      });
    });

    it('un fallo no detiene a las demás entregas del lote', async () => {
      for (let i = 0; i < 3; i++)
        await publish('test.external.event', randomUUID(), String(i));
      probe.behavior = async (call) => {
        if ((call.event as { note: string }).note === '1')
          throw new Error('solo falla la del medio');
      };

      expect(await relay.runOnce()).toBe(3);

      const statuses = (await deliveryRows()).map((d) => d.status);
      expect(statuses.filter((s) => s === 'DONE')).toHaveLength(2);
      expect(statuses.filter((s) => s === 'PENDING')).toHaveLength(1);
    });

    it('un fallo en una entrega no toca las de otros consumidores del mismo evento', async () => {
      await publish('test.shared.event');
      probe.behavior = async (call) => {
        if (call.consumer === 'test.shared-external')
          throw new Error('falla el externo');
      };

      await relay.runOnce();

      const byConsumer = Object.fromEntries(
        (await deliveryRows()).map((d) => [d.consumer, d.status]),
      );
      expect(byConsumer).toEqual({
        'test.shared-db': 'DONE',
        'test.shared-external': 'PENDING',
      });
    });
  });

  describe('db: el fallo revierte el efecto', () => {
    it('si el consumidor lanza un error después de su efecto, el efecto no queda', async () => {
      await publish('test.db.event');
      const [event] = await outboxRows();
      probe.behavior = failWith('falló después del efecto'); // el efecto ya se insertó en la transacción

      await relay.runOnce();

      const effects = await query(
        'SELECT 1 FROM inventory.reservations WHERE order_id = $1',
        [event.id],
      );
      expect(effects).toEqual([]);
      expect((await deliveryRows())[0]).toMatchObject({
        status: 'PENDING',
        attempts: 1,
      });
    });
  });

  describe('al agotar los intentos', () => {
    const failUntilExhausted = async () => {
      for (let i = 0; i < MAX; i++) {
        await relay.runOnce();
        await makeDeliveriesDue();
      }
    };

    it(`tras ${MAX} intentos queda FAILED con el motivo`, async () => {
      await publish('test.external.event');
      probe.behavior = failWith('sigue fallando');

      await failUntilExhausted();

      const [delivery] = await deliveryRows();
      expect(delivery).toMatchObject({
        status: 'FAILED',
        attempts: MAX,
        locked_until: null,
      });
      expect(delivery.last_error).toContain('sigue fallando');
      expect(probe.calls).toHaveLength(MAX);
    });

    it('una entrega FAILED no se vuelve a reclamar, aunque su fecha ya haya pasado', async () => {
      await publish('test.external.event');
      probe.behavior = failWith('boom');
      await failUntilExhausted();
      await query(
        "UPDATE messaging.deliveries SET next_attempt_at = now() - interval '1 hour'",
      );

      expect(await relay.runOnce()).toBe(0);
    });

    it('FAILED no borra nada: el evento y su payload quedan para inspeccionarlos', async () => {
      await publish('test.external.event', 'pedido-9', 'importante');
      probe.behavior = failWith('boom');
      await failUntilExhausted();

      const [row] = await outboxRows();
      expect(row.payload).toMatchObject({
        aggregateId: 'pedido-9',
        note: 'importante',
      });
    });

    it('cada intento fallido se avisa como warning y el paso a FAILED como error', async () => {
      await publish('test.external.event');
      const [event] = await (async () => await outboxRows())();
      probe.behavior = failWith('boom');

      await failUntilExhausted();

      expect(warn).toHaveBeenCalledTimes(MAX - 1);
      expect(error).toHaveBeenCalledTimes(1);
      const message = String(error.mock.calls[0][0]);
      expect(message).toContain('FAILED');
      expect(message).toContain('test.external');
      expect(message).toContain(event.id);
      expect(message).toContain(`intento ${MAX}`);
    });

    it('un evento FAILED no frena los siguientes del mismo pedido', async () => {
      await publish('test.external.event', 'pedido-1', 'primero');
      probe.behavior = failWith('boom');
      await failUntilExhausted();
      probe.reset();
      await publish('test.external.event', 'pedido-1', 'segundo');

      await relay.runOnce();

      expect(
        probe.calls.map((c) => (c.event as { note: string }).note),
      ).toEqual(['segundo']);
    });

    it('el SQL de reprocesar de la guía devuelve las FAILED a PENDING y se entregan', async () => {
      await publish('test.external.event');
      probe.behavior = failWith('boom');
      await failUntilExhausted();
      probe.reset();

      await query(
        `UPDATE messaging.deliveries
         SET status = 'PENDING', attempts = 0, next_attempt_at = now(), last_error = NULL
         WHERE status = 'FAILED' AND consumer = 'test.external'`,
      );
      await relay.runOnce();

      expect((await deliveryRows())[0]).toMatchObject({
        status: 'DONE',
        attempts: 1,
        last_error: null,
      });
    });
  });

  describe('orden por pedido con reintentos', () => {
    it('mientras el evento anterior espera su reintento, el siguiente del mismo pedido no se entrega', async () => {
      await publish('test.external.event', 'pedido-1', 'primero');
      await publish('test.external.event', 'pedido-1', 'segundo');
      probe.behavior = failWith('boom');
      await relay.runOnce(); // falla el primero

      probe.behavior = undefined;
      expect(await relay.runOnce()).toBe(0); // el segundo sigue esperando al primero

      await makeDeliveriesDue();
      await relay.runOnce(); // el primero sale bien
      await relay.runOnce(); // ahora sí el segundo
      expect(
        probe.calls.map((c) => (c.event as { note: string }).note),
      ).toEqual(['primero', 'primero', 'segundo']);
    });
  });

  describe('casos límite', () => {
    it('un consumidor que ya no está registrado falla con un mensaje claro y acaba en FAILED', async () => {
      const eventId = randomUUID();
      await query(
        `INSERT INTO messaging.outbox (id, event_name, event_version, aggregate_id, payload, occurred_on)
         VALUES ($1, 'test.ghost', 1, 'agg-1', '{}', now())`,
        [eventId],
      );
      await query(
        "INSERT INTO messaging.deliveries (event_id, consumer) VALUES ($1, 'consumidor.fantasma')",
        [eventId],
      );

      for (let i = 0; i < MAX; i++) {
        await relay.runOnce();
        await makeDeliveriesDue();
      }

      const [delivery] = await deliveryRows();
      expect(delivery.status).toBe('FAILED');
      expect(delivery.last_error).toContain(
        'Consumidor no registrado: consumidor.fantasma',
      );
    });

    it('guarda como mucho 1000 caracteres del error', async () => {
      await publish('test.external.event');
      probe.behavior = failWith('x'.repeat(5000));

      await relay.runOnce();

      expect((await deliveryRows())[0].last_error!.length).toBeLessThanOrEqual(
        1000,
      );
    });

    it('también guarda errores que no son instancias de Error', async () => {
      await publish('test.external.event');
      probe.behavior = async () => {
        throw 'un texto suelto';
      };

      await relay.runOnce();

      expect((await deliveryRows())[0].last_error).toBe('un texto suelto');
    });
  });
});

describe('OutboxRelay: retroceso exponencial y su tope (PostgreSQL real)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;
  let writer: OutboxWriter;
  let prisma: PrismaService;

  beforeAll(async () => {
    // un máximo alto, para que el tope de 5 minutos se alcance sin llegar a FAILED
    app = await withEnv({ OUTBOX_MAX_ATTEMPTS: '50' }, () =>
      appWithProbes(ExternalProbe),
    );
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
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [1, 2],
    [2, 4],
    [3, 8],
    [5, 32],
    [8, 256],
    [9, 300], // 2^9 = 512 s: se corta en 5 minutos
    [20, 300],
  ])('en el intento %i espera %i segundos', async (attempt, expected) => {
    await prisma.$transaction((tx) =>
      writer.append(tx, [new ProbeEvent('test.external.event', randomUUID())]),
    );
    await query('UPDATE messaging.deliveries SET attempts = $1', [attempt - 1]); // el reclamo lo sube a `attempt`
    probe.behavior = async () => {
      throw new Error('boom');
    };

    await relay.runOnce();

    const wait = await secondsUntilRetry();
    expect(wait).toBeGreaterThan(expected - 2);
    expect(wait).toBeLessThanOrEqual(expected);
    expect((await deliveryRows())[0]).toMatchObject({
      status: 'PENDING',
      attempts: attempt,
    });
  });
});

describe('OutboxRelay: con una base de datos que no trabaja en UTC (PostgreSQL real)', () => {
  // Las columnas son TIMESTAMP sin zona horaria. Prisma rellena @default(now()) en el cliente, en UTC, y el relay
  // compara con now() de la base. Si las conexiones usaran la zona de la base (UTC−5 aquí), una entrega nueva
  // quedaría programada 5 horas en el futuro y nada se entregaría. Por eso la aplicación fuerza UTC en sus conexiones
  let app: INestApplication;
  let relay: OutboxRelay;
  let writer: OutboxWriter;
  let prisma: PrismaService;
  let restoreTimeZone: () => Promise<void>;

  beforeAll(async () => {
    restoreTimeZone = await useDatabaseTimeZone('America/Lima');
    app = await appWithProbes(ExternalProbe); // sus conexiones nacen cuando la base ya está en otra zona
    relay = app.get(OutboxRelay);
    writer = app.get(OutboxWriter);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
    await restoreTimeZone();
  });
  beforeEach(async () => {
    await resetDatabase(); // también restaura la zona; se vuelve a poner justo debajo
    await useDatabaseTimeZone('America/Lima');
    probe.reset();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const publish = () =>
    prisma.$transaction((tx) =>
      writer.append(tx, [new ProbeEvent('test.external.event', randomUUID())]),
    );

  it('la base está configurada en otra zona, pero las conexiones de la aplicación trabajan en UTC', async () => {
    const [setting] = await query<{ config: string[] }>(
      `SELECT setconfig AS config FROM pg_db_role_setting
       WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    );
    expect(setting.config.join(',')).toMatch(/timezone=America\/Lima/i);

    const [{ tz }] = await prisma.$queryRaw<
      { tz: string }[]
    >`SELECT current_setting('timezone') AS tz`;
    expect(tz).toBe('UTC');
  });

  it('una entrega nueva está lista al instante, no dentro de 5 horas', async () => {
    await publish();
    expect(await secondsUntilRetry()).toBeLessThanOrEqual(1);
    expect(await relay.runOnce()).toBe(1);
  });

  it('un reintento tras un fallo sigue tardando segundos, no horas', async () => {
    await publish();
    probe.behavior = async () => {
      throw new Error('boom');
    };

    await relay.runOnce();

    const wait = await secondsUntilRetry();
    expect(wait).toBeGreaterThan(1);
    expect(wait).toBeLessThanOrEqual(2);
  });

  it('el reintento vence y se vuelve a entregar sin intervención', async () => {
    await publish();
    probe.behavior = async () => {
      throw new Error('boom');
    };
    await relay.runOnce();
    await new Promise((resolve) => setTimeout(resolve, 2200)); // esperar el reintento real de 2 s
    probe.behavior = undefined;

    expect(await relay.runOnce()).toBe(1);
    expect((await deliveryRows())[0]).toMatchObject({
      status: 'DONE',
      attempts: 2,
    });
  });

  it('el bloqueo se respeta mientras es vigente y se retoma al vencer', async () => {
    await publish();
    const [event] = await outboxRows();
    probe.behavior = async () => {
      // mientras el consumidor corre, otra vuelta no debe poder reclamar la misma entrega
      expect(await relay.runOnce()).toBe(0);
    };
    await relay.runOnce();
    expect((await deliveryRows())[0].status).toBe('DONE');

    // un reclamo perdido: con el bloqueo vigente no se retoma, vencido sí
    await query(
      "UPDATE messaging.deliveries SET status = 'PENDING', locked_until = now() + interval '1 minute'",
    );
    expect(await relay.runOnce()).toBe(0);
    await expireLease(event.id);
    expect(await relay.runOnce()).toBe(1);
  });
});

describe('OutboxRelay: el reloj de los reintentos es el de la base de datos (PostgreSQL real)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;
  let writer: OutboxWriter;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await appWithProbes(ExternalProbe);
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
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con el reloj de la aplicación una hora adelantado, el reintento sigue siendo de 2 segundos', async () => {
    await prisma.$transaction((tx) =>
      writer.append(tx, [new ProbeEvent('test.external.event', randomUUID())]),
    );
    probe.behavior = async () => {
      throw new Error('boom');
    };
    // solo se adelanta Date: los temporizadores y la red siguen funcionando
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3_600_000);

    await relay.runOnce();
    vi.useRealTimers();

    const wait = await secondsUntilRetry();
    expect(wait).toBeGreaterThan(1);
    expect(wait).toBeLessThanOrEqual(2);
  });
});
