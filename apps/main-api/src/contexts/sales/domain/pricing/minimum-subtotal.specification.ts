import type { Money } from '../shared/money.vo.js';
import { Specification } from '../shared/specification.js';
import type { PricingContext } from './pricing-context.js';

// El subtotal se mide antes del descuento y sin redondear
export class MinimumSubtotalSpec extends Specification<PricingContext> {
  constructor(private readonly minimum: Money) {
    super();
  }

  isSatisfiedBy({ order }: PricingContext): boolean {
    return order.subtotal().isGreaterOrEqualThan(this.minimum);
  }
}
