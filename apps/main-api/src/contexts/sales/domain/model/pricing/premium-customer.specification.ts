import { Specification } from '../../shared/specification.js';
import type { PricingContext } from './pricing-context.js';

export class PremiumCustomerSpec extends Specification<PricingContext> {
  isSatisfiedBy({ customer }: PricingContext): boolean {
    return customer.isPremium;
  }
}
