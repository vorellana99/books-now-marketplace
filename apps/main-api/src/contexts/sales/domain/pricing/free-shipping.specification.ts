import { Money } from '../shared/money.vo.js';
import { Specification } from '../shared/specification.js';
import { MinimumSubtotalSpec } from './minimum-subtotal.specification.js';
import type { PricingContext } from './pricing-context.js';
import { PremiumCustomerSpec } from './premium-customer.specification.js';

export const FREE_SHIPPING_MINIMUM = Money.of('150.00');

// Envío gratis: subtotal de S/ 150.00 o más, o cliente premium
export class FreeShippingSpec extends Specification<PricingContext> {
  private readonly rule = new MinimumSubtotalSpec(FREE_SHIPPING_MINIMUM).or(
    new PremiumCustomerSpec(),
  );

  isSatisfiedBy(context: PricingContext): boolean {
    return this.rule.isSatisfiedBy(context);
  }
}

export const freeShippingSpec = new FreeShippingSpec();
