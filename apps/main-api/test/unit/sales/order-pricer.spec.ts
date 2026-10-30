import { readFileSync } from 'node:fs';
import { normalizeCart } from '../../../src/contexts/sales/domain/order/normalize-cart.js';
import { OrderPricer } from '../../../src/contexts/sales/application/services/order-pricer.js';
import { Customer } from '../../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { ShippingAddress } from '../../../src/contexts/sales/domain/order/shipping-address.vo.js';
import { PricingService } from '../../../src/contexts/sales/domain/pricing/pricing.service.js';
import {
  DomainError,
  NotFoundError,
} from '../../../src/shared-kernel/domain.errors.js';
import { FixedCatalog, InMemoryCustomerRepository } from '../../fakes/index.js';
import { ADDRESS_DATA } from '../../fakes/fixtures.js';

const A = '9780306406157';
const B = '9780132350884';
const NORMAL = 'c-normal';
const PREMIUM = 'c-premium';
const ORDER_ID = '3f2c1a40-0000-4000-8000-000000000001';

const catalog = () =>
  new FixedCatalog({
    [A]: { title: 'Barato', price: '20.00' },
    [B]: { title: 'Caro', price: '100.00' },
  });
const customers = () =>
  new InMemoryCustomerRepository([
    Customer.create(NORMAL, 'ana@example.com'),
    Customer.create(PREMIUM, 'luis@example.com', true),
  ]);
const pricer = (cat = catalog()) =>
  new OrderPricer(customers(), cat, new PricingService());

describe('normalizeCart', () => {
  it('quita los guiones del ISBN y deja la cantidad', () => {
    expect(normalizeCart([{ isbn: '978-0-13-235088-4', quantity: 3 }])).toEqual(
      [{ isbn: B, quantity: 3 }],
    );
  });

  it('un ISBN mal formado es INVALID_ISBN', () => {
    expect(() => normalizeCart([{ isbn: '123', quantity: 1 }])).toThrow(
      expect.objectContaining({ code: 'INVALID_ISBN' }) as never,
    );
  });

  it('no cambia el orden ni junta las líneas repetidas (eso lo hace el pedido)', () => {
    expect(
      normalizeCart([
        { isbn: B, quantity: 1 },
        { isbn: A, quantity: 2 },
        { isbn: B, quantity: 1 },
      ]).map((i) => i.isbn),
    ).toEqual([B, A, B]);
  });
});

