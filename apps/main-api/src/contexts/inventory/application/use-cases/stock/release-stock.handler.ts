import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ReleaseStockCommand } from '../../../../../contracts/inventory/release-stock.command.js';
import { StockRepository } from '../../../domain/ports/stock.repository.js';
import { assertOrderId } from '../../../domain/stock/stock-rules.js';

// Idempotente y segura bajo concurrencia (lo garantiza el repositorio): devuelve el stock de las reservas HELD del
// pedido, una sola vez
@CommandHandler(ReleaseStockCommand)
export class ReleaseStockHandler implements ICommandHandler<ReleaseStockCommand> {
  constructor(private readonly stock: StockRepository) {}

  async execute({ orderId }: ReleaseStockCommand): Promise<void> {
    assertOrderId(orderId);
    await this.stock.release(orderId);
  }
}
