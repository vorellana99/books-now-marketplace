import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Isbn } from '../../../../../shared-kernel/isbn.vo.js';
import { StockRepository } from '../../../domain/ports/stock.repository.js';
import { CreateStockItemCommand } from './create-stock-item.command.js';

@CommandHandler(CreateStockItemCommand)
export class CreateStockItemHandler implements ICommandHandler<CreateStockItemCommand> {
  constructor(private readonly stock: StockRepository) {}

  // Repetirlo no hace daño ni pisa un stock que ya exista (lo garantiza el repositorio)
  async execute({ isbn, tx }: CreateStockItemCommand): Promise<void> {
    await this.stock.createItem(Isbn.create(isbn).value, tx);
  }
}
