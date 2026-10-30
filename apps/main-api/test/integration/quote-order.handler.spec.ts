import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { PlaceOrderCommand } from '../../src/contexts/sales/application/use-cases/order/place-order.command.js';
import { QuoteOrderQuery } from '../../src/contexts/sales/application/use-cases/order/quote-order.query.js';
import { PaymentGateway } from '../../src/contexts/sales/domain/ports/payment-gateway.port.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import {
  DomainError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';
import {
  insertBook,
  insertCustomer,
  insertStock,
  stockOf,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

const ADDRESS = {
  recipient: 'María Quispe',
  phone: '+51 987 654 321',
  line1: 'Jr. Ucayali 150, Dpto 2',
  district: 'Barranco',
  province: 'Lima',
  department: 'Lima',
};

const rows = async (table: string) =>
  Number(
    (await query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0].n,
  );

describe('QuoteOrderHandler (PostgreSQL real, por el QueryBus)', () => {
  let app: INestApplication;
  let queryBus: QueryBus;
  let commandBus: CommandBus;

  beforeAll(async () => {
    app = await createTestApp(
      OutboxModule,
      CatalogModule,
      InventoryModule,
      SalesModule,
    );
    queryBus = app.get(QueryBus);
    commandBus = app.get(CommandBus);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const quote = (
    customerId: string,
    items: { isbn: string; quantity: number }[],
  ) => queryBus.execute(new QuoteOrderQuery(customerId, items));
  const buy = (
    customerId: string,
    items: { isbn: string; quantity: number }[],
  ) =>
    commandBus.execute(
      new PlaceOrderCommand(
        randomUUID(),
        customerId,
        items,
        ADDRESS,
        'tok_visa',
      ),
    );

  it('cotiza con los precios del catálogo y el descuento del cliente', async () => {
    const luis = await insertCustomer({ premium: true });
    const ana = await insertCustomer();
    const book = await insertBook({ price: '100.00' });
    await insertStock(book.isbn, 10);

    const premium = await quote(luis.id, [{ isbn: book.isbn, quantity: 1 }]);
    const normal = await quote(ana.id, [{ isbn: book.isbn, quantity: 1 }]);

    expect(JSON.parse(JSON.stringify(premium))).toMatchObject({
      currency: 'PEN',
      subtotal: { amount: '100.00' },
      discount: { amount: '10.00' },
      shipping: { amount: '0.00' },
      total: { amount: '90.00' },
    });
    expect(normal.total.toFixed()).toBe('110.00');
  });

  it('no deja ningún rastro: ni checkout, ni pedido, ni reserva, ni evento, ni cambio de stock', async () => {
    const ana = await insertCustomer();
    const book = await insertBook({ price: '45.00' });
    await insertStock(book.isbn, 10);

    await quote(ana.id, [{ isbn: book.isbn, quantity: 3 }]);

    for (const table of [
      'sales.checkouts',
      'sales.orders',
      'sales.order_lines',
      'inventory.reservations',
      'messaging.outbox',
      'messaging.deliveries',
    ]) {
      expect(await rows(table), table).toBe(0);
    }
    expect(await stockOf(book.isbn)).toEqual({ available: 10, reserved: 0 });
  });

  it('no cobra: la pasarela no se toca', async () => {
    const ana = await insertCustomer();
    const book = await insertBook({ price: '45.00' });
    await insertStock(book.isbn, 10);
    const gateway = app.get(PaymentGateway);
    const charge = vi.spyOn(gateway, 'charge');
    const refund = vi.spyOn(gateway, 'refund');
    try {
      await quote(ana.id, [{ isbn: book.isbn, quantity: 1 }]);
      expect(charge).not.toHaveBeenCalled();
      expect(refund).not.toHaveBeenCalled();
    } finally {
      charge.mockRestore();
      refund.mockRestore();
    }
  });

  it('el total cotizado es el cobrado, con precios que obligan a redondear', async () => {
    const luis = await insertCustomer({ premium: true });
    const ana = await insertCustomer();
    const a = await insertBook({ price: '9.99' });
    const b = await insertBook({ price: '0.15' });
    for (const book of [a, b]) await insertStock(book.isbn, 20);

    for (const [customer, items] of [
      [luis, [{ isbn: a.isbn, quantity: 1 }]],
      [luis, [{ isbn: b.isbn, quantity: 1 }]],
      [ana, [{ isbn: b.isbn, quantity: 3 }]],
      [
        ana,
        [
          { isbn: a.isbn, quantity: 2 },
          { isbn: b.isbn, quantity: 7 },
        ],
      ],
    ] as const) {
      const quoted = await quote(customer.id, [...items]);
      const charged = (await buy(customer.id, [...items])).charged;
      expect(quoted.total.toFixed()).toBe(charged.toFixed());
    }
  });

  it('cotizar no aparta unidades: la última copia sigue disponible para comprarla', async () => {
    const ana = await insertCustomer();
    const book = await insertBook({ price: '45.00' });
    await insertStock(book.isbn, 1);

    await quote(ana.id, [{ isbn: book.isbn, quantity: 1 }]);
    const bought = await buy(ana.id, [{ isbn: book.isbn, quantity: 1 }]);

    expect(bought.orderId).toEqual(expect.any(String));
  });

  it('no avisa de falta de stock: un libro agotado o sin registro de stock se cotiza igual', async () => {
    const ana = await insertCustomer();
    const empty = await insertBook({ price: '45.00' });
    await insertStock(empty.isbn, 0);
    const unregistered = await insertBook({ price: '30.00' });

    const q = await quote(ana.id, [
      { isbn: empty.isbn, quantity: 1 },
      { isbn: unregistered.isbn, quantity: 1 },
    ]);

    expect(q.subtotal.toFixed()).toBe('75.00');
  });

  it('un cambio de precio del catálogo se refleja en la siguiente cotización (no hay caché)', async () => {
    const ana = await insertCustomer();
    const book = await insertBook({ price: '45.00' });
    const first = await quote(ana.id, [{ isbn: book.isbn, quantity: 1 }]);
    await query('UPDATE catalog.books SET price = 50.00 WHERE isbn = $1', [
      book.isbn,
    ]);

    const second = await quote(ana.id, [{ isbn: book.isbn, quantity: 1 }]);

    expect(first.subtotal.toFixed()).toBe('45.00');
    expect(second.subtotal.toFixed()).toBe('50.00');
  });

  it('un libro inactivo, uno inexistente y un cliente inexistente dan NotFoundError', async () => {
    const ana = await insertCustomer();
    const inactive = await insertBook({ active: false });
    const active = await insertBook();
    const failure = (customerId: string, isbn: string) =>
      quote(customerId, [{ isbn, quantity: 1 }]).then(
        () => undefined,
        (e: unknown) => e,
      );

    expect(await failure(ana.id, inactive.isbn)).toBeInstanceOf(NotFoundError);
    expect(await failure(ana.id, '9780306406157')).toBeInstanceOf(
      NotFoundError,
    );
    expect(await failure(randomUUID(), active.isbn)).toBeInstanceOf(
      NotFoundError,
    );
  });

  it('monedas mezcladas: CURRENCY_MISMATCH, sin dejar nada', async () => {
    const ana = await insertCustomer();
    const pen = await insertBook({ currency: 'PEN' });
    const usd = await insertBook({ currency: 'USD' });

    const error = await quote(ana.id, [
      { isbn: pen.isbn, quantity: 1 },
      { isbn: usd.isbn, quantity: 1 },
    ]).catch((e: unknown) => e);

    expect((error as DomainError).code).toBe('CURRENCY_MISMATCH');
    expect(await rows('sales.checkouts')).toBe(0);
  });
});
