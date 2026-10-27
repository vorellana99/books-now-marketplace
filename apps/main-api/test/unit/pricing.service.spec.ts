import { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { OrderFactory } from '../../src/contexts/sales/domain/order/order.factory.js';
import { freeShippingSpec } from '../../src/contexts/sales/domain/pricing/free-shipping.specification.js';
import { PricingService } from '../../src/contexts/sales/domain/pricing/pricing.service.js';
import { DomainError } from '../../src/shared-kernel/domain.errors.js';

const ISBN = '9780306406157';
const normal = Customer.create('c-1', 'ana@example.com');
const premium = Customer.create('c-2', 'luis@example.com', true);

// Un pedido de un solo libro cuyo subtotal es exactamente `subtotal`
const orderWith = (subtotal: string, currency: 'PEN' | 'USD' = 'PEN') =>
  OrderFactory.fromCart('o-1', 'c-1', [
    { isbn: ISBN, quantity: 1, title: 'Libro', price: subtotal, currency },
  ]);

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
    const order = OrderFactory.fromCart('o-1', 'c-2', [
      { isbn: ISBN, quantity: 3, title: 'L', price: '33.335', currency: 'PEN' },
    ]);
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

  it('por ahora solo cobra en soles: un pedido en USD falla con CURRENCY_MISMATCH', () => {
    // Las reglas (S/ 150.00 y S/ 10.00) están en PEN; no se inventa una equivalencia para USD
    try {
      finalPrice('100.00', normal, 'USD');
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe('CURRENCY_MISMATCH');
    }
  });
});
