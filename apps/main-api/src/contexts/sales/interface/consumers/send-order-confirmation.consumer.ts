import { Injectable, Logger } from '@nestjs/common';
import type { OrderPlacedEvent } from '../../../../contracts/sales/order-placed.event.js';
import type {
  DeliveryContext,
  ExternalOutboxConsumer,
} from '../../../../platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../../../platform/outbox/outbox-handler.decorator.js';
import { CustomerRepository } from '../../domain/ports/customer.repository.js';
import { Notifier } from '../../domain/ports/notifier.port.js';

// Avisa al cliente de que su pedido fue recibido. El relay lo ejecuta fuera de toda transacción y puede entregar
// el mismo evento más de una vez, así que el eventId viaja como clave de idempotencia
@OutboxHandler()
@Injectable()
export class SendOrderConfirmationConsumer implements ExternalOutboxConsumer<OrderPlacedEvent> {
  readonly kind = 'external' as const;
  readonly name = 'sales.send-order-confirmation';
  readonly event = 'sales.order.placed';
  private readonly logger = new Logger(SendOrderConfirmationConsumer.name);

  constructor(
    private readonly customers: CustomerRepository,
    private readonly notifier: Notifier,
  ) {}

  async handle(
    e: OrderPlacedEvent,
    { eventId }: DeliveryContext,
  ): Promise<void> {
    const customer = await this.customers.findById(e.customerId);
    if (!customer) {
      // Reintentar no lo arreglaría: se deja constancia y la entrega termina
      this.logger.warn(
        `Pedido ${e.orderId}: el cliente ${e.customerId} no existe, no se envía confirmación`,
      );
      return;
    }
    // Si el proveedor falla, el error sube y el relay reintenta con la misma clave
    await this.notifier.send(
      customer.email.value,
      `¡Gracias! Tu pedido ${e.orderId} fue recibido.`,
      { idempotencyKey: eventId },
    );
  }
}
