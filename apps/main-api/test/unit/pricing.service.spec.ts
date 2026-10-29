import { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { OrderFactory } from '../../src/contexts/sales/domain/order/order.factory.js';
import { freeShippingSpec } from '../../src/contexts/sales/domain/pricing/free-shipping.specification.js';
import { PricingService } from '../../src/contexts/sales/domain/pricing/pricing.service.js';
import { ADDRESS } from '../fakes/fixtures.js';

const ISBN = '9780306406157';
const normal = Customer.create('c-1', 'ana@example.com');
const premium = Customer.create('c-2', 'luis@example.com', true);

// Un pedido de un solo libro cuyo subtotal es exactamente `subtotal`
const orderWith = (subtotal: string, currency: 'PEN' | 'USD' = 'PEN') =>
  OrderFactory.fromCart(
    'o-1',
    'c-1',
    [{ isbn: ISBN, quantity: 1, title: 'Libro', price: subtotal, currency }],
    ADDRESS,
  );

// Igual que el handler: la specification decide el envío gratis y el servicio calcula
const finalPrice = (
  subtotal: string,
  customer: Customer,
  currency: 'PEN' | 'USD' = 'PEN',
) => {
  const order = orderWith(subtotal, currency);
  const free = freeShippingSpec.isSatisfiedBy({ order, customer });
  return new PricingService().calculateFinalPrice(order, customer, free);
};

describe('PricingService: ejemplos de la tabla del producto', () => {
  it.each([
    ['Normal', 'S/ 100.00', '100.00', normal, '110.00'], // + envío S/ 10.00
    ['Normal', 'S/ 160.00', '160.00', normal, '160.00'], // envío gratis (≥ 150)
    ['Premium', 'S/ 100.00', '100.00', premium, '90.00'], // −10 % y envío gratis
    ['Premium', 'S/ 200.00', '200.00', premium, '180.00'],
  ])(
    '%s con subtotal %s → total %s',
    (_tipo, _etiqueta, subtotal, customer, total) => {
      expect(finalPrice(subtotal, customer).toFinal().toFixed()).toBe(total);
    },
  );
});

describe('PricingService: reglas', () => {
  it('el envío cuesta S/ 10.00', () => {
    expect(finalPrice('50.00', normal).toFixed()).toBe('60.00');
  });

  it('el límite de envío gratis es 150.00 inclusive', () => {
    expect(finalPrice('150.00', normal).toFixed()).toBe('150.00');
    expect(finalPrice('149.99', normal).toFixed()).toBe('159.99');
  });

  it('el límite se mide sobre el subtotal, antes del descuento', () => {
    // premium: 140.00 × 0.90 = 126.00 y envío gratis por ser premium
    expect(finalPrice('140.00', premium).toFixed()).toBe('126.00');
  });

  it('el descuento premium es el 10 % del subtotal, sin tocar el envío', () => {
    const order = orderWith('100.00');
    const conEnvio = new PricingService().calculateFinalPrice(
      order,
      premium,
      false,
    );
    expect(conEnvio.toFixed()).toBe('100.00'); // 90.00 + 10.00
  });

  it('el servicio obedece al indicador de envío gratis que recibe', () => {
    const order = orderWith('50.00');
    const service = new PricingService();
    expect(service.calculateFinalPrice(order, normal, true).toFixed()).toBe(
      '50.00',
    );
    expect(service.calculateFinalPrice(order, normal, false).toFixed()).toBe(
      '60.00',
    );
  });

  it('un cliente normal no recibe descuento', () => {
    expect(finalPrice('200.00', normal).toFixed()).toBe('200.00');
  });

  it('devuelve el importe sin redondear: el handler redondea una sola vez', () => {
    // 100.005 × 0.90 = 90.0045 → toFinal da 90.00
    const order = OrderFactory.fromCart(
      'o-1',
      'c-2',
      [
        {
          isbn: ISBN,
          quantity: 3,
          title: 'L',
          price: '33.335',
          currency: 'PEN',
        },
      ],
      ADDRESS,
    );
    const total = new PricingService().calculateFinalPrice(
      order,
      premium,
      true,
    );
    expect(total.amount.toString()).toBe('90.0045');
    expect(total.toFinal().toFixed()).toBe('90.00');
  });

  it('redondea la mitad hacia arriba al final', () => {
    // 149.995 < 150 → + 10.00 = 159.995 → 160.00
    expect(finalPrice('149.995', normal).toFinal().toFixed()).toBe('160.00');
  });

  it('no modifica el pedido', () => {
    const order = orderWith('100.00');
    new PricingService().calculateFinalPrice(order, premium, true);
    expect(order.subtotal().toFixed()).toBe('100.00');
    expect(order.status).toBe('DRAFT');
  });
});

describe('PricingService: pedidos en dólares (mínimo 40.00 USD, envío 3.00 USD)', () => {
  it.each([
    ['Normal', '20.00', '23.00', normal], // + envío 3.00 USD
    ['Normal', '50.00', '50.00', normal], // envío gratis (≥ 40.00 USD)
    ['Premium', '20.00', '18.00', premium], // −10 % y envío gratis
    ['Premium', '100.00', '90.00', premium],
  ])(
    '%s con subtotal %s USD → total %s USD',
    (_tipo, subtotal, total, customer) => {
      const result = finalPrice(subtotal, customer, 'USD').toFinal();
      expect(result.toFixed()).toBe(total);
      expect(result.currency).toBe('USD');
    },
  );

  it('el envío cuesta 3.00 USD', () => {
    expect(finalPrice('10.00', normal, 'USD').toFixed()).toBe('13.00');
  });

  it('el límite de envío gratis es 40.00 USD inclusive', () => {
    expect(finalPrice('40.00', normal, 'USD').toFixed()).toBe('40.00');
    expect(finalPrice('39.99', normal, 'USD').toFixed()).toBe('42.99');
  });

  it('el mismo importe cuenta distinto según la moneda', () => {
    // 100 PEN no llega a S/ 150 y paga envío; 100 USD supera los 40 USD y no lo paga
    expect(finalPrice('100.00', normal, 'PEN').toFixed()).toBe('110.00');
    expect(finalPrice('100.00', normal, 'USD').toFixed()).toBe('100.00');
  });

  it('el total sale en la moneda del pedido', () => {
    expect(finalPrice('20.00', normal, 'USD').toJSON()).toEqual({
      amount: '23.00',
      currency: 'USD',
    });
  });
});

// ── El desglose del precio (corte 8): el cobro y la cotización salen del mismo cálculo ─────────────────────────────
describe('PricingService.breakdown', () => {
  const pricingFor = (
    subtotal: string,
    customer: Customer,
    currency: 'PEN' | 'USD' = 'PEN',
  ) => {
    const order = orderWith(subtotal, currency);
    const free = freeShippingSpec.isSatisfiedBy({ order, customer });
    return new PricingService().breakdown(order, customer, free);
  };
  const shown = (
    subtotal: string,
    customer: Customer,
    currency: 'PEN' | 'USD' = 'PEN',
  ) => {
    const r = pricingFor(subtotal, customer, currency).rounded();
    return {
      subtotal: r.subtotal.toFixed(),
      discount: r.discount.toFixed(),
      shipping: r.shipping.toFixed(),
      total: r.total.toFixed(),
    };
  };

  describe('los ocho ejemplos del producto, con todas sus partes', () => {
    it.each([
      [
        'PEN normal 100',
        '100.00',
        normal,
        'PEN',
        ['100.00', '0.00', '10.00', '110.00'],
      ],
      [
        'PEN normal 160',
        '160.00',
        normal,
        'PEN',
        ['160.00', '0.00', '0.00', '160.00'],
      ],
      [
        'PEN premium 100',
        '100.00',
        premium,
        'PEN',
        ['100.00', '10.00', '0.00', '90.00'],
      ],
      [
        'PEN premium 200',
        '200.00',
        premium,
        'PEN',
        ['200.00', '20.00', '0.00', '180.00'],
      ],
      [
        'USD normal 20',
        '20.00',
        normal,
        'USD',
        ['20.00', '0.00', '3.00', '23.00'],
      ],
      [
        'USD normal 50',
        '50.00',
        normal,
        'USD',
        ['50.00', '0.00', '0.00', '50.00'],
      ],
      [
        'USD premium 20',
        '20.00',
        premium,
        'USD',
        ['20.00', '2.00', '0.00', '18.00'],
      ],
      [
        'USD premium 100',
        '100.00',
        premium,
        'USD',
        ['100.00', '10.00', '0.00', '90.00'],
      ],
    ] as const)('%s', (_name, subtotal, customer, currency, parts) => {
      const [s, d, sh, t] = parts;
      expect(shown(subtotal, customer, currency)).toEqual({
        subtotal: s,
        discount: d,
        shipping: sh,
        total: t,
      });
    });
  });

  describe('sin redondear', () => {
    it('el descuento y el total llevan todos sus decimales', () => {
      const b = pricingFor('9.99', premium);
      expect(b.subtotal.amount.toString()).toBe('9.99');
      expect(b.discount.amount.toString()).toBe('0.999'); // 10 % de 9.99
      expect(b.total.amount.toString()).toBe('8.991');
      expect(b.shipping.amount.toString()).toBe('0');
    });

    it('subtotal − descuento + envío = total, exacto', () => {
      const b = pricingFor('9.99', premium);
      expect(
        b.subtotal.amount
          .minus(b.discount.amount)
          .plus(b.shipping.amount)
          .equals(b.total.amount),
      ).toBe(true);
    });

    it('calculateFinalPrice es el total del desglose, sin redondear', () => {
      expect(finalPrice('9.99', premium).amount.toString()).toBe('8.991');
      expect(
        finalPrice('9.99', premium).equals(pricingFor('9.99', premium).total),
      ).toBe(true);
    });

    it('un cliente normal no tiene descuento', () => {
      expect(pricingFor('9.99', normal).discount.amount.toString()).toBe('0');
    });
  });

  describe('lo que se muestra: el total es lo único que se redondea', () => {
    it('9.99 premium: total 8.99 y descuento 1.00', () => {
      expect(shown('9.99', premium)).toEqual({
        subtotal: '9.99',
        discount: '1.00',
        shipping: '0.00',
        total: '8.99',
      });
    });

    it('la mitad sube en el total: 0.05 premium → 0.045 → 0.05, y el descuento sale de ahí (0.00, no 0.01)', () => {
      expect(shown('0.05', premium)).toEqual({
        subtotal: '0.05',
        discount: '0.00',
        shipping: '0.00',
        total: '0.05',
      });
    });

    it('0.15 premium: el total es 0.14 y el descuento 0.01, aunque redondeado por su lado sería 0.02', () => {
      const r = shown('0.15', premium);
      expect(r.total).toBe('0.14');
      expect(r.discount).toBe('0.01');
    });

    it('el total mostrado es el mismo que se cobraría', () => {
      for (const subtotal of [
        '9.99',
        '0.05',
        '0.15',
        '33.33',
        '149.99',
        '150.00',
      ]) {
        for (const customer of [normal, premium]) {
          expect(pricingFor(subtotal, customer).rounded().total.toFixed()).toBe(
            finalPrice(subtotal, customer).toFinal().toFixed(),
          );
        }
      }
    });

    it('el subtotal se muestra con 2 decimales aunque el precio de un libro traiga más', () => {
      // El catálogo guarda 2 decimales, pero el dominio no lo da por hecho: 9.995 × 1 → 10.00 (la mitad sube)
      const r = pricingFor('9.995', normal).rounded();
      expect(r.subtotal.amount.toString()).toBe('10');
      expect(r.subtotal.toFixed()).toBe('10.00');
      expect(r.subtotal.amount.decimalPlaces()).toBeLessThanOrEqual(2);
    });

    it('el subtotal y el envío se muestran tal cual, con 2 decimales', () => {
      const r = pricingFor('50.00', normal).rounded();
      expect(r.subtotal.toFixed()).toBe('50.00');
      expect(r.shipping.toFixed()).toBe('10.00');
    });

    it('las partes mostradas siempre suman el total mostrado, en 4000 casos', () => {
      let seed = 12345;
      const next = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed;
      };
      for (let i = 0; i < 1000; i++) {
        const cents = (next() % 500_000) + 1;
        const subtotal = (cents / 100).toFixed(2);
        for (const customer of [normal, premium]) {
          for (const currency of ['PEN', 'USD'] as const) {
            const r = pricingFor(subtotal, customer, currency).rounded();
            const sum = r.subtotal.amount
              .minus(r.discount.amount)
              .plus(r.shipping.amount);
            expect(sum.equals(r.total.amount), `${subtotal} ${currency}`).toBe(
              true,
            );
            expect(r.discount.amount.isNegative()).toBe(false);
            expect(r.discount.amount.lte(r.subtotal.amount)).toBe(true);
            expect(r.total.amount.decimalPlaces()).toBeLessThanOrEqual(2);
          }
        }
      }
    });
  });

  describe('el envío', () => {
    it('cuesta lo de la moneda cuando no es gratis', () => {
      expect(pricingFor('50.00', normal, 'PEN').shipping.toFixed()).toBe(
        '10.00',
      );
      expect(pricingFor('20.00', normal, 'USD').shipping.toFixed()).toBe(
        '3.00',
      );
    });

    it('es cero, en la moneda del pedido, cuando es gratis', () => {
      const b = pricingFor('160.00', normal, 'PEN');
      expect(b.shipping.toFixed()).toBe('0.00');
      expect(b.shipping.currency).toBe('PEN');
      expect(pricingFor('50.00', normal, 'USD').shipping.currency).toBe('USD');
    });

    it('un cliente premium siempre lo tiene gratis', () => {
      expect(pricingFor('1.00', premium).shipping.toFixed()).toBe('0.00');
    });
  });

  it('todas las partes llevan la moneda del pedido', () => {
    for (const currency of ['PEN', 'USD'] as const) {
      const b = pricingFor('30.00', premium, currency).rounded();
      for (const part of [b.subtotal, b.discount, b.shipping, b.total]) {
        expect(part.currency).toBe(currency);
      }
    }
  });

  it('el subtotal es el del pedido, con varias líneas', () => {
    const order = OrderFactory.fromCart(
      'o-1',
      'c-1',
      [
        {
          isbn: '9780306406157',
          quantity: 3,
          title: 'A',
          price: '9.99',
          currency: 'PEN',
        },
        {
          isbn: '9780132350884',
          quantity: 7,
          title: 'B',
          price: '0.10',
          currency: 'PEN',
        },
      ],
      ADDRESS,
    );
    const free = freeShippingSpec.isSatisfiedBy({ order, customer: normal });
    const b = new PricingService().breakdown(order, normal, free);
    expect(b.subtotal.toFixed()).toBe('30.67'); // 29.97 + 0.70
    expect(b.subtotal.equals(order.subtotal())).toBe(true);
  });

  it('calcularlo dos veces da lo mismo y no cambia el pedido', () => {
    const order = orderWith('120.00');
    const before = order.subtotal().toFixed();
    const service = new PricingService();
    const a = service.breakdown(order, premium, true);
    const b = service.breakdown(order, premium, true);
    expect(a.total.equals(b.total)).toBe(true);
    expect(order.subtotal().toFixed()).toBe(before);
  });
});
