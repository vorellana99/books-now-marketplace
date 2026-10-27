import type { Customer } from '../customer/customer.aggregate.js';
import type { Order } from '../order/order.aggregate.js';
import { Money } from '../shared/money.vo.js';
import { PremiumOfferSpec } from './premium-offer.specification.js';

export const SHIPPING_COST = Money.of('10.00');
export const PREMIUM_DISCOUNT_FACTOR = '0.90'; // 10 % de descuento

export class PricingService {
  private readonly premiumOffer = new PremiumOfferSpec();

  // Devuelve el importe con toda la precisión: quien cobra lo redondea una sola vez con `toFinal()`.
  // El envío gratis lo decide la specification y se recibe ya resuelto
  calculateFinalPrice(
    order: Order,
    customer: Customer,
    freeShipping: boolean,
  ): Money {
    const subtotal = order.subtotal();
    const discounted = this.premiumOffer.isSatisfiedBy({ order, customer })
      ? subtotal.multiply(PREMIUM_DISCOUNT_FACTOR)
      : subtotal;
    return freeShipping ? discounted : discounted.add(SHIPPING_COST);
  }
}
