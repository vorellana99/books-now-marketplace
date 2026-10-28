import { Injectable } from '@nestjs/common';
import type { OrderPlacedEvent } from '../../../../contracts/sales/order-placed.event.js';
import type {
  DbDeliveryContext,
  DbOutboxConsumer,
} from '../../../../platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../../../platform/outbox/outbox-handler.decorator.js';

// Reacciona a OrderPlaced: la reserva HELD pasa a CONFIRMED. Usa el tx del relay, así el efecto y la marca DONE
// se confirman juntos y ocurre una sola vez. Repetirlo no hace daño: solo toca reservas HELD
@OutboxHandler()
@Injectable()
export class ConfirmReservationConsumer implements DbOutboxConsumer<OrderPlacedEvent> {
  readonly kind = 'db' as const;
  readonly name = 'inventory.confirm-reservation';
  readonly event = 'sales.order.placed';

  async handle(e: OrderPlacedEvent, { tx }: DbDeliveryContext): Promise<void> {
    await tx.reservation.updateMany({
      where: { orderId: e.orderId, status: 'HELD' },
      data: { status: 'CONFIRMED' },
    });
  }
}
