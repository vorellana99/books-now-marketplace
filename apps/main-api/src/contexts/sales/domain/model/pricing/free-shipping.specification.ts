import { Specification } from '../../shared/specification.js';
import { MinimumSubtotalSpec } from './minimum-subtotal.specification.js';
import type { PricingContext } from './pricing-context.js';
import { pricingRulesFor } from './pricing-rules.js';
import { PremiumCustomerSpec } from './premium-customer.specification.js';

// Envío gratis: subtotal igual o mayor al mínimo de la moneda del pedido, o cliente premium
export class FreeShippingSpec extends Specification<PricingContext> {
  private readonly premium = new PremiumCustomerSpec();

  isSatisfiedBy(context: PricingContext): boolean {
    const { freeShippingMinimum } = pricingRulesFor(
      context.order.subtotal().currency,
    );
    return new MinimumSubtotalSpec(freeShippingMinimum)
      .or(this.premium)
      .isSatisfiedBy(context);
  }
}

export const freeShippingSpec = new FreeShippingSpec();
