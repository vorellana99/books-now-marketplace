import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { BookCreatedEvent } from '../../../../contracts/catalog/book-created.event.js';
import type {
  DbDeliveryContext,
  DbOutboxConsumer,
} from '../../../../platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../../../platform/outbox/outbox-handler.decorator.js';
import { toTransactionHandle } from '../../../../platform/prisma/transaction-handle.js';
import { CreateStockItemCommand } from '../../application/use-cases/stock/create-stock-item.command.js';

// Reacciona a catalog.book.created: el libro nuevo tiene su registro de stock, en cero. Catálogo no toca las tablas de
// Inventario; se hablan por el evento. Es un adaptador de entrada fino: convierte la transacción del relay en un
// identificador opaco y envía el comando, así el registro y la marca DONE se confirman juntos. Repetirlo no hace daño ni
// pisa un stock que ya exista
@OutboxHandler()
@Injectable()
export class CreateStockItemConsumer implements DbOutboxConsumer<BookCreatedEvent> {
  readonly kind = 'db' as const;
  readonly name = 'inventory.create-stock-item';
  readonly event = 'catalog.book.created';

  constructor(private readonly commandBus: CommandBus) {}

  async handle(e: BookCreatedEvent, { tx }: DbDeliveryContext): Promise<void> {
    // Un ISBN mal formado en el evento es un error: el relay lo reintenta y acaba en FAILED, a la vista del monitoreo
    await this.commandBus.execute(
      new CreateStockItemCommand(e.isbn, toTransactionHandle(tx)),
    );
  }
}
