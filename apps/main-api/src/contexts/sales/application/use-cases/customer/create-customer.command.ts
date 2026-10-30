import { Command } from '@nestjs/cqrs';
import type { TransactionHandle } from '../../../../../shared-kernel/transaction-handle.js';

// Crea el cliente de un comprador recién registrado. Lo envía el consumidor de `identity.user.registered`, que lleva la
// transacción del relay para que el cliente y la marca DONE del evento se confirmen juntos. Lleva los datos del evento
// tal como llegaron (el rol y el id sin validar): las reglas están en el manejador
export class CreateCustomerCommand extends Command<void> {
  constructor(
    readonly userId: string,
    readonly email: string,
    readonly role: string,
    readonly tx?: TransactionHandle,
  ) {
    super();
  }
}
