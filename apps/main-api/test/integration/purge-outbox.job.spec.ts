import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxPurgeJob } from '../../src/platform/outbox/outbox-purge.job.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { PURGE_BATCH } from '../../src/platform/retention/purge-in-batches.js';
import { holdRowLock, query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

type DeliveryStatus = 'PENDING' | 'DONE' | 'FAILED';

describe('OutboxPurgeJob (PostgreSQL real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const job = (days = 30) =>
    new OutboxPurgeJob(
      prisma,
      new ConfigService({ RETENTION_OUTBOX_DAYS: days }),
    );

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  // Un mensaje del outbox de hace `ageDays` días con una entrega por cada estado indicado
  async function message(
    ageDays: number,
    deliveries: DeliveryStatus[],
  ): Promise<string> {
    const [row] = await query<{ id: string }>(
      `INSERT INTO messaging.outbox (event_name, event_version, aggregate_id, payload, occurred_on)
       VALUES ('probe.event', 1, $1, '{}', now() - make_interval(days => $2)) RETURNING id`,
      [randomUUID(), ageDays],
    );
    const id = (row as { id: string }).id;
    for (const [i, status] of deliveries.entries()) {
      await query(
        `INSERT INTO messaging.deliveries (event_id, consumer, status) VALUES ($1, $2, $3::messaging."DeliveryStatus")`,
        [id, `consumer-${i}`, status],
      );
    }
    return id;
  }

  const exists = async (id: string) =>
    (await query('SELECT 1 FROM messaging.outbox WHERE id = $1', [id]))
      .length === 1;
  const deliveriesOf = async (id: string) =>
    (
      await query('SELECT 1 FROM messaging.deliveries WHERE event_id = $1', [
        id,
      ])
    ).length;
  const count = async () =>
    Number(
      (
        await query<{ n: string }>('SELECT count(*) AS n FROM messaging.outbox')
      )[0]?.n,
    );

  it('borra un mensaje viejo con todas sus entregas DONE, y sus entregas con él', async () => {
    const id = await message(31, ['DONE', 'DONE']);

    expect(await job().run()).toBe(1);

    expect(await exists(id)).toBe(false);
    expect(await deliveriesOf(id)).toBe(0);
  });

  it('no borra un mensaje con una entrega PENDING, por viejo que sea', async () => {
    const id = await message(400, ['DONE', 'PENDING']);

    expect(await job().run()).toBe(0);

    expect(await exists(id)).toBe(true);
    expect(await deliveriesOf(id)).toBe(2);
  });

  it('nunca borra un FAILED: un evento sin entregar no se oculta por ser viejo', async () => {
    const failed = await message(3000, ['FAILED']);
    const mixed = await message(3000, ['DONE', 'FAILED']);

    expect(await job().run()).toBe(0);

    expect(await exists(failed)).toBe(true);
    expect(await exists(mixed)).toBe(true);
  });

  it('no borra un mensaje reciente, aunque ya esté entregado', async () => {
    const recent = await message(1, ['DONE']);
    const edge = await message(29, ['DONE']);

    expect(await job().run()).toBe(0);

    expect(await exists(recent)).toBe(true);
    expect(await exists(edge)).toBe(true);
  });

  it('el plazo sale de RETENTION_OUTBOX_DAYS', async () => {
    const id = await message(10, ['DONE']);

    expect(await job(30).run()).toBe(0);
    expect(await job(7).run()).toBe(1);

    expect(await exists(id)).toBe(false);
  });

  it('un mensaje viejo sin entregas también se borra', async () => {
    const id = await message(40, []);

    expect(await job().run()).toBe(1);

    expect(await exists(id)).toBe(false);
  });

  it('mezcla: borra solo lo que corresponde', async () => {
    const gone = await message(60, ['DONE']);
    const pending = await message(60, ['PENDING']);
    const failed = await message(60, ['FAILED']);
    const recent = await message(2, ['DONE']);

    expect(await job().run()).toBe(1);

    expect(await exists(gone)).toBe(false);
    expect(await exists(pending)).toBe(true);
    expect(await exists(failed)).toBe(true);
    expect(await exists(recent)).toBe(true);
  });

  it('pasa de largo por un mensaje que otra transacción tiene bloqueado, en vez de esperarla (SKIP LOCKED)', async () => {
    const free1 = await message(40, ['DONE']);
    const free2 = await message(40, ['DONE']);
    const busy = await message(40, ['DONE']);
    const release = await holdRowLock(
      'SELECT 1 FROM messaging.outbox WHERE id = $1 FOR UPDATE',
      [busy],
    );
    try {
      expect(await job().run()).toBe(2);
      expect(await exists(free1)).toBe(false);
      expect(await exists(free2)).toBe(false);
      expect(await exists(busy)).toBe(true);
    } finally {
      await release();
    }
    expect(await job().run()).toBe(1); // ya liberado, el siguiente pase lo borra
    expect(await exists(busy)).toBe(false);
  });

  it('vacía más de un lote en una sola vuelta', async () => {
    const total = PURGE_BATCH * 2 + 500;
    await query(
      `INSERT INTO messaging.outbox (event_name, event_version, aggregate_id, payload, occurred_on)
       SELECT 'probe.event', 1, gen_random_uuid()::text, '{}', now() - interval '40 days' FROM generate_series(1, $1)`,
      [total],
    );

    expect(await job().run()).toBe(total);

    expect(await count()).toBe(0);
  });

  it('dos instancias a la vez no se pisan: entre las dos borran cada mensaje una sola vez', async () => {
    const total = PURGE_BATCH + 700;
    await query(
      `INSERT INTO messaging.outbox (event_name, event_version, aggregate_id, payload, occurred_on)
       SELECT 'probe.event', 1, gen_random_uuid()::text, '{}', now() - interval '40 days' FROM generate_series(1, $1)`,
      [total],
    );

    const [a, b] = await Promise.all([job().run(), job().run()]);

    expect(a + b).toBe(total);
    expect(await count()).toBe(0);
  });
});
