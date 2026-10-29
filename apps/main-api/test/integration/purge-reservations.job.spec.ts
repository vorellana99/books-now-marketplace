import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaStockRepository } from '../../src/contexts/inventory/infrastructure/persistence/prisma-stock.repository.js';
import { PurgeReservationsJob } from '../../src/contexts/inventory/application/stock/purge-reservations.job.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { PURGE_BATCH } from '../../src/platform/retention/purge-in-batches.js';
import { uniqueIsbn } from '../support/builders.js';
import { holdRowLock, query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

describe('PurgeReservationsJob (PostgreSQL real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const job = (days = 90) =>
    new PurgeReservationsJob(
      new PrismaStockRepository(prisma),
      new ConfigService({ RETENTION_RESERVATION_DAYS: days }),
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

  async function reservation(
    ageDays: number,
    status: 'HELD' | 'CONFIRMED',
  ): Promise<string> {
    const orderId = randomUUID();
    await query(
      `INSERT INTO inventory.reservations (order_id, isbn, quantity, status, created_at)
       VALUES ($1, $2, 1, $3::inventory."ReservationStatus", now() - make_interval(days => $4))`,
      [orderId, uniqueIsbn(), status, ageDays],
    );
    return orderId;
  }
  const exists = async (orderId: string) =>
    (
      await query('SELECT 1 FROM inventory.reservations WHERE order_id = $1', [
        orderId,
      ])
    ).length === 1;

  it('borra una reserva CONFIRMED más vieja que el plazo', async () => {
    const id = await reservation(91, 'CONFIRMED');

    expect(await job().run()).toBe(1);

    expect(await exists(id)).toBe(false);
  });

  it('nunca borra una HELD, por vieja que sea: sigue reteniendo stock', async () => {
    const id = await reservation(1000, 'HELD');

    expect(await job().run()).toBe(0);

    expect(await exists(id)).toBe(true);
  });

  it('no borra una CONFIRMED dentro del plazo', async () => {
    const recent = await reservation(1, 'CONFIRMED');
    const edge = await reservation(89, 'CONFIRMED');

    expect(await job().run()).toBe(0);

    expect(await exists(recent)).toBe(true);
    expect(await exists(edge)).toBe(true);
  });

  it('el plazo sale de RETENTION_RESERVATION_DAYS', async () => {
    const id = await reservation(20, 'CONFIRMED');

    expect(await job(90).run()).toBe(0);
    expect(await job(10).run()).toBe(1);

    expect(await exists(id)).toBe(false);
  });

  it('no cambia las cantidades de stock', async () => {
    const isbn = uniqueIsbn();
    await query(
      `INSERT INTO inventory.stock_items (isbn, available, reserved) VALUES ($1, 7, 3)`,
      [isbn],
    );
    await query(
      `INSERT INTO inventory.reservations (order_id, isbn, quantity, status, created_at)
       VALUES ($1, $2, 3, 'CONFIRMED', now() - interval '200 days')`,
      [randomUUID(), isbn],
    );

    expect(await job().run()).toBe(1);

    const [stock] = await query<{ available: number; reserved: number }>(
      'SELECT available, reserved FROM inventory.stock_items WHERE isbn = $1',
      [isbn],
    );
    expect(stock).toEqual({ available: 7, reserved: 3 });
  });

  it('de un pedido con dos libros borra solo la línea que cumple, no todas las del pedido (la clave es pedido + ISBN)', async () => {
    const orderId = randomUUID();
    const [done, held] = [uniqueIsbn(), uniqueIsbn()];
    await query(
      `INSERT INTO inventory.reservations (order_id, isbn, quantity, status, created_at) VALUES
         ($1, $2, 1, 'CONFIRMED', now() - interval '200 days'),
         ($1, $3, 1, 'HELD', now() - interval '200 days')`,
      [orderId, done, held],
    );

    expect(await job().run()).toBe(1);

    const left = await query<{ isbn: string }>(
      'SELECT isbn FROM inventory.reservations WHERE order_id = $1',
      [orderId],
    );
    expect(left.map((r) => r.isbn)).toEqual([held]);
  });

  it('pasa de largo por una reserva que otra transacción tiene bloqueada, en vez de esperarla (SKIP LOCKED)', async () => {
    const free = await reservation(120, 'CONFIRMED');
    const busy = await reservation(120, 'CONFIRMED');
    const release = await holdRowLock(
      'SELECT 1 FROM inventory.reservations WHERE order_id = $1 FOR UPDATE',
      [busy],
    );
    try {
      expect(await job().run()).toBe(1);
      expect(await exists(free)).toBe(false);
      expect(await exists(busy)).toBe(true);
    } finally {
      await release();
    }
    expect(await job().run()).toBe(1);
  });

  it('vacía más de un lote en una sola vuelta', async () => {
    const total = PURGE_BATCH * 2 + 400;
    await query(
      `INSERT INTO inventory.reservations (order_id, isbn, quantity, status, created_at)
       SELECT gen_random_uuid(), lpad(g::text, 13, '0'), 1, 'CONFIRMED', now() - interval '120 days'
       FROM generate_series(1, $1) g`,
      [total],
    );

    expect(await job().run()).toBe(total);
  });

  it('dos instancias a la vez no se pisan', async () => {
    const total = PURGE_BATCH + 600;
    await query(
      `INSERT INTO inventory.reservations (order_id, isbn, quantity, status, created_at)
       SELECT gen_random_uuid(), lpad(g::text, 13, '0'), 1, 'CONFIRMED', now() - interval '120 days'
       FROM generate_series(1, $1) g`,
      [total],
    );

    const [a, b] = await Promise.all([job().run(), job().run()]);

    expect(a + b).toBe(total);
  });
});
