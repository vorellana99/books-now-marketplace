export interface DomainEvent {
  readonly eventName: string;
  readonly eventVersion: number; // para cambiar el formato sin romper a los consumidores
  readonly aggregateId: string;
  readonly occurredOn: Date;
}
