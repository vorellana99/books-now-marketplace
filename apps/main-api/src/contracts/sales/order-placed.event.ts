import type { DomainEvent } from '../../shared-kernel/domain-event.js';

// Se declara aquí y no se importa de Ventas: un contrato no depende del código interno de ningún contexto
export interface ShippingAddressPayload {
  recipient: string;
  phone: string;
  line1: string;
  district: string;
  province: string;
  department: string;
  reference: string | null;
}

// Los consumidores reciben el payload como JSON: sin métodos, y la fecha llega como texto.
// Versión 2: agrega `shippingAddress` (la necesitará Envíos). Los consumidores que leen la versión 1 la ignoran, y los
// eventos ya guardados siguen siendo de la versión 1, sin dirección
export class OrderPlacedEvent implements DomainEvent {
  readonly eventName = 'sales.order.placed';
  readonly eventVersion = 2;
  readonly occurredOn = new Date();
  readonly aggregateId: string; // propiedad real (no getter), para que también viaje en el payload JSON

  constructor(
    readonly orderId: string,
    readonly customerId: string,
    readonly subtotal: string, // "100.00": los montos viajan como texto
    readonly lines: { isbn: string; quantity: number }[],
    readonly shippingAddress: ShippingAddressPayload,
  ) {
    this.aggregateId = orderId;
  }
}
