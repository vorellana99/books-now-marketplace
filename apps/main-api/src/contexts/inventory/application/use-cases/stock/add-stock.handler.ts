import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Isbn } from '../../../../../shared-kernel/isbn.vo.js';
import { StockRepository } from '../../../domain/ports/stock.repository.js';
import {
  assertValidAddition,
  type StockLevel,
} from '../../../domain/stock/stock-rules.js';
import { AddStockCommand } from './add-stock.command.js';

@CommandHandler(AddStockCommand)
export class AddStockHandler implements ICommandHandler<AddStockCommand> {
  constructor(private readonly stock: StockRepository) {}

  // La suma es atómica en la base (no lee, suma y escribe) y respeta el tope: lo garantiza el repositorio
  async execute({ isbn: raw, quantity }: AddStockCommand): Promise<StockLevel> {
    assertValidAddition(quantity);
    return this.stock.add(Isbn.create(raw).value, quantity);
  }
}
