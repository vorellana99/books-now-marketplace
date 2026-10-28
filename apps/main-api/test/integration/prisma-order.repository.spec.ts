import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { Order } from '../../src/contexts/sales/domain/order/order.aggregate.js';
import { OrderFactory } from '../../src/contexts/sales/domain/order/order.factory.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { PrismaCheckoutLog } from '../../src/contexts/sales/infrastructure/order/prisma-checkout-log.adapter.js';
import { PrismaOrderRepository } from '../../src/contexts/sales/infrastructure/order/prisma-order.repository.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  ConflictError,
  DomainError,
} from '../../src/shared-kernel/domain.errors.js';
import {
  deliveryRows,
  insertCustomer,
  outboxRows,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { OrderPlacedProbe } from '../support/outbox-probes.js';
import { ShippingAddress } from '../../src/contexts/sales/domain/order/shipping-address.vo.js';
import { ADDRESS_DATA, ADDRESS } from '../fakes/fixtures.js';
import { insertOrder } from '../support/builders.js';

const ISBN_A = '9780306406157';
const ISBN_B = '9780306406140';

const item = (overrides: Record<string, unknown> = {}) => ({
  isbn: ISBN_A,
  quantity: 2,
  title: 'Clean Code',
  price: '50.00',
  currency: 'PEN' as const,
  ...overrides,
});

describe('PrismaOrderRepository (PostgreSQL real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: PrismaOrderRepository;
  let checkouts: PrismaCheckoutLog;

  beforeAll(async () => {
    @Module({ providers: [OrderPlacedProbe] })
    class ProbesModule {}
    app = await createTestApp(OutboxModule, ProbesModule);
    prisma = app.get(PrismaService);
    repo = new PrismaOrderRepository(prisma, app.get(OutboxWriter));
    checkouts = new PrismaCheckoutLog(prisma);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  // Un pedido confirmado para un cliente que existe y con su checkout PENDING, como lo deja el handler antes de guardar
  async function readyOrder(
    items = [item()],
    options: { checkout?: boolean } = {},
  ) {
    const customer = await insertCustomer();
    const order = OrderFactory.fromCart(
      repo.nextId(),
      customer.id,
      items,
      ADDRESS,
    );
    order.place();
    const key = randomUUID();
    if (options.checkout !== false)
      await checkouts.start(order.id, key, 'hash');
    return { order, customer, key };
  }

  const checkoutStatus = async (orderId: string) =>
    (
      await query<{ status: string }>(
        'SELECT status::text AS status FROM sales.checkouts WHERE order_id = $1',
        [orderId],
      )
    )[0]?.status;

  describe('save: lo que guarda', () => {
    it('el pedido, con el cliente, el estado y el monto cobrado', async () => {
      const { order, customer } = await readyOrder();

      await repo.save(order, Money.of('90.00'));

      const [row] = await query<{
        customer_id: string;
        status: string;
        charged_amount: string;
        currency: string;
        created_at: Date;
      }>(
        'SELECT customer_id, status::text AS status, charged_amount::text AS charged_amount, currency::text AS currency, created_at FROM sales.orders WHERE id = $1',
        [order.id],
      );
      expect(row).toMatchObject({
        customer_id: customer.id,
        status: 'PLACED',
        charged_amount: '90.00',
        currency: 'PEN',
      });
      expect(Math.abs(row.created_at.getTime() - Date.now())).toBeLessThan(
        10_000,
      );
    });

    it('las líneas, con el título y el precio de ese momento (escala 6) y su moneda', async () => {
      const { order } = await readyOrder([
        item({ price: '33.335', quantity: 3 }),
        item({ isbn: ISBN_B, title: 'Otro', price: '10.00', quantity: 1 }),
      ]);

      await repo.save(order, Money.of('120.00'));

      const lines = await query<{
        isbn: string;
        title: string;
        unit_price: string;
        currency: string;
        quantity: number;
      }>(
        'SELECT isbn, title, unit_price::text AS unit_price, currency::text AS currency, quantity FROM sales.order_lines WHERE order_id = $1 ORDER BY isbn',
        [order.id],
      );
      expect(lines).toEqual(
        [
          {
            isbn: ISBN_B,
            title: 'Otro',
            unit_price: '10.000000',
            currency: 'PEN',
            quantity: 1,
          },
          {
            isbn: ISBN_A,
            title: 'Clean Code',
            unit_price: '33.335000',
            currency: 'PEN',
            quantity: 3,
          },
        ].sort((x, y) => x.isbn.localeCompare(y.isbn)),
      );
    });

    it('completa el checkout con el monto y la moneda, para responder los reintentos', async () => {
      const { order, key } = await readyOrder();

      await repo.save(order, Money.of('90.00'));

      const record = await checkouts.findByKey(key);
      expect(record?.status).toBe('COMPLETED');
      expect(record?.charged?.toJSON()).toEqual({
        amount: '90.00',
        currency: 'PEN',
      });
    });

    it('guarda el evento y su entrega con el requestId de la petición, en la misma operación', async () => {
      const { order } = await readyOrder();

      await RequestContext.run('r-compra', () =>
        repo.save(order, Money.of('90.00')),
      );

      const [event] = await outboxRows();
      expect(event).toMatchObject({
        event_name: 'sales.order.placed',
        aggregate_id: order.id,
        correlation_id: 'r-compra',
      });
      expect(event.payload).toMatchObject({
        orderId: order.id,
        subtotal: '100.00',
        lines: [{ isbn: ISBN_A, quantity: 2 }],
      });
      expect((await deliveryRows(event.id)).map((d) => d.consumer)).toEqual([
        'test.order-placed',
      ]);
    });

    it('consume los eventos del pedido: no se guardarían dos veces', async () => {
      const { order } = await readyOrder();
      await repo.save(order, Money.of('90.00'));
      expect(order.pullEvents()).toEqual([]);
    });

    it('un pedido en dólares se guarda en dólares, en el pedido, en las líneas y en el checkout', async () => {
      const { order, key } = await readyOrder([
        item({ price: '20.00', currency: 'USD', quantity: 1 }),
      ]);

      await repo.save(order, Money.of('23.00', 'USD'));

      const [row] = await query<{ currency: string }>(
        'SELECT currency::text AS currency FROM sales.orders WHERE id = $1',
        [order.id],
      );
      const [line] = await query<{ currency: string }>(
        'SELECT currency::text AS currency FROM sales.order_lines WHERE order_id = $1',
        [order.id],
      );
      expect([row.currency, line.currency]).toEqual(['USD', 'USD']);
      expect((await checkouts.findByKey(key))?.charged?.toJSON()).toEqual({
        amount: '23.00',
        currency: 'USD',
      });
    });

    it('redondea el monto una sola vez al guardarlo (2 decimales, mitad hacia arriba)', async () => {
      const { order } = await readyOrder();
      await repo.save(order, Money.of('90.005'));
      const [row] = await query<{ charged_amount: string }>(
        'SELECT charged_amount::text AS charged_amount FROM sales.orders WHERE id = $1',
        [order.id],
      );
      expect(row.charged_amount).toBe('90.01');
    });
  });

  describe('save: el redondeo', () => {
    // toFixed usa el redondeo global de decimal.js; el monto debe redondearse con toFinal, explícito, aunque alguien
    // cambie esa configuración global
    it('no depende del redondeo global de decimal.js', async () => {
      const { order } = await readyOrder();
      const before = Decimal.rounding;
      Decimal.set({ rounding: Decimal.ROUND_DOWN });
      try {
        await repo.save(order, Money.of('90.005'));
      } finally {
        Decimal.set({ rounding: before });
      }
      const [row] = await query<{ charged_amount: string }>(
        'SELECT charged_amount::text AS charged_amount FROM sales.orders WHERE id = $1',
        [order.id],
      );
      expect(row.charged_amount).toBe('90.01');
    });
  });

  describe('save: todo o nada', () => {
    it('si falla el guardado del evento, no queda el pedido ni las líneas, y el checkout sigue PENDING', async () => {
      const { order } = await readyOrder();
      const broken = new PrismaOrderRepository(prisma, {
        append: async () => {
          throw new Error('falló el outbox');
        },
      } as unknown as OutboxWriter);

      await expect(broken.save(order, Money.of('90.00'))).rejects.toThrow(
        'falló el outbox',
      );

      expect(await query('SELECT 1 FROM sales.orders')).toEqual([]);
      expect(await query('SELECT 1 FROM sales.order_lines')).toEqual([]);
      expect(await checkoutStatus(order.id)).toBe('PENDING');
      expect(await outboxRows()).toEqual([]);
    });

    // El evento se escribe de verdad y DESPUÉS falla: si el outbox usara otra conexión (fuera de la transacción) su
    // fila quedaría guardada aunque el pedido se deshiciera
    it('si el outbox escribe el evento y luego falla, el evento también se deshace', async () => {
      const { order } = await readyOrder();
      const real = app.get(OutboxWriter);
      const failsAfterWriting = new PrismaOrderRepository(prisma, {
        append: async (tx: never, events: never) => {
          await real.append(tx, events);
          throw new Error('falló tras escribir');
        },
      } as unknown as OutboxWriter);

      await expect(
        failsAfterWriting.save(order, Money.of('90.00')),
      ).rejects.toThrow('falló tras escribir');

      expect(await outboxRows()).toEqual([]);
      expect(await query('SELECT 1 FROM messaging.deliveries')).toEqual([]);
      expect(await query('SELECT 1 FROM sales.orders')).toEqual([]);
      expect(await checkoutStatus(order.id)).toBe('PENDING');
    });

    it('si el cliente no existe (clave foránea), nada queda a medias', async () => {
      const order = OrderFactory.fromCart(
        repo.nextId(),
        randomUUID(),
        [item()],
        ADDRESS,
      );
      order.place();
      await checkouts.start(order.id, randomUUID(), 'hash');

      await expect(repo.save(order, Money.of('90.00'))).rejects.toThrow();

      expect(await query('SELECT 1 FROM sales.orders')).toEqual([]);
      expect(await checkoutStatus(order.id)).toBe('PENDING');
      expect(await outboxRows()).toEqual([]);
    });
  });

  describe('save: solo completa un checkout que siga PENDING', () => {
    // Si el job de recuperación ya reembolsó, liberó y anuló el checkout mientras este handler seguía vivo, crear el
    // pedido dejaría un pedido sin cobro y sin stock
    it('con el checkout ya ABORTED lanza un ConflictError y no crea nada', async () => {
      const { order } = await readyOrder();
      await checkouts.abort(order.id);

      const error = await repo
        .save(order, Money.of('90.00'))
        .catch((e: Error) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe('CHECKOUT_NOT_PENDING');
      expect(await query('SELECT 1 FROM sales.orders')).toEqual([]);
      expect(await query('SELECT 1 FROM sales.order_lines')).toEqual([]);
      expect(await outboxRows()).toEqual([]);
      expect(await checkoutStatus(order.id)).toBe('ABORTED'); // sigue anulado
    });

    it('con el checkout ya COMPLETED (un segundo guardado) también falla y conserva el primero', async () => {
      const { order } = await readyOrder();
      await repo.save(order, Money.of('90.00'));

      await expect(repo.save(order, Money.of('90.00'))).rejects.toMatchObject({
        code: 'CHECKOUT_NOT_PENDING',
      });

      const [{ n }] = await query<{ n: string }>(
        'SELECT count(*) AS n FROM sales.orders',
      );
      expect(Number(n)).toBe(1);
    });

    it('sin ningún checkout para ese pedido también falla', async () => {
      const { order } = await readyOrder([item()], { checkout: false });
      await expect(repo.save(order, Money.of('90.00'))).rejects.toMatchObject({
        code: 'CHECKOUT_NOT_PENDING',
      });
      expect(await query('SELECT 1 FROM sales.orders')).toEqual([]);
    });

    it('dos guardados simultáneos del mismo pedido: solo uno se crea', async () => {
      const { order } = await readyOrder();
      const copy = OrderFactory.fromCart(
        order.id,
        order.customerId,
        [item()],
        ADDRESS,
      );
      copy.place();

      const results = await Promise.allSettled([
        repo.save(order, Money.of('90.00')),
        repo.save(copy, Money.of('90.00')),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const [{ n }] = await query<{ n: string }>(
        'SELECT count(*) AS n FROM sales.orders',
      );
      expect(Number(n)).toBe(1);
      expect((await outboxRows()).length).toBe(1);
    });
  });

  describe('save: se niega a guardar lo que no corresponde', () => {
    it('un pedido sin confirmar', async () => {
      const customer = await insertCustomer();
      const draft = OrderFactory.fromCart(
        repo.nextId(),
        customer.id,
        [item()],
        ADDRESS,
      );
      await checkouts.start(draft.id, randomUUID(), 'hash');

      await expect(repo.save(draft, Money.of('90.00'))).rejects.toMatchObject({
        code: 'ORDER_NOT_PLACED',
      });
      expect(await query('SELECT 1 FROM sales.orders')).toEqual([]);
    });

    it('un monto cobrado en otra moneda que el pedido', async () => {
      const { order } = await readyOrder();
      const error = await repo
        .save(order, Money.of('90.00', 'USD'))
        .catch((e: DomainError) => e);
      expect((error as DomainError).code).toBe('CURRENCY_MISMATCH');
      expect(await checkoutStatus(order.id)).toBe('PENDING');
    });
  });

  describe('sin consumidores del evento', () => {
    it('el pedido se guarda igual, y el evento no (nadie lo escucharía)', async () => {
      const bare = await createTestApp(OutboxModule);
      try {
        const bareRepo = new PrismaOrderRepository(
          bare.get(PrismaService),
          bare.get(OutboxWriter),
        );
        const { order } = await readyOrder();

        await bareRepo.save(order, Money.of('90.00'));

        expect(await query('SELECT 1 FROM sales.orders')).toHaveLength(1);
        expect(await outboxRows()).toEqual([]);
      } finally {
        await bare.close();
      }
    });
  });

  describe('findById: la ida y vuelta', () => {
    it('lo que se guarda se lee igual: líneas, precios exactos, moneda y cliente', async () => {
      const { order, customer } = await readyOrder([
        item({ price: '33.335', quantity: 3 }),
        item({ isbn: ISBN_B, title: 'Otro', price: '10.00', quantity: 1 }),
      ]);
      await repo.save(order, Money.of('110.01'));

      const found = await repo.findById(order.id);

      expect(found).toBeInstanceOf(Order);
      expect(found?.id).toBe(order.id);
      expect(found?.customerId).toBe(customer.id);
      expect(found?.status).toBe('PLACED');
      expect(found?.currency).toBe('PEN');
      const lines = (o: Order) =>
        o
          .getLines()
          .map((l) => [
            l.isbn.value,
            l.title,
            l.unitPrice.amount.toString(),
            l.quantity,
          ])
          .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
      expect(lines(found!)).toEqual(lines(order));
      expect(found?.subtotal().amount.toString()).toBe(
        order.subtotal().amount.toString(),
      );
    });

    it('un pedido en dólares vuelve en dólares', async () => {
      const { order } = await readyOrder([
        item({ price: '20.00', currency: 'USD', quantity: 1 }),
      ]);
      await repo.save(order, Money.of('23.00', 'USD'));
      expect((await repo.findById(order.id))?.currency).toBe('USD');
    });

    it('las líneas vuelven en un orden estable (por ISBN), sin importar cómo se guardaron', async () => {
      const { order } = await readyOrder([
        item({ isbn: ISBN_A }),
        item({ isbn: ISBN_B, title: 'Otro' }),
      ]);
      await repo.save(order, Money.of('200.00'));

      const isbns = (await repo.findById(order.id))!
        .getLines()
        .map((l) => l.isbn.value);

      expect(isbns).toEqual([ISBN_A, ISBN_B].sort());
    });

    it('lo que se lee no genera eventos y ya no admite cambios', async () => {
      const { order } = await readyOrder();
      await repo.save(order, Money.of('90.00'));

      const found = (await repo.findById(order.id))!;

      expect(found.pullEvents()).toEqual([]);
      expect(() => found.place()).toThrow(/confirmado/);
    });

    it('un pedido que no existe da null', async () => {
      expect(await repo.findById(randomUUID())).toBeNull();
    });
  });

  describe('la dirección de envío', () => {
    const address = ShippingAddress.create(ADDRESS_DATA);

    async function orderWithAddress(shipping: ShippingAddress) {
      const customer = await insertCustomer();
      const order = OrderFactory.fromCart(
        repo.nextId(),
        customer.id,
        [item()],
        shipping,
      );
      order.place();
      await checkouts.start(order.id, randomUUID(), 'hash');
      return order;
    }
    const shipColumns = async (orderId: string) =>
      (
        await query<Record<string, string | null>>(
          `SELECT ship_recipient, ship_phone, ship_line1, ship_district, ship_province, ship_department, ship_reference
           FROM sales.orders WHERE id = $1`,
          [orderId],
        )
      )[0];

    it('guarda los siete campos en sus columnas', async () => {
      const order = await orderWithAddress(address);

      await repo.save(order, Money.of('90.00'));

      expect(await shipColumns(order.id)).toEqual({
        ship_recipient: ADDRESS_DATA.recipient,
        ship_phone: ADDRESS_DATA.phone,
        ship_line1: ADDRESS_DATA.line1,
        ship_district: ADDRESS_DATA.district,
        ship_province: ADDRESS_DATA.province,
        ship_department: ADDRESS_DATA.department,
        ship_reference: ADDRESS_DATA.reference,
      });
    });

    it('ida y vuelta: lo que se guarda se lee igual', async () => {
      const order = await orderWithAddress(address);
      await repo.save(order, Money.of('90.00'));

      const found = await repo.findById(order.id);

      expect(found?.shippingAddress?.equals(address)).toBe(true);
    });

    it('sin referencia, la columna queda en NULL y vuelve sin referencia', async () => {
      const { reference: _omit, ...rest } = ADDRESS_DATA;
      const order = await orderWithAddress(ShippingAddress.create(rest));
      await repo.save(order, Money.of('90.00'));

      expect((await shipColumns(order.id)).ship_reference).toBeNull();
      expect(
        (await repo.findById(order.id))?.shippingAddress?.reference,
      ).toBeNull();
    });

    it('se niega a guardar un pedido sin dirección (por ejemplo, uno leído de antes de la dirección)', async () => {
      const customer = await insertCustomer();
      const legacy = await insertOrder(customer.id);
      const order = (await repo.findById(legacy.id))!;
      const copy = OrderFactory.fromCart(
        randomUUID(),
        customer.id,
        [item()],
        address,
      );
      copy.place();
      // el mismo contenido, pero sin dirección: solo se puede obtener leyendo un pedido antiguo
      const withoutAddress = Order.restore({
        id: copy.id,
        customerId: customer.id,
        lines: order.getLines(),
        shippingAddress: null,
      });
      await checkouts.start(withoutAddress.id, randomUUID(), 'hash');

      const error = await repo
        .save(withoutAddress, Money.of('90.00'))
        .catch((e: DomainError) => e);

      expect((error as DomainError).code).toBe('SHIPPING_ADDRESS_REQUIRED');
      expect(await checkoutStatus(withoutAddress.id)).toBe('PENDING');
      expect(
        await query('SELECT 1 FROM sales.orders WHERE id = $1', [
          withoutAddress.id,
        ]),
      ).toEqual([]);
      expect(await outboxRows()).toEqual([]);
    });

    it('un pedido anterior a la dirección, insertado sin ella, se lee con dirección null', async () => {
      const customer = await insertCustomer();
      const legacy = await insertOrder(customer.id);

      const found = await repo.findById(legacy.id);

      expect(found?.shippingAddress).toBeNull();
      expect(found?.getLines()).toHaveLength(1);
    });

    it('el evento guardado es la versión 2 y lleva la dirección', async () => {
      const order = await orderWithAddress(address);
      await repo.save(order, Money.of('90.00'));

      const [event] = await outboxRows();

      expect(event.event_version).toBe(2);
      expect(event.payload).toMatchObject({ shippingAddress: ADDRESS_DATA });
    });
  });

  it('nextId entrega UUID distintos', () => {
    const [a, b] = [repo.nextId(), repo.nextId()];
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(a).not.toBe(b);
  });
});