describe('OrderPricer', () => {
  it('arma el pedido con los precios del catálogo y el id y el cliente indicados', async () => {
    const { order, customer } = await pricer().price({
      orderId: ORDER_ID,
      customerId: NORMAL,
      items: [{ isbn: B, quantity: 2 }],
      address: null,
    });

    expect(order.id).toBe(ORDER_ID);
    expect(order.customerId).toBe(NORMAL);
    expect(customer.id).toBe(NORMAL);
    expect(order.getLines().map((l) => [l.isbn.value, l.quantity])).toEqual([
      [B, 2],
    ]);
  });

  it('guarda la dirección cuando se da, y acepta null para cotizar', async () => {
    const address = ShippingAddress.create(ADDRESS_DATA);
    const withAddress = await pricer().price({
      orderId: ORDER_ID,
      customerId: NORMAL,
      items: [{ isbn: A, quantity: 1 }],
      address,
    });
    const without = await pricer().price({
      orderId: ORDER_ID,
      customerId: NORMAL,
      items: [{ isbn: A, quantity: 1 }],
      address: null,
    });

    expect(withAddress.order.shippingAddress).toEqual(address);
    expect(without.order.shippingAddress).toBeNull();
  });

  describe('el desglose sale del mismo PricingService que el cobro', () => {
    const input = (customerId: string, quantity: number, isbn = B) => ({
      orderId: ORDER_ID,
      customerId,
      items: [{ isbn, quantity }],
      address: null,
    });

    it('cliente normal bajo el mínimo: sin descuento y con envío', async () => {
      const { breakdown } = await pricer().price(input(NORMAL, 1)); // 100.00 < 150.00
      expect(breakdown.subtotal.toFixed()).toBe('100.00');
      expect(breakdown.discount.toFixed()).toBe('0.00');
      expect(breakdown.shipping.toFixed()).toBe('10.00');
      expect(breakdown.total.toFixed()).toBe('110.00');
    });

    it('cliente normal desde el mínimo de envío gratis (150.00)', async () => {
      const { breakdown } = await pricer().price(input(NORMAL, 2)); // 200.00
      expect(breakdown.shipping.toFixed()).toBe('0.00');
      expect(breakdown.total.toFixed()).toBe('200.00');
    });

    it('varias líneas suman para el mínimo de envío gratis; un solo libro barato no llega', async () => {
      const exact = await pricer().price({
        ...input(NORMAL, 1),
        items: [
          { isbn: B, quantity: 1 },
          { isbn: A, quantity: 1 },
          { isbn: A, quantity: 1 },
          { isbn: A, quantity: 1 },
          { isbn: A, quantity: 1 },
        ],
      }); // 100 + 4 × 20 = 180.00 ≥ 150.00
      expect(exact.breakdown.shipping.toFixed()).toBe('0.00');
      const below = await pricer().price(input(NORMAL, 1, A));
      expect(below.breakdown.shipping.toFixed()).toBe('10.00');
    });

    it('cliente premium: 10 % de descuento y envío gratis', async () => {
      const { breakdown } = await pricer().price(input(PREMIUM, 1));
      expect(breakdown.discount.toFixed()).toBe('10.00');
      expect(breakdown.shipping.toFixed()).toBe('0.00');
      expect(breakdown.total.toFixed()).toBe('90.00');
    });

    it('coincide exactamente con calcularlo a mano con PricingService', async () => {
      const { order, customer, breakdown } = await pricer().price(
        input(PREMIUM, 3),
      );
      const direct = new PricingService().calculateFinalPrice(
        order,
        customer,
        true,
      );
      expect(breakdown.total.toFixed()).toBe(direct.toFixed());
    });
  });

  describe('errores y su orden', () => {
    it('un cliente inexistente es NotFoundError y no llega a pedir precios', async () => {
      const cat = catalog();
      const spy = vi.spyOn(cat, 'priceCart');

      await expect(
        pricer(cat).price({
          orderId: ORDER_ID,
          customerId: 'nadie',
          items: [{ isbn: A, quantity: 1 }],
          address: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('un libro inexistente es NotFoundError del catálogo', async () => {
      await expect(
        pricer().price({
          orderId: ORDER_ID,
          customerId: NORMAL,
          items: [{ isbn: '9780201633610', quantity: 1 }],
          address: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('un carrito vacío es EMPTY_ORDER', async () => {
      await expect(
        pricer().price({
          orderId: ORDER_ID,
          customerId: NORMAL,
          items: [],
          address: null,
        }),
      ).rejects.toSatisfy(
        (e: unknown) => e instanceof DomainError && e.code === 'EMPTY_ORDER',
      );
    });
  });
});

// La razón de ser de la tarea 9.4: el armado del pedido vive en un solo sitio. Si alguna de las dos rutas vuelve a
// importar estas piezas, el armado se habrá copiado otra vez
describe('un solo armado del pedido', () => {
  const read = (file: string) =>
    readFileSync(
      `src/contexts/sales/application/use-cases/order/${file}`,
      'utf8',
    );

  it.each(['place-order.handler.ts', 'quote-order.handler.ts'])(
    '%s usa OrderPricer y no arma el pedido por su cuenta',
    (file) => {
      const text = read(file);
      expect(text).toContain("from '../../services/order-pricer.js'");
      for (const forbidden of [
        'catalog-pricing.port',
        'customer.repository',
        'order.factory',
        'free-shipping.specification',
      ]) {
        expect(text, `${file} importa ${forbidden}`).not.toContain(forbidden);
      }
    },
  );

  it.each(['place-order.handler.ts', 'quote-order.handler.ts'])(
    '%s normaliza el ISBN con normalizeCart y no con Isbn.create',
    (file) => {
      const text = read(file);
      expect(text).toContain("from '../../../domain/order/normalize-cart.js'");
      expect(text).not.toContain('Isbn.create');
    },
  );
});
