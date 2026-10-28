import type { DomainEvent } from '../../shared-kernel/domain-event.js';

// Un libro nuevo existe en el catálogo. Inventario reacciona creándole su registro de stock en cero. Solo lleva el
// ISBN, que es lo que otros contextos usan para referirse al libro; viaja como JSON
export class BookCreatedEvent implements DomainEvent {
  readonly eventName = 'catalog.book.created';
  readonly eventVersion = 1;
  readonly occurredOn = new Date();
  readonly aggregateId: string; // propiedad real (no getter), para que también viaje en el payload JSON

  constructor(readonly isbn: string) {
    this.aggregateId = isbn;
  }
}
