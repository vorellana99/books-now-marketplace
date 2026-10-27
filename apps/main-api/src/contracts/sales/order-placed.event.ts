import type { DomainEvent } from '../../shared-kernel/domain-event.js';

// Los consumidores reciben el payload como JSON: sin métodos, y la fecha llega como texto
export class OrderPlacedEvent implements DomainEvent {
  readonly eventName = 'sales.order.placed';
  readonly eventVersion = 1;
  readonly occurredOn = new Date();
  readonly aggregateId: string; // propiedad real (no getter), para que también viaje en el payload JSON

  constructor(
    readonly orderId: string,
    readonly customerId: string,
    readonly subtotal: string, // "100.00": los montos viajan como texto
    readonly lines: { isbn: string; quantity: number }[],
  ) {
    this.aggregateId = orderId;
  }
}
