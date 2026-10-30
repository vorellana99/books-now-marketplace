import type { Customer } from '../customer/customer.aggregate.js';
import type { Order } from '../order/order.aggregate.js';
import { Money } from '../../shared/money.vo.js';
import { PriceBreakdown } from './price-breakdown.js';
import { PremiumOfferSpec } from './premium-offer.specification.js';
import { pricingRulesFor } from './pricing-rules.js';

export const PREMIUM_DISCOUNT_FACTOR = '0.90'; // 10 % de descuento, en cualquier moneda

export class PricingService {
  private readonly premiumOffer = new PremiumOfferSpec();

  // Las partes del precio con toda la precisión; quien cobra o muestra redondea una sola vez (`PriceBreakdown.rounded`).
  // El envío gratis lo decide la specification y se recibe ya resuelto; el costo sale de la moneda del pedido
  breakdown(
    order: Order,
    customer: Customer,
    freeShipping: boolean,
  ): PriceBreakdown {
    const subtotal = order.subtotal();
    const discounted = this.premiumOffer.isSatisfiedBy({ order, customer })
      ? subtotal.multiply(PREMIUM_DISCOUNT_FACTOR)
      : subtotal;
    const discount = Money.of(
      subtotal.amount.minus(discounted.amount),
      subtotal.currency,
    );
    const shipping = freeShipping
      ? Money.zero(subtotal.currency)
      : pricingRulesFor(subtotal.currency).shippingCost;
    return new PriceBreakdown(
      subtotal,
      discount,
      shipping,
      discounted.add(shipping),
    );
  }

  // Devuelve el importe con toda la precisión: quien cobra lo redondea una sola vez con `toFinal()`
  calculateFinalPrice(
    order: Order,
    customer: Customer,
    freeShipping: boolean,
  ): Money {
    return this.breakdown(order, customer, freeShipping).total;
  }
}
