import { PlaceOrderCommand } from '../../src/contexts/sales/application/order/place-order.command.js';
import { PlaceOrderHandler } from '../../src/contexts/sales/application/order/place-order.handler.js';
import { QuoteOrderHandler } from '../../src/contexts/sales/application/order/quote-order.handler.js';
import { QuoteOrderQuery } from '../../src/contexts/sales/application/order/quote-order.query.js';
import { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import type { Currency } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { PricingService } from '../../src/contexts/sales/domain/pricing/pricing.service.js';
import {
  DomainError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';
import {
  FakePaymentGateway,
  FakeStockReservation,
  FixedCatalog,
  InMemoryCustomerRepository,
  InMemoryOrderRepository,
} from '../fakes/index.js';
import { ADDRESS_DATA } from '../fakes/fixtures.js';

const A = '9780306406157';
const B = '9780132350884';
const C = '9780134494166';
const NORMAL = 'c-normal';
const PREMIUM = 'c-premium';

const customers = () =>
  new InMemoryCustomerRepository([
    Customer.create(NORMAL, 'ana@example.com'),
    Customer.create(PREMIUM, 'luis@example.com', true),
  ]);

function setup(
  books: Record<string, { title: string; price: string; currency?: Currency }>,
) {
  const catalog = new FixedCatalog(books);
  const repo = customers();
  const quote = new QuoteOrderHandler(repo, catalog, new PricingService());
  // La compra real, con los mismos ports, para comparar lo cotizado con lo cobrado
  const orders = new InMemoryOrderRepository();
  const place = new PlaceOrderHandler(
    orders,
    repo,
    catalog,
    new FakeStockReservation(),
    orders.checkoutLog,
    new PricingService(),
    new FakePaymentGateway(),
  );
  const ask = (
    customerId: string,
    items: { isbn: string; quantity: number }[],
  ) => quote.execute(new QuoteOrderQuery(customerId, items));
  const buy = (
    customerId: string,
    items: { isbn: string; quantity: number }[],
  ) =>
    place.execute(
      new PlaceOrderCommand(
        crypto.randomUUID(),
        customerId,
        items,
        ADDRESS_DATA,
        'tok_ok',
      ),
    );
  return { ask, buy };
}

describe('QuoteOrderHandler', () => {
  describe('los ocho ejemplos del producto: el total cotizado es el cobrado', () => {
    it.each([
      [
        'PEN normal 100',
        NORMAL,
        '100.00',
        'PEN',
        ['100.00', '0.00', '10.00', '110.00'],
      ],
      [
        'PEN normal 160',
        NORMAL,
        '160.00',
        'PEN',
        ['160.00', '0.00', '0.00', '160.00'],
      ],
      [
        'PEN premium 100',
        PREMIUM,
        '100.00',
        'PEN',
        ['100.00', '10.00', '0.00', '90.00'],
      ],
      [
        'PEN premium 200',
        PREMIUM,
        '200.00',
        'PEN',
        ['200.00', '20.00', '0.00', '180.00'],
      ],
      [
        'USD normal 20',
        NORMAL,
        '20.00',
        'USD',
        ['20.00', '0.00', '3.00', '23.00'],
      ],
      [
        'USD normal 50',
        NORMAL,
        '50.00',
        'USD',
        ['50.00', '0.00', '0.00', '50.00'],
      ],
      [
        'USD premium 20',
        PREMIUM,
        '20.00',
        'USD',
        ['20.00', '2.00', '0.00', '18.00'],
      ],
      [
        'USD premium 100',
        PREMIUM,
        '100.00',
        'USD',
        ['100.00', '10.00', '0.00', '90.00'],
      ],
    ] as const)('%s', async (_name, customerId, price, currency, parts) => {
      const { ask, buy } = setup({ [A]: { title: 'Libro', price, currency } });
      const items = [{ isbn: A, quantity: 1 }];

      const quote = await ask(customerId, items);
      const charged = (await buy(customerId, items)).charged;

      expect([
        quote.subtotal.toFixed(),
        quote.discount.toFixed(),
        quote.shipping.toFixed(),
        quote.total.toFixed(),
      ]).toEqual([...parts]);
      expect(quote.total.toFixed()).toBe(charged.toFixed());
      expect(quote.currency).toBe(currency);
    });
  });

  describe('el desglose', () => {
    it('subtotal − descuento + envío = total, con precios que obligan a redondear', async () => {
      const { ask } = setup({ [A]: { title: 'X', price: '9.99' } });
      const q = await ask(PREMIUM, [{ isbn: A, quantity: 1 }]);
      expect(q.subtotal.toFixed()).toBe('9.99');
      expect(q.discount.toFixed()).toBe('1.00');
      expect(q.total.toFixed()).toBe('8.99');
      // Los montos ya vienen redondeados (no solo al mostrarlos): lo que viaja es lo que se cobra
      expect(q.discount.amount.equals('1')).toBe(true);
      expect(q.total.amount.equals('8.99')).toBe(true);
      expect(
        q.subtotal.amount
          .minus(q.discount.amount)
          .plus(q.shipping.amount)
          .equals(q.total.amount),
      ).toBe(true);
    });

    it('el envío gratis empieza exactamente en 150.00 para un cliente normal', async () => {
      const { ask } = setup({
        [A]: { title: 'X', price: '149.99' },
        [B]: { title: 'Y', price: '150.00' },
      });
      expect(
        (await ask(NORMAL, [{ isbn: A, quantity: 1 }])).shipping.toFixed(),
      ).toBe('10.00');
      expect(
        (await ask(NORMAL, [{ isbn: B, quantity: 1 }])).shipping.toFixed(),
      ).toBe('0.00');
    });

    it('el descuento premium no depende del umbral de envío gratis', async () => {
      const { ask } = setup({ [A]: { title: 'X', price: '140.00' } });
      const q = await ask(PREMIUM, [{ isbn: A, quantity: 1 }]);
      expect(q.discount.toFixed()).toBe('14.00');
      expect(q.total.toFixed()).toBe('126.00');
    });

    it('se serializa con los montos como texto de 2 decimales y su moneda', async () => {
      const { ask } = setup({ [A]: { title: 'X', price: '45.00' } });
      const json = JSON.parse(
        JSON.stringify(await ask(NORMAL, [{ isbn: A, quantity: 2 }])),
      );
      expect(json).toEqual({
        currency: 'PEN',
        lines: [
          {
            isbn: A,
            unitPrice: { amount: '45.00', currency: 'PEN' },
            quantity: 2,
            subtotal: { amount: '90.00', currency: 'PEN' },
          },
        ],
        subtotal: { amount: '90.00', currency: 'PEN' },
        discount: { amount: '0.00', currency: 'PEN' },
        shipping: { amount: '10.00', currency: 'PEN' },
        total: { amount: '100.00', currency: 'PEN' },
      });
    });
  });

  describe('las líneas', () => {
    const books = {
      [A]: { title: 'A', price: '9.99' },
      [B]: { title: 'B', price: '0.10' },
      [C]: { title: 'C', price: '55.00' },
    };

    it('salen ordenadas por ISBN, sin importar el orden del carrito', async () => {
      const { ask } = setup(books);
      const q = await ask(NORMAL, [
        { isbn: C, quantity: 1 },
        { isbn: A, quantity: 1 },
        { isbn: B, quantity: 1 },
      ]);
      expect(q.lines.map((l) => l.isbn)).toEqual([B, A, C].sort());
    });

    it('las líneas repetidas se suman, también con el ISBN con guiones', async () => {
      const { ask } = setup(books);
      const q = await ask(NORMAL, [
        { isbn: A, quantity: 2 },
        { isbn: '978-0-306-40615-7', quantity: 3 },
      ]);
      expect(q.lines).toHaveLength(1);
      expect(q.lines[0].isbn).toBe(A);
      expect(q.lines[0].quantity).toBe(5);
    });

    it('el subtotal de cada línea es el precio unitario por la cantidad, exacto', async () => {
      const { ask } = setup(books);
      const q = await ask(NORMAL, [
        { isbn: A, quantity: 3 },
        { isbn: B, quantity: 7 },
      ]);
      const byIsbn = Object.fromEntries(q.lines.map((l) => [l.isbn, l]));
      expect(byIsbn[A].unitPrice.toFixed()).toBe('9.99');
      expect(byIsbn[A].subtotal.toFixed()).toBe('29.97');
      expect(byIsbn[B].subtotal.toFixed()).toBe('0.70');
    });

    it('la suma de los subtotales de línea es el subtotal del pedido', async () => {
      const { ask } = setup(books);
      const q = await ask(PREMIUM, [
        { isbn: A, quantity: 3 },
        { isbn: B, quantity: 7 },
        { isbn: C, quantity: 2 },
      ]);
      const sum = q.lines.reduce(
        (s, l) => s.plus(l.subtotal.amount),
        q.subtotal.amount.minus(q.subtotal.amount),
      );
      expect(sum.equals(q.subtotal.amount)).toBe(true);
      expect(q.subtotal.toFixed()).toBe('140.67');
    });
  });

  describe('los errores son los de la compra', () => {
    const books = {
      [A]: { title: 'A', price: '10.00' },
      [B]: { title: 'B', price: '5.00', currency: 'USD' as const },
    };
    const failure = (
      customerId: string,
      items: { isbn: string; quantity: number }[],
    ) =>
      setup(books)
        .ask(customerId, items)
        .then(
          () => undefined,
          (e: unknown) => e,
        );

    it('un cliente inexistente: NotFoundError', async () => {
      const error = await failure('nadie', [{ isbn: A, quantity: 1 }]);
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('un libro desconocido o inactivo: NotFoundError', async () => {
      const error = await failure(NORMAL, [{ isbn: C, quantity: 1 }]);
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('monedas mezcladas: CURRENCY_MISMATCH', async () => {
      const error = await failure(NORMAL, [
        { isbn: A, quantity: 1 },
        { isbn: B, quantity: 1 },
      ]);
      expect((error as DomainError).code).toBe('CURRENCY_MISMATCH');
    });

    it('más de 10 unidades del mismo libro: MAX_QUANTITY_EXCEEDED, también sumando líneas', async () => {
      expect(
        ((await failure(NORMAL, [{ isbn: A, quantity: 11 }])) as DomainError)
          .code,
      ).toBe('MAX_QUANTITY_EXCEEDED');
      expect(
        (
          (await failure(NORMAL, [
            { isbn: A, quantity: 6 },
            { isbn: A, quantity: 5 },
          ])) as DomainError
        ).code,
      ).toBe('MAX_QUANTITY_EXCEEDED');
    });

    it('exactamente 10 unidades sí se cotiza', async () => {
      const q = await setup(books).ask(NORMAL, [{ isbn: A, quantity: 10 }]);
      expect(q.subtotal.toFixed()).toBe('100.00');
    });

    it('un ISBN mal formado: INVALID_ISBN', async () => {
      const error = await failure(NORMAL, [{ isbn: '123', quantity: 1 }]);
      expect((error as DomainError).code).toBe('INVALID_ISBN');
    });

    it('un carrito vacío: EMPTY_ORDER', async () => {
      const error = await failure(NORMAL, []);
      expect((error as DomainError).code).toBe('EMPTY_ORDER');
    });

    it.each([0, -1, 1.5])(
      'una cantidad de %s: INVALID_QUANTITY',
      async (quantity) => {
        const error = await failure(NORMAL, [{ isbn: A, quantity }]);
        expect((error as DomainError).code).toBe('INVALID_QUANTITY');
      },
    );
  });

  it('cotizar dos veces da lo mismo (no cambia nada)', async () => {
    const { ask } = setup({ [A]: { title: 'A', price: '33.33' } });
    const items = [{ isbn: A, quantity: 3 }];
    const first = JSON.stringify(await ask(PREMIUM, items));
    const second = JSON.stringify(await ask(PREMIUM, items));
    expect(second).toBe(first);
  });
});
