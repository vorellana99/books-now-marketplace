import {
  PRICING_RULES,
  pricingRulesFor,
} from '../../../src/contexts/sales/domain/model/pricing/pricing-rules.js';
import { DomainError } from '../../../src/shared-kernel/domain.errors.js';

describe('reglas de precio por moneda', () => {
  it('PEN: envío gratis desde S/ 150.00 y envío de S/ 10.00', () => {
    const rules = pricingRulesFor('PEN');
    expect(rules.freeShippingMinimum.toJSON()).toEqual({
      amount: '150.00',
      currency: 'PEN',
    });
    expect(rules.shippingCost.toJSON()).toEqual({
      amount: '10.00',
      currency: 'PEN',
    });
  });

  it('USD: envío gratis desde 40.00 USD y envío de 3.00 USD', () => {
    const rules = pricingRulesFor('USD');
    expect(rules.freeShippingMinimum.toJSON()).toEqual({
      amount: '40.00',
      currency: 'USD',
    });
    expect(rules.shippingCost.toJSON()).toEqual({
      amount: '3.00',
      currency: 'USD',
    });
  });

  it('cada regla está expresada en la moneda de su entrada (evita un USD cargado en PEN)', () => {
    for (const [currency, rules] of Object.entries(PRICING_RULES)) {
      expect(rules.freeShippingMinimum.currency).toBe(currency);
      expect(rules.shippingCost.currency).toBe(currency);
    }
  });

  it('una moneda sin reglas falla con UNSUPPORTED_CURRENCY en vez de cobrar mal', () => {
    try {
      pricingRulesFor('EUR' as never);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe('UNSUPPORTED_CURRENCY');
    }
  });
});
