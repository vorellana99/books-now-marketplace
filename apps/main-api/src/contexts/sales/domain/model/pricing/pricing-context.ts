import type { Customer } from '../customer/customer.aggregate.js';
import type { Order } from '../order/order.aggregate.js';

// Lo que las reglas de precio necesitan saber para decidir
export interface PricingContext {
  order: Order;
  customer: Customer;
}
