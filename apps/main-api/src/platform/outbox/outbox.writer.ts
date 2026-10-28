import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import { RequestContext } from '../observability/request-context.js';
import type { Prisma } from '../prisma/generated/client.js';
import { OutboxRegistry } from './outbox.registry.js';

@Injectable()
export class OutboxWriter {
  constructor(private readonly registry: OutboxRegistry) {}

  // Siempre recibe la transacción de quien guarda el agregado: nunca abre la suya.
  // Así el pedido y su evento se confirman juntos o no se confirma ninguno
  async append(
    tx: Prisma.TransactionClient,
    events: DomainEvent[],
  ): Promise<void> {
    for (const event of events) {
      const consumers = this.registry.consumersOf(event.eventName);
      if (consumers.length === 0) continue; // nadie escucha este evento todavía

      const { id } = await tx.outboxMessage.create({
        data: {
          eventName: event.eventName,
          eventVersion: event.eventVersion,
          aggregateId: event.aggregateId,
          payload: JSON.parse(JSON.stringify(event)),
          occurredOn: event.occurredOn,
          // fuera del payload: es un dato técnico, no de negocio
          correlationId: RequestContext.requestId() ?? null,
        },
      });
      await tx.delivery.createMany({
        data: consumers.map((consumer) => ({ eventId: id, consumer })),
      });
    }
  }
}
