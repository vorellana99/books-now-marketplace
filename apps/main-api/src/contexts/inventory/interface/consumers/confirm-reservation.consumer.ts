import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { OrderPlacedEvent } from '../../../../contracts/sales/order-placed.event.js';
import type {
  DbDeliveryContext,
  DbOutboxConsumer,
} from '../../../../platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../../../platform/outbox/outbox-handler.decorator.js';
import { toTransactionHandle } from '../../../../platform/prisma/transaction-handle.js';
import { ConfirmReservationCommand } from '../../application/use-cases/stock/confirm-reservation.command.js';

// Reacciona a OrderPlaced: la reserva HELD pasa a CONFIRMED. Es un adaptador de entrada fino: convierte la transacción
// del relay en un identificador opaco y envía el comando, así el efecto y la marca DONE se confirman juntos y ocurre una
// sola vez. Repetirlo no hace daño: solo toca reservas HELD
@OutboxHandler()
@Injectable()
export class ConfirmReservationConsumer implements DbOutboxConsumer<OrderPlacedEvent> {
  readonly kind = 'db' as const;
  readonly name = 'inventory.confirm-reservation';
  readonly event = 'sales.order.placed';

  constructor(private readonly commandBus: CommandBus) {}

  async handle(e: OrderPlacedEvent, { tx }: DbDeliveryContext): Promise<void> {
    await this.commandBus.execute(
      new ConfirmReservationCommand(e.orderId, toTransactionHandle(tx)),
    );
  }
}
