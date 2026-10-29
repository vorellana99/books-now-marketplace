import { Command } from '@nestjs/cqrs';
import type { TransactionHandle } from '../../../../shared-kernel/transaction-handle.js';

// Pasa a CONFIRMED las reservas HELD de un pedido que se acaba de guardar. Lo envía el consumidor de `OrderPlaced`, que
// lleva la transacción del relay para que la confirmación y la marca DONE del evento se confirmen juntas. Repetirlo no
// hace daño: solo toca las HELD
export class ConfirmReservationCommand extends Command<void> {
  constructor(
    readonly orderId: string,
    readonly tx?: TransactionHandle,
  ) {
    super();
  }
}
