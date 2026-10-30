import { DomainError } from '../../../../../shared-kernel/domain.errors.js';
import { Money, type Currency } from '../../shared/money.vo.js';

// Los importes de envío dependen de la moneda del pedido: no se convierten, cada moneda tiene los suyos.
// El descuento premium (10 %) es un porcentaje y vale igual en todas
export interface CurrencyPricingRules {
  freeShippingMinimum: Money; // subtotal, antes del descuento, desde el que el envío es gratis
  shippingCost: Money;
}

export const PRICING_RULES: Record<Currency, CurrencyPricingRules> = {
  PEN: {
    freeShippingMinimum: Money.of('150.00', 'PEN'),
    shippingCost: Money.of('10.00', 'PEN'),
  },
  USD: {
    freeShippingMinimum: Money.of('40.00', 'USD'),
    shippingCost: Money.of('3.00', 'USD'),
  },
};

export function pricingRulesFor(currency: Currency): CurrencyPricingRules {
  if (!Object.hasOwn(PRICING_RULES, currency)) {
    throw new DomainError(
      'UNSUPPORTED_CURRENCY',
      `No hay reglas de precio para la moneda ${currency}`,
    );
  }
  return PRICING_RULES[currency];
}
