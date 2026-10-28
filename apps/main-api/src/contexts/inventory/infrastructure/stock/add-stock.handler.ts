import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { StockItemNotFoundError } from '../../../../contracts/inventory/stock.errors.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { DomainError } from '../../../../shared-kernel/domain.errors.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import {
  AddStockCommand,
  MAX_ADDITION,
  MAX_AVAILABLE,
  type StockLevel,
} from '../../application/stock/add-stock.command.js';

@CommandHandler(AddStockCommand)
export class AddStockHandler implements ICommandHandler<AddStockCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ isbn: raw, quantity }: AddStockCommand): Promise<StockLevel> {
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ADDITION
    ) {
      throw new DomainError(
        'INVALID_QUANTITY',
        `La cantidad debe ser un entero de 1 a ${MAX_ADDITION}`,
      );
    }
    const isbn = Isbn.create(raw).value;

    // Un solo UPDATE atómico: suma en la base (no lee, suma y escribe), así que una reserva simultánea no se pisa, y
    // solo suma si el resultado respeta el tope. Toca una sola fila, de modo que no rompe la regla de bloquear en
    // orden de ISBN
    const updated = await this.prisma.$queryRaw<StockLevel[]>`
      UPDATE inventory.stock_items
      SET available = available + ${quantity}
      WHERE isbn = ${isbn} AND available <= ${MAX_AVAILABLE - quantity}
      RETURNING isbn, available, reserved`;
    if (updated.length === 1) return updated[0];

    // No actualizó: o no existe el registro, o la carga pasaría del tope
    const exists = await this.prisma.stockItem.findUnique({ where: { isbn } });
    if (!exists) throw new StockItemNotFoundError(isbn);
    throw new DomainError(
      'STOCK_LIMIT_EXCEEDED',
      `Con ${quantity} unidades más, ${isbn} pasaría del máximo de ${MAX_AVAILABLE} disponibles`,
    );
  }
}
