import type { Prisma } from '../prisma/generated/client.js';

export interface DeliveryContext {
  eventId: string;
  occurredOn: Date;
  attempt: number;
  correlationId: string | null; // requestId de origen: un consumidor externo puede enviarlo al proveedor
}

export interface DbDeliveryContext extends DeliveryContext {
  tx: Prisma.TransactionClient;
}

// Efecto en la BD propia: el relay lo ejecuta dentro de su transacción, junto con la marca DONE
export interface DbOutboxConsumer<E> {
  readonly kind: 'db';
  readonly name: string; // único: 'inventory.confirm-reservation'
  readonly event: string; // 'sales.order.placed'
  handle(event: E, ctx: DbDeliveryContext): Promise<void>;
}

// Efecto externo (email, SUNAT): el relay lo ejecuta FUERA de toda transacción
export interface ExternalOutboxConsumer<E> {
  readonly kind: 'external';
  readonly name: string;
  readonly event: string;
  handle(event: E, ctx: DeliveryContext): Promise<void>; // debe enviar ctx.eventId como clave de idempotencia
}

export type OutboxConsumer<E> = DbOutboxConsumer<E> | ExternalOutboxConsumer<E>;
