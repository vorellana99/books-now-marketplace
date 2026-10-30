import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ReserveStockCommand } from '../../../../../contracts/inventory/reserve-stock.command.js';
import { StockRepository } from '../../../domain/ports/stock.repository.js';
import {
  assertOrderId,
  assertValidLines,
} from '../../../domain/stock/stock-rules.js';

// Reserva todas las líneas o ninguna (lo garantiza el repositorio). Una entrada inválida es un error de dominio, antes
// de tocar la base y no el error crudo de la base
@CommandHandler(ReserveStockCommand)
export class ReserveStockHandler implements ICommandHandler<ReserveStockCommand> {
  constructor(private readonly stock: StockRepository) {}

  async execute({ orderId, lines }: ReserveStockCommand): Promise<void> {
    assertOrderId(orderId);
    assertValidLines(lines);
    await this.stock.reserve(orderId, lines);
  }
}
