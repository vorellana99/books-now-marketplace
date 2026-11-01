import { randomUUID } from 'node:crypto';
import type { DomainEvent } from '../../src/shared-kernel/domain-event.js';
import type { Order } from '../../src/contexts/sales/domain/model/order/order.aggregate.js';
import { OrderRepository } from '../../src/contexts/sales/domain/ports/order.repository.js';
import type { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { InMemoryCheckoutLog } from './in-memory-checkout-log.js';

interface Options {
  failOnSave?: boolean; // falla antes de guardar: no queda nada
  failAfterCommit?: boolean; // guarda y luego lanza, como una respuesta perdida (commit ambiguo)
}

export class InMemoryOrderRepository extends OrderRepository {
  private readonly orders = new Map<string, Order>();
  private readonly events = new Map<string, DomainEvent[]>();

  constructor(
    private readonly options: Options = {},
    readonly checkoutLog = new InMemoryCheckoutLog(),
  ) {
    super();
  }

  nextId(): string {
    return randomUUID();
  }

  findById(id: string): Promise<Order | null> {
    return Promise.resolve(this.orders.get(id) ?? null);
  }

  // Como el real: pedido, checkout COMPLETED y eventos del outbox en un solo paso
  save(order: Order, charged: Money): Promise<void> {
    if (this.options.failOnSave) {
      return Promise.reject(new Error('Falla al guardar el pedido'));
    }
    this.events.set(order.id, order.pullEvents());
    this.orders.set(order.id, order);
    this.checkoutLog.complete(order.id, charged.toFinal());
    if (this.options.failAfterCommit) {
      return Promise.reject(new Error('Respuesta perdida tras confirmar'));
    }
    return Promise.resolve();
  }

  count(): number {
    return this.orders.size;
  }

  eventsOf(orderId: string): DomainEvent[] {
    return this.events.get(orderId) ?? [];
  }
}
