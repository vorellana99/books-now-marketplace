import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PlaceOrderCommand } from '../../../src/contexts/sales/application/use-cases/order/place-order.command.js';
import { OrderPricer } from '../../../src/contexts/sales/application/services/order-pricer.js';
import { PlaceOrderHandler } from '../../../src/contexts/sales/application/use-cases/order/place-order.handler.js';
import { hashRequest } from '../../../src/contexts/sales/domain/model/order/request-hash.js';
import type { CatalogPricing } from '../../../src/contexts/sales/domain/ports/catalog-pricing.port.js';
import type { CustomerRepository } from '../../../src/contexts/sales/domain/ports/customer.repository.js';
import type { ShippingAddressData } from '../../../src/contexts/sales/domain/model/order/shipping-address.vo.js';
import { PricingService } from '../../../src/contexts/sales/domain/model/pricing/pricing.service.js';
import type { OrderPlacedEvent } from '../../../src/contracts/sales/order-placed.event.js';
import { OutOfStockError } from '../../../src/contracts/inventory/stock.errors.js';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../../src/shared-kernel/domain.errors.js';
import {
  FakePaymentGateway,
  FakeStockReservation,
  FixedCatalog,
  ISBN,
  InMemoryCustomerRepository,
  InMemoryOrderRepository,
  customersWithNormal,
  customersWithPremium,
  fixedCatalog,
} from '../../fakes/index.js';
import { ADDRESS, ADDRESS_DATA } from '../../fakes/fixtures.js';

interface Setup {
  customers?: CustomerRepository;
  catalog?: CatalogPricing;
  stock?: FakeStockReservation;
  payments?: FakePaymentGateway;
  orders?: InMemoryOrderRepository;
}

// El mismo ensamblado que hará SalesModule, pero con los fakes en memoria
function setup(options: Setup = {}) {
  const orders = options.orders ?? new InMemoryOrderRepository();
  const stock = options.stock ?? new FakeStockReservation();
  const payments = options.payments ?? new FakePaymentGateway();
  const pricer = new OrderPricer(
    options.customers ?? customersWithPremium(),
    options.catalog ?? fixedCatalog(),
    new PricingService(),
  );
  const handler = new PlaceOrderHandler(
    orders,
    pricer,
    stock,
    orders.checkoutLog,
    payments,
  );
  return { handler, orders, stock, payments, checkouts: orders.checkoutLog };
}

const cart = (quantity = 1) => [{ isbn: ISBN, quantity }];
const command = (
  items = cart(),
  overrides: {
    key?: string;
    customerId?: string;
    cardToken?: string;
    address?: ShippingAddressData;
  } = {},
) =>
  new PlaceOrderCommand(
    overrides.key ?? randomUUID(),
    overrides.customerId ?? 'c-1',
    items,
    overrides.address ?? ADDRESS_DATA,
    overrides.cardToken ?? 'tok_ok',
  );

const codeOf = async (promise: Promise<unknown>) =>
  ((await promise.catch((e: DomainError) => e)) as DomainError).code;

