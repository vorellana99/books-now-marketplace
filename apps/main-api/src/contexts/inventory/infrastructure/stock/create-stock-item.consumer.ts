import { Injectable } from '@nestjs/common';
import type { BookCreatedEvent } from '../../../../contracts/catalog/book-created.event.js';
import type {
  DbDeliveryContext,
  DbOutboxConsumer,
} from '../../../../platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../../../platform/outbox/outbox-handler.decorator.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';

// Reacciona a catalog.book.created: el libro nuevo tiene su registro de stock, en cero. Catálogo no toca las tablas de
// Inventario; se hablan por el evento. Usa el tx del relay, así el registro y la marca DONE se confirman juntos.
// Repetirlo no hace daño ni pisa un stock que ya exista: INSERT … ON CONFLICT DO NOTHING
@OutboxHandler()
@Injectable()
export class CreateStockItemConsumer implements DbOutboxConsumer<BookCreatedEvent> {
  readonly kind = 'db' as const;
  readonly name = 'inventory.create-stock-item';
  readonly event = 'catalog.book.created';

  async handle(e: BookCreatedEvent, { tx }: DbDeliveryContext): Promise<void> {
    // Un ISBN mal formado en el evento es un error: el relay lo reintenta y acaba en FAILED, a la vista del monitoreo
    const isbn = Isbn.create(e.isbn).value;
    await tx.stockItem.createMany({
      data: [{ isbn, available: 0, reserved: 0 }],
      skipDuplicates: true,
    });
  }
}
