import { Specification } from '../shared/specification.js';
import type { PricingContext } from './pricing-context.js';
import { PremiumCustomerSpec } from './premium-customer.specification.js';

// ¿Aplica el descuento premium? Hoy, a todo cliente premium; aquí se añadirían condiciones nuevas
export class PremiumOfferSpec extends Specification<PricingContext> {
  private readonly rule = new PremiumCustomerSpec();

  isSatisfiedBy(context: PricingContext): boolean {
    return this.rule.isSatisfiedBy(context);
  }
}