describe('PlaceOrderHandler (la saga, con fakes en memoria)', () => {
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('camino feliz y totales', () => {
    it('cliente premium: 90.00, con la reserva, el cobro, el pedido y el evento', async () => {
      const { handler, orders, stock, payments, checkouts } = setup();

      const result = await handler.execute(
        command(cart(), { cardToken: 'tok_secreto' }),
      );

      expect(result.charged.toJSON()).toEqual({
        amount: '90.00',
        currency: 'PEN',
      });
      expect(stock.reserved).toEqual([
        { orderId: result.orderId, lines: [{ isbn: ISBN, quantity: 1 }] },
      ]);
      expect(payments.charged).toHaveLength(1);
      expect(payments.charged[0]).toMatchObject({
        cardToken: 'tok_secreto',
        orderId: result.orderId,
      });
      expect(payments.charged[0].amount.equals(result.charged)).toBe(true); // se cobra exactamente lo que se responde
      expect(orders.count()).toBe(1);
      expect(checkouts.statusOf(result.orderId)).toBe('COMPLETED');
      expect(orders.eventsOf(result.orderId)).toHaveLength(1);
      expect(orders.eventsOf(result.orderId)[0]).toMatchObject({
        eventName: 'sales.order.placed',
        subtotal: '100.00',
        customerId: 'c-1',
      });
    });

    it('cliente normal: 110.00 (suma el envío)', async () => {
      const { handler } = setup({ customers: customersWithNormal() });
      expect((await handler.execute(command())).charged.toFixed()).toBe(
        '110.00',
      );
    });

    it('cliente normal con subtotal de 160.00: envío gratis', async () => {
      const catalog = new FixedCatalog({
        [ISBN]: { title: 'Libro', price: '160.00' },
      });
      const { handler } = setup({ customers: customersWithNormal(), catalog });
      expect((await handler.execute(command())).charged.toFixed()).toBe(
        '160.00',
      );
    });

    it('un pedido en dólares se cobra en dólares con las reglas de USD', async () => {
      const catalog = new FixedCatalog({
        [ISBN]: { title: 'Libro', price: '20.00', currency: 'USD' },
      });
      const { handler, payments } = setup({
        customers: customersWithNormal(),
        catalog,
      });

      const result = await handler.execute(command());

      expect(result.charged.toJSON()).toEqual({
        amount: '23.00',
        currency: 'USD',
      }); // + envío de 3.00 USD
      expect(payments.charged[0].amount.currency).toBe('USD');
    });

    it('redondea una sola vez, al final, antes de cobrar', async () => {
      const catalog = new FixedCatalog({
        [ISBN]: { title: 'Libro', price: '33.335' },
      });
      const { handler, payments } = setup({ catalog });

      const result = await handler.execute(command(cart(3))); // 100.005 × 0.90 = 90.0045

      // toFixed() redondea por su cuenta y lo esconde: se mira el valor exacto que se cobra
      expect(result.charged.amount.toString()).toBe('90');
      expect(payments.charged[0].amount.amount.toString()).toBe('90');
    });

    it('las líneas repetidas del mismo libro se suman en una sola reserva', async () => {
      const { handler, stock } = setup();
      const result = await handler.execute(
        command([
          { isbn: ISBN, quantity: 2 },
          { isbn: ISBN, quantity: 3 },
        ]),
      );

      expect(stock.reserved[0].lines).toEqual([{ isbn: ISBN, quantity: 5 }]);
      expect(result.charged.toFixed()).toBe('450.00'); // 5 × 100.00 − 10 %
    });

    it('acepta el ISBN con guiones y reserva el normalizado', async () => {
      const { handler, stock } = setup();
      await handler.execute(
        command([{ isbn: '978-0-306-40615-7', quantity: 1 }]),
      );
      expect(stock.reserved[0].lines).toEqual([{ isbn: ISBN, quantity: 1 }]);
    });

    it('el número de tarjeta solo llega a la pasarela: no queda en el pedido ni en el evento', async () => {
      const { handler, orders } = setup();
      const result = await handler.execute(
        command(cart(), { cardToken: 'tok_muy_secreto' }),
      );

      expect(JSON.stringify(orders.eventsOf(result.orderId))).not.toContain(
        'tok_muy_secreto',
      );
      expect(
        JSON.stringify(await orders.findById(result.orderId)),
      ).not.toContain('tok_muy_secreto');
    });
  });

  describe('lo que falla antes de empezar: no deja rastro', () => {
    const nothingHappened = async (
      s: ReturnType<typeof setup>,
      key: string,
    ) => {
      expect(await s.checkouts.findByKey(key)).toBeNull();
      expect(s.stock.reserved).toEqual([]);
      expect(s.payments.attempts).toEqual([]);
      expect(s.orders.count()).toBe(0);
    };

    it('un cliente que no existe da NotFoundError', async () => {
      const s = setup({ customers: new InMemoryCustomerRepository([]) });
      const key = randomUUID();

      await expect(s.handler.execute(command(cart(), { key }))).rejects.toThrow(
        NotFoundError,
      );
      await nothingHappened(s, key);
    });

    it('un libro que no existe en el catálogo da NotFoundError', async () => {
      const s = setup({ catalog: new FixedCatalog({}) });
      const key = randomUUID();

      await expect(s.handler.execute(command(cart(), { key }))).rejects.toThrow(
        NotFoundError,
      );
      await nothingHappened(s, key);
    });

    it('un ISBN mal formado da INVALID_ISBN', async () => {
      const s = setup();
      const key = randomUUID();

      expect(
        await codeOf(
          s.handler.execute(command([{ isbn: '123', quantity: 1 }], { key })),
        ),
      ).toBe('INVALID_ISBN');
      await nothingHappened(s, key);
    });

    it('más de 10 unidades de un libro da MAX_QUANTITY_EXCEEDED', async () => {
      const s = setup();
      const key = randomUUID();

      expect(await codeOf(s.handler.execute(command(cart(11), { key })))).toBe(
        'MAX_QUANTITY_EXCEEDED',
      );
      await nothingHappened(s, key);
    });

    it('un carrito vacío da EMPTY_ORDER', async () => {
      const s = setup();
      const key = randomUUID();

      expect(await codeOf(s.handler.execute(command([], { key })))).toBe(
        'EMPTY_ORDER',
      );
      await nothingHappened(s, key);
    });
  });

  describe('compensaciones', () => {
    it('sin stock: no se cobra ni se reembolsa nada y no hay pedido', async () => {
      const s = setup({
        stock: new FakeStockReservation({ outOfStock: [ISBN] }),
      });
      const refund = vi.spyOn(s.payments, 'refund');

      await expect(s.handler.execute(command())).rejects.toBeInstanceOf(
        OutOfStockError,
      );

      expect(s.payments.attempts).toEqual([]); // ni siquiera se intentó cobrar
      expect(refund).not.toHaveBeenCalled(); // y no hay nada que reembolsar
      expect(s.payments.refunded).toEqual([]);
      expect(s.orders.count()).toBe(0);
    });

    it('sin stock: el checkout queda ABORTED', async () => {
      const s = setup({
        stock: new FakeStockReservation({ outOfStock: [ISBN] }),
      });
      const key = randomUUID();

      await s.handler.execute(command(cart(), { key })).catch(() => undefined);

      const checkout = await s.checkouts.findByKey(key);
      expect(checkout?.status).toBe('ABORTED');
    });

    it('pago rechazado: libera el stock, no guarda el pedido y no reembolsa lo que nunca se cobró', async () => {
      const s = setup({
        payments: new FakePaymentGateway({
          approved: false,
          reason: 'fondos insuficientes',
        }),
      });
      const key = randomUUID();

      await expect(
        s.handler.execute(command(cart(), { key })),
      ).rejects.toMatchObject({
        code: 'PAYMENT_DECLINED',
        message: expect.stringContaining('fondos insuficientes'),
      });

      expect(s.stock.released).toHaveLength(1);
      expect(s.stock.reserved).toEqual([]);
      expect(s.orders.count()).toBe(0);
      expect(s.payments.refunded).toEqual([]);
      expect((await s.checkouts.findByKey(key))?.status).toBe('ABORTED');
    });

    it('falla al guardar: reembolsa, libera el stock y deja el checkout ABORTED, con el error original', async () => {
      const s = setup({
        orders: new InMemoryOrderRepository({ failOnSave: true }),
      });
      const key = randomUUID();

      await expect(s.handler.execute(command(cart(), { key }))).rejects.toThrow(
        'Falla al guardar el pedido',
      );

      expect(s.payments.refunded).toHaveLength(1);
      expect(s.stock.released).toHaveLength(1);
      expect(s.orders.count()).toBe(0);
      expect((await s.checkouts.findByKey(key))?.status).toBe('ABORTED');
    });

    it('timeout del cobro (no se sabe si cobró): reembolsa de todos modos y libera', async () => {
      const s = setup({ payments: new FakePaymentGateway({ timeout: true }) });
      const key = randomUUID();

      await expect(s.handler.execute(command(cart(), { key }))).rejects.toThrow(
        /tiempo de espera/i,
      );

      expect(s.payments.refunded).toHaveLength(1); // el reembolso por referencia es idempotente
      expect(s.stock.released).toHaveLength(1);
      expect((await s.checkouts.findByKey(key))?.status).toBe('ABORTED');
    });

    it('commit ambiguo (guardó y la respuesta se perdió): no compensa y responde como una compra completa', async () => {
      const s = setup({
        orders: new InMemoryOrderRepository({ failAfterCommit: true }),
      });

      const result = await s.handler.execute(command());

      expect(result.charged.toFixed()).toBe('90.00');
      expect(s.payments.refunded).toEqual([]);
      expect(s.stock.released).toEqual([]);
      expect(s.orders.count()).toBe(1);
      expect(s.checkouts.statusOf(result.orderId)).toBe('COMPLETED');
    });

    it('si falla el reembolso: el checkout sigue PENDING, el cliente recibe el error original y se registra', async () => {
      const s = setup({
        orders: new InMemoryOrderRepository({ failOnSave: true }),
        payments: new FakePaymentGateway({ refundFails: true }),
      });
      const key = randomUUID();

      await expect(s.handler.execute(command(cart(), { key }))).rejects.toThrow(
        'Falla al guardar el pedido',
      );

      expect((await s.checkouts.findByKey(key))?.status).toBe('PENDING'); // lo recupera el job
      expect(s.stock.released).toEqual([]); // no se libera antes de reembolsar
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Compensación incompleta'),
      );
    });

    it('si falla la liberación del stock: el checkout sigue PENDING y el error es el original', async () => {
      const s = setup({
        orders: new InMemoryOrderRepository({ failOnSave: true }),
        stock: new FakeStockReservation({ releaseFails: true }),
      });
      const key = randomUUID();

      await expect(s.handler.execute(command(cart(), { key }))).rejects.toThrow(
        'Falla al guardar el pedido',
      );

      expect((await s.checkouts.findByKey(key))?.status).toBe('PENDING');
      expect(s.payments.refunded).toHaveLength(1); // el reembolso sí se hizo
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Compensación incompleta'),
      );
    });

    it('un error inesperado al reservar (no es falta de stock): no se cobra y se compensa', async () => {
      const stock = new FakeStockReservation();
      vi.spyOn(stock, 'reserve').mockRejectedValue(
        new Error('la base no responde'),
      );
      const s = setup({ stock });
      const key = randomUUID();

      await expect(s.handler.execute(command(cart(), { key }))).rejects.toThrow(
        'la base no responde',
      );

      expect(s.payments.attempts).toEqual([]);
      expect(s.payments.refunded).toEqual([]);
      expect((await s.checkouts.findByKey(key))?.status).toBe('ABORTED');
    });

    it('compensa en orden: primero reembolsa, luego libera y al final marca ABORTED', async () => {
      const s = setup({
        orders: new InMemoryOrderRepository({ failOnSave: true }),
      });
      const refund = vi.spyOn(s.payments, 'refund');
      const release = vi.spyOn(s.stock, 'release');
      const abort = vi.spyOn(s.checkouts, 'abort');

      await s.handler.execute(command()).catch(() => undefined);

      expect(refund.mock.invocationCallOrder[0]).toBeLessThan(
        release.mock.invocationCallOrder[0],
      );
      expect(release.mock.invocationCallOrder[0]).toBeLessThan(
        abort.mock.invocationCallOrder[0],
      );
    });

    it('si falla la comprobación del checkout (cayó la base), el error sube sin compensar', async () => {
      const s = setup({
        orders: new InMemoryOrderRepository({ failOnSave: true }),
      });
      vi.spyOn(s.checkouts, 'isCompleted').mockRejectedValue(
        new Error('la base se cayó'),
      );
      const refund = vi.spyOn(s.payments, 'refund');
      const release = vi.spyOn(s.stock, 'release');

      await expect(s.handler.execute(command())).rejects.toThrow(
        'la base se cayó',
      );

      expect(refund).not.toHaveBeenCalled(); // el job lo recupera después
      expect(release).not.toHaveBeenCalled();
    });
  });

  describe('idempotencia: la misma clave de idempotencia', () => {
    it('al reintentar una compra completa devuelve el mismo pedido y no cobra otra vez', async () => {
      const s = setup();
      const key = randomUUID();

      const first = await s.handler.execute(command(cart(), { key }));
      const second = await s.handler.execute(command(cart(), { key }));

      expect(second.orderId).toBe(first.orderId);
      expect(second.charged.toJSON()).toEqual(first.charged.toJSON());
      expect(s.payments.charged).toHaveLength(1);
      expect(s.stock.reserved).toHaveLength(1);
      expect(s.orders.count()).toBe(1);
      expect(s.orders.eventsOf(first.orderId)).toHaveLength(1);
    });

    it('con otro carrito da IDEMPOTENCY_KEY_REUSED y no cobra', async () => {
      const s = setup();
      const key = randomUUID();
      await s.handler.execute(command(cart(1), { key }));

      expect(await codeOf(s.handler.execute(command(cart(2), { key })))).toBe(
        'IDEMPOTENCY_KEY_REUSED',
      );
      expect(s.payments.charged).toHaveLength(1);
    });

    it('con otro cliente también da IDEMPOTENCY_KEY_REUSED (se comprueba antes de buscar al cliente)', async () => {
      const s = setup();
      const key = randomUUID();
      await s.handler.execute(command(cart(), { key }));

      expect(
        await codeOf(
          s.handler.execute(command(cart(), { key, customerId: 'c-2' })),
        ),
      ).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(s.payments.charged).toHaveLength(1);
    });

    it('el mismo carrito escrito de otra forma sigue siendo el mismo: líneas repetidas, otro orden, guiones', async () => {
      const s = setup();
      const key = randomUUID();
      const first = await s.handler.execute(
        command([{ isbn: ISBN, quantity: 3 }], { key }),
      );

      const split = await s.handler.execute(
        command(
          [
            { isbn: ISBN, quantity: 1 },
            { isbn: ISBN, quantity: 2 },
          ],
          { key },
        ),
      );
      const hyphens = await s.handler.execute(
        command([{ isbn: '978-0-306-40615-7', quantity: 3 }], { key }),
      );

      expect(split.orderId).toBe(first.orderId);
      expect(hyphens.orderId).toBe(first.orderId);
      expect(s.payments.charged).toHaveLength(1);
    });

    it('si la primera todavía está en curso (PENDING) da CHECKOUT_IN_PROGRESS', async () => {
      const s = setup();
      const key = randomUUID();
      await s.checkouts.start(
        randomUUID(),
        key,
        hashRequest('c-1', cart(), ADDRESS),
      );

      const error = await s.handler
        .execute(command(cart(), { key }))
        .catch((e: Error) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe('CHECKOUT_IN_PROGRESS');
    });

    it('si la primera falló (ABORTED) da PREVIOUS_ATTEMPT_FAILED y pide una clave nueva', async () => {
      const s = setup({
        payments: new FakePaymentGateway({
          approved: false,
          reason: 'sin fondos',
        }),
      });
      const key = randomUUID();
      await s.handler.execute(command(cart(), { key })).catch(() => undefined);

      expect(await codeOf(s.handler.execute(command(cart(), { key })))).toBe(
        'PREVIOUS_ATTEMPT_FAILED',
      );
      expect(s.payments.attempts).toHaveLength(1); // no se volvió a intentar cobrar
    });

    it('una clave nueva tras un fallo sí puede comprar', async () => {
      const stock = new FakeStockReservation({ outOfStock: [ISBN] });
      const s = setup({ stock });
      await s.handler.execute(command()).catch(() => undefined);

      const retry = setup({ orders: s.orders, payments: s.payments });
      const result = await retry.handler.execute(command());

      expect(result.charged.toFixed()).toBe('90.00');
    });

    it('si otra petición con la misma clave entra justo antes (la clave ya existe), responde según cómo vaya', async () => {
      const s = setup();
      const key = randomUUID();
      const hash = hashRequest('c-1', cart(), ADDRESS);
      await s.checkouts.start(randomUUID(), key, hash); // la otra petición ya empezó
      // pero esta no la vio al principio
      vi.spyOn(s.checkouts, 'findByKey').mockResolvedValueOnce(null);

      const error = await s.handler
        .execute(command(cart(), { key }))
        .catch((e: Error) => e);

      expect((error as ConflictError).code).toBe('CHECKOUT_IN_PROGRESS');
      expect(s.stock.reserved).toEqual([]); // y no reservó nada
      expect(s.payments.attempts).toEqual([]);
    });
  });

  describe('la carrera de dos peticiones con la misma clave (9.15)', () => {
    it('si la clave ya existe pero la otra petición todavía no se ve, es CHECKOUT_IN_PROGRESS y no cobra ni reserva', async () => {
      const s = setup();
      const key = randomUUID();
      await s.checkouts.start(
        randomUUID(),
        key,
        hashRequest('c-1', cart(), ADDRESS),
      ); // la otra petición ya empezó
      // y esta no la ve ni al principio ni al registrar su intento
      vi.spyOn(s.checkouts, 'findByKey').mockResolvedValue(null);

      const error = await s.handler
        .execute(command(cart(), { key }))
        .catch((e: Error) => e);

      expect((error as ConflictError).code).toBe('CHECKOUT_IN_PROGRESS');
      expect(s.stock.reserved).toEqual([]);
      expect(s.payments.attempts).toEqual([]);
    });
  });

  describe('la dirección de envío', () => {
    const otherAddress = { ...ADDRESS_DATA, line1: 'Otra calle 456' };

    it('el pedido guardado lleva la dirección, normalizada', async () => {
      const { handler, orders } = setup();

      const { orderId } = await handler.execute(
        command(cart(), {
          address: {
            ...ADDRESS_DATA,
            recipient: '  Ana Pérez  ',
            reference: '',
          },
        }),
      );

      const saved = (await orders.findById(orderId))!;
      expect(saved.shippingAddress?.toJSON()).toEqual({
        ...ADDRESS_DATA,
        recipient: 'Ana Pérez',
        reference: null,
      });
    });

    it('el evento del pedido lleva la dirección', async () => {
      const { handler, orders } = setup();
      const { orderId } = await handler.execute(command());
      const [event] = orders.eventsOf(orderId) as OrderPlacedEvent[];
      expect(event.eventVersion).toBe(2);
      expect(event.shippingAddress).toEqual(ADDRESS_DATA);
    });

    it.each([
      ['un teléfono inválido', { ...ADDRESS_DATA, phone: 'abc' }],
      ['un destinatario vacío', { ...ADDRESS_DATA, recipient: '   ' }],
      [
        'un salto de línea en la calle',
        { ...ADDRESS_DATA, line1: 'Av.\nLarco' },
      ],
      [
        'un distrito demasiado largo',
        { ...ADDRESS_DATA, district: 'x'.repeat(61) },
      ],
    ])(
      'con %s da INVALID_SHIPPING_ADDRESS y no hace ningún efecto',
      async (_caso, address) => {
        const s = setup();

        const code = await codeOf(
          s.handler.execute(command(cart(), { address })),
        );

        expect(code).toBe('INVALID_SHIPPING_ADDRESS');
        expect(await s.checkouts.findByKey('cualquiera')).toBeNull();
        expect(s.stock.reserved).toEqual([]);
        expect(s.payments.attempts).toEqual([]);
        expect(s.orders.count()).toBe(0);
      },
    );

    it('una dirección inválida no llega a pedir precios a Catálogo', async () => {
      const priceCart = vi.fn();
      const catalog = { priceCart } as unknown as CatalogPricing;
      const s = setup({ catalog });
      await codeOf(
        s.handler.execute(
          command(cart(), { address: { ...ADDRESS_DATA, phone: 'x' } }),
        ),
      );
      expect(priceCart).not.toHaveBeenCalled();
    });

    it('la misma clave con otra dirección da IDEMPOTENCY_KEY_REUSED y no cobra de nuevo', async () => {
      const s = setup();
      const key = randomUUID();
      await s.handler.execute(command(cart(), { key }));

      const code = await codeOf(
        s.handler.execute(command(cart(), { key, address: otherAddress })),
      );

      expect(code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(s.payments.charged).toHaveLength(1);
      expect(s.orders.count()).toBe(1);
    });

    it('la misma clave con la misma dirección (con espacios de más) repite el resultado sin cobrar otra vez', async () => {
      const s = setup();
      const key = randomUUID();
      const first = await s.handler.execute(command(cart(), { key }));

      const second = await s.handler.execute(
        command(cart(), {
          key,
          address: {
            ...ADDRESS_DATA,
            recipient: `  ${ADDRESS_DATA.recipient} `,
            line1: ` ${ADDRESS_DATA.line1}`,
          },
        }),
      );

      expect(second.orderId).toBe(first.orderId);
      expect(s.payments.charged).toHaveLength(1);
    });

    it('una referencia vacía y una referencia ausente son la misma dirección para la clave', async () => {
      const s = setup();
      const key = randomUUID();
      const { reference: _omit, ...withoutReference } = ADDRESS_DATA;
      const first = await s.handler.execute(
        command(cart(), { key, address: { ...ADDRESS_DATA, reference: '' } }),
      );

      const second = await s.handler.execute(
        command(cart(), { key, address: withoutReference }),
      );

      expect(second.orderId).toBe(first.orderId);
    });

    it('con la compra en curso (PENDING), otra dirección también es IDEMPOTENCY_KEY_REUSED y no CHECKOUT_IN_PROGRESS', async () => {
      const s = setup();
      const key = randomUUID();
      await s.checkouts.start(
        randomUUID(),
        key,
        hashRequest('c-1', cart(), ADDRESS),
      );

      const code = await codeOf(
        s.handler.execute(command(cart(), { key, address: otherAddress })),
      );

      expect(code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });
});
