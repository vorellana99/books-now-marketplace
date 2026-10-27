import type { Money } from '../shared/money.vo.js';
import type { Order } from './order.aggregate.js';

export abstract class OrderRepository {
  abstract findById(id: string): Promise<Order | null>;
  abstract save(order: Order, charged: Money): Promise<void>; // también marca el checkout COMPLETED
  abstract nextId(): string;
}
