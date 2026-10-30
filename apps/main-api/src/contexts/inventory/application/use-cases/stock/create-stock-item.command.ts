import { Command } from '@nestjs/cqrs';
import type { TransactionHandle } from '../../../../../shared-kernel/transaction-handle.js';

// Crea el registro de stock, en cero, de un libro nuevo. Lo envía el consumidor de `catalog.book.created`, que lleva la
// transacción del relay para que el registro y la marca DONE del evento se confirmen juntos. Un ISBN mal formado en el
// evento es un error: el relay lo reintenta y acaba en FAILED, a la vista del monitoreo
export class CreateStockItemCommand extends Command<void> {
  constructor(
    readonly isbn: string,
    readonly tx?: TransactionHandle,
  ) {
    super();
  }
}
