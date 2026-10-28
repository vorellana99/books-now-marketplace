import { randomUUID } from 'node:crypto';
import { Logger, Module, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { RecoverCheckoutsJob } from '../../src/contexts/sales/application/order/recover-checkouts.job.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { InventoryInProcessAdapter } from '../../src/contexts/sales/infrastructure/order/inventory-in-process.adapter.js';
import { PrismaCheckoutLog } from '../../src/contexts/sales/infrastructure/order/prisma-checkout-log.adapter.js';
import { SimulatedPaymentGateway } from '../../src/contexts/sales/infrastructure/payment/simulated-payment-gateway.adapter.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  insertBook,
  insertStock,
  reservationsOf,
  stockOf,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

describe('RecoverCheckoutsJob (PostgreSQL real, con Inventario real)', () => {
  let app: INestApplication;
  let checkouts: PrismaCheckoutLog;
  let stock: InventoryInProcessAdapter;
  let payments: SimulatedPaymentGateway;
  let job: RecoverCheckoutsJob;

  @Module({ imports: [InventoryModule] })
  class Wiring {}

  beforeAll(async () => {
    app = await createTestApp(Wiring);
    checkouts = new PrismaCheckoutLog(app.get(PrismaService));
    stock = new InventoryInProcessAdapter(app.get(CommandBus));
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    payments = new SimulatedPaymentGateway();
    job = newJob(payments);
    // el reembolso fallido es un caso esperado y deja un error en el log
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  const newJob = (gateway: SimulatedPaymentGateway) =>
    new RecoverCheckoutsJob(
      checkouts,
      gateway,
      stock,
      new ConfigService({ CHECKOUT_RECOVERY_MINUTES: 10 }),
    );

  const statusOf = async (orderId: string) =>
    (
      await query<{ status: string }>(
        'SELECT status::text AS status FROM sales.checkouts WHERE order_id = $1',
        [orderId],
      )
    )[0]?.status;
  const backdate = (orderId: string, minutes: number) =>
    query(
      'UPDATE sales.checkouts SET started_at = started_at - make_interval(mins => $2) WHERE order_id = $1',
      [orderId, minutes],
    );
  const expireLock = (orderId: string) =>
    query(
      "UPDATE sales.checkouts SET locked_until = now() - interval '1 second' WHERE order_id = $1",
      [orderId],
    );

  // Una compra que reservó, cobró y se cayó antes de guardar el pedido, hace `age` minutos
  async function crashedAfterCharge(
    options: { age?: number; requestId?: string; charge?: boolean } = {},
  ) {
    const book = await insertBook();
    await insertStock(book.isbn, 10);
    const orderId = randomUUID();
    await RequestContext.run(options.requestId ?? 'r-original', () =>
      checkouts.start(orderId, randomUUID(), 'h'),
    );
    await stock.reserve(orderId, [{ isbn: book.isbn, quantity: 3 }]);
    if (options.charge !== false) {
      await payments.charge(Money.of('135.00'), 'tok_visa', orderId);
    }
    await backdate(orderId, options.age ?? 11);
    return { orderId, isbn: book.isbn };
  }

  it('caída tras cobrar: reembolsa, devuelve el stock y anula el checkout', async () => {
    const { orderId, isbn } = await crashedAfterCharge();
    expect(await stockOf(isbn)).toEqual({ available: 7, reserved: 3 });

    expect(await job.run()).toBe(1);

    expect(payments.refunds).toEqual([orderId]);
    expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    expect(await reservationsOf(orderId)).toEqual([]);
    expect(await statusOf(orderId)).toBe('ABORTED');
  });

  it('caída antes de cobrar: libera el stock y anula; no hay nada que reembolsar', async () => {
    const { orderId, isbn } = await crashedAfterCharge({ charge: false });

    await job.run();

    expect(payments.refunds).toEqual([]);
    expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    expect(await statusOf(orderId)).toBe('ABORTED');
  });

  it('un checkout COMPLETED no se toca, por viejo que sea', async () => {
    const { orderId, isbn } = await crashedAfterCharge({ age: 600 });
    await query(
      "UPDATE sales.checkouts SET status = 'COMPLETED', charged_amount = 135, currency = 'PEN' WHERE order_id = $1",
      [orderId],
    );

    expect(await job.run()).toBe(0);

    expect(payments.refunds).toEqual([]);
    expect(await stockOf(isbn)).toEqual({ available: 7, reserved: 3 });
    expect(await statusOf(orderId)).toBe('COMPLETED');
  });

  it('un checkout reciente no se toca: la compra puede seguir en curso', async () => {
    const { orderId, isbn } = await crashedAfterCharge({ age: 3 });

    expect(await job.run()).toBe(0);

    expect(await statusOf(orderId)).toBe('PENDING');
    expect(await stockOf(isbn)).toEqual({ available: 7, reserved: 3 });
  });

  it('un reembolso que falla deja todo PENDING y se reintenta en otra vuelta', async () => {
    const { orderId, isbn } = await crashedAfterCharge();
    let down = true;
    const flaky = Object.assign(
      Object.create(payments) as SimulatedPaymentGateway,
      {
        refund: (id: string) =>
          down
            ? Promise.reject(new Error('pasarela caída'))
            : payments.refund(id),
      },
    );
    const flakyJob = newJob(flaky);

    await flakyJob.run();

    expect(await statusOf(orderId)).toBe('PENDING');
    expect(await stockOf(isbn)).toEqual({ available: 7, reserved: 3 }); // no se liberó

    expect(await flakyJob.run()).toBe(0); // aún bloqueado
    down = false;
    await expireLock(orderId);
    expect(await flakyJob.run()).toBe(1);

    expect(payments.refunds).toEqual([orderId]);
    expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    expect(await statusOf(orderId)).toBe('ABORTED');
  });

  it('dos jobs a la vez reparten los checkouts: cada uno se reembolsa una sola vez', async () => {
    const crashed = await Promise.all(
      [1, 2, 3, 4].map(() => crashedAfterCharge()),
    );
    const refundCalls: string[] = [];
    const counting = Object.assign(
      Object.create(payments) as SimulatedPaymentGateway,
      {
        refund: (id: string) => {
          refundCalls.push(id);
          return payments.refund(id);
        },
      },
    );

    const [a, b] = await Promise.all([
      newJob(counting).run(),
      newJob(counting).run(),
    ]);

    expect(a + b).toBe(4);
    expect([...refundCalls].sort()).toEqual(
      crashed.map((c) => c.orderId).sort(),
    );
    for (const { orderId, isbn } of crashed) {
      expect(await statusOf(orderId)).toBe('ABORTED');
      expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    }
  });

  it('con más checkouts que el lote, una vuelta toma los más antiguos y la siguiente el resto', async () => {
    const crashed: string[] = [];
    for (let i = 0; i < 7; i++) {
      crashed.push((await crashedAfterCharge({ age: 11 + i })).orderId);
    }

    expect(await job.run()).toBe(5);
    const pending = await Promise.all(crashed.map(statusOf));
    expect(pending.filter((s) => s === 'ABORTED')).toHaveLength(5);
    // los dos más nuevos esperan a la siguiente vuelta
    expect(pending.slice(0, 2)).toEqual(['PENDING', 'PENDING']);

    expect(await job.run()).toBe(2);
    expect(await Promise.all(crashed.map(statusOf))).toEqual(
      Array(7).fill('ABORTED'),
    );
  });

  it('un checkout de una compra sin requestId también se recupera', async () => {
    const book = await insertBook();
    await insertStock(book.isbn, 5);
    const orderId = randomUUID();
    await checkouts.start(orderId, randomUUID(), 'h'); // fuera de RequestContext
    await stock.reserve(orderId, [{ isbn: book.isbn, quantity: 1 }]);
    await backdate(orderId, 11);

    expect(await job.run()).toBe(1);

    expect(await statusOf(orderId)).toBe('ABORTED');
  });
});
