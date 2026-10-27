import { Command } from '@nestjs/cqrs';

// Reserva todas las líneas o ninguna. Lanza OutOfStockError o StockItemNotFoundError
export class ReserveStockCommand extends Command<void> {
  constructor(
    readonly orderId: string,
    readonly lines: { isbn: string; quantity: number }[],
  ) {
    super();
  }
}
