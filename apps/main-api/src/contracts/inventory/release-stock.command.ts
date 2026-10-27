import { Command } from '@nestjs/cqrs';

// Idempotente: liberar un pedido sin reservas no hace nada
export class ReleaseStockCommand extends Command<void> {
  constructor(readonly orderId: string) {
    super();
  }
}
