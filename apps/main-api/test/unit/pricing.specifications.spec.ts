import { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { OrderFactory } from '../../src/contexts/sales/domain/order/order.factory.js';
import {
  FreeShippingSpec,
  freeShippingSpec,
} from '../../src/contexts/sales/domain/pricing/free-shipping.specification.js';
import { MinimumSubtotalSpec } from '../../src/contexts/sales/domain/pricing/minimum-subtotal.specification.js';
import type { PricingContext } from '../../src/contexts/sales/domain/pricing/pricing-context.js';
import { PremiumCustomerSpec } from '../../src/contexts/sales/domain/pricing/premium-customer.specification.js';
import { PremiumOfferSpec } from '../../src/contexts/sales/domain/pricing/premium-offer.specification.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { Specification } from '../../src/contexts/sales/domain/shared/specification.js';
import { ADDRESS } from '../fakes/fixtures.js';

const context = (
  subtotal: string,
  premium: boolean,
  currency: 'PEN' | 'USD' = 'PEN',
): PricingContext => ({
  order: OrderFactory.fromCart(
    'o-1',
    'c-1',
    [
      {
        isbn: '9780306406157',
        quantity: 1,
        title: 'Libro',
        price: subtotal,
        currency,
      },
    ],
    ADDRESS,
  ),
  customer: Customer.create('c-1', 'ana@example.com', premium),
});

describe('MinimumSubtotalSpec', () => {
  const spec = new MinimumSubtotalSpec(Money.of('150.00'));

  it('se cumple con el subtotal igual o mayor al mínimo', () => {
    expect(spec.isSatisfiedBy(context('150.00', false))).toBe(true);
    expect(spec.isSatisfiedBy(context('150.01', false))).toBe(true);
    expect(spec.isSatisfiedBy(context('160.00', false))).toBe(true);
  });

  it('no se cumple por debajo del mínimo', () => {
    expect(spec.isSatisfiedBy(context('149.99', false))).toBe(false);
  });

  it('mide el subtotal con toda su precisión, sin redondear antes', () => {
    expect(spec.isSatisfiedBy(context('149.999', false))).toBe(false);
  });
});

describe('PremiumCustomerSpec', () => {
  it('se cumple solo para clientes premium', () => {
    const spec = new PremiumCustomerSpec();
    expect(spec.isSatisfiedBy(context('10.00', true))).toBe(true);
    expect(spec.isSatisfiedBy(context('10.00', false))).toBe(false);
  });
});

describe('PremiumOfferSpec', () => {
  it('el descuento premium aplica a los clientes premium', () => {
    const spec = new PremiumOfferSpec();
    expect(spec.isSatisfiedBy(context('10.00', true))).toBe(true);
    expect(spec.isSatisfiedBy(context('500.00', false))).toBe(false);
  });
});

describe('FreeShippingSpec', () => {
  it.each([
    ['cliente normal bajo el mínimo', '100.00', false, false],
    ['cliente normal justo en el mínimo', '150.00', false, true],
    ['cliente normal sobre el mínimo', '160.00', false, true],
    ['cliente premium bajo el mínimo', '100.00', true, true],
    ['cliente premium sobre el mínimo', '200.00', true, true],
  ])('%s', (_caso, subtotal, premium, esperado) => {
    expect(freeShippingSpec.isSatisfiedBy(context(subtotal, premium))).toBe(
      esperado,
    );
  });

  it.each([
    ['cliente normal bajo el mínimo en USD', '39.99', false, false],
    ['cliente normal justo en el mínimo en USD', '40.00', false, true],
    ['cliente normal sobre el mínimo en USD', '100.00', false, true],
    ['cliente premium bajo el mínimo en USD', '10.00', true, true],
  ])('%s', (_caso, subtotal, premium, esperado) => {
    expect(
      freeShippingSpec.isSatisfiedBy(context(subtotal, premium, 'USD')),
    ).toBe(esperado);
  });

  it('usa el mínimo de la moneda del pedido: 100 es envío gratis en USD pero no en PEN', () => {
    expect(
      freeShippingSpec.isSatisfiedBy(context('100.00', false, 'USD')),
    ).toBe(true);
    expect(
      freeShippingSpec.isSatisfiedBy(context('100.00', false, 'PEN')),
    ).toBe(false);
  });

  it('es una Specification y se puede componer', () => {
    expect(freeShippingSpec).toBeInstanceOf(Specification);
    expect(freeShippingSpec).toBeInstanceOf(FreeShippingSpec);
    expect(freeShippingSpec.not().isSatisfiedBy(context('100.00', false))).toBe(
      true,
    );
  });
});
