import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ReserveStockCommand } from '../../../../contracts/inventory/reserve-stock.command.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../../../contracts/inventory/stock.errors.js';
import { Prisma } from '../../../../platform/prisma/generated/client.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import {
  ConflictError,
  DomainError,
} from '../../../../shared-kernel/domain.errors.js';
import { sortByIsbn } from './lock-order.js';

type Line = ReserveStockCommand['lines'][number];

// Reserva todas las líneas o ninguna: una sola transacción, y el primer fallo la revierte entera
@CommandHandler(ReserveStockCommand)
export class ReserveStockHandler implements ICommandHandler<ReserveStockCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ orderId, lines }: ReserveStockCommand): Promise<void> {
    // Antes de abrir la transacción: una entrada inválida es un error de dominio, no el de la base
    assertValid(lines);

    await this.prisma.$transaction(async (tx) => {
      if ((await tx.reservation.count({ where: { orderId } })) > 0) {
        throw alreadyReserved(orderId);
      }

      for (const { isbn, quantity } of sortByIsbn(lines)) {
        // Solo descuenta si alcanza: nunca queda en negativo, aunque haya pedidos simultáneos
        const { count } = await tx.stockItem.updateMany({
          where: { isbn, available: { gte: quantity } },
          data: {
            available: { decrement: quantity },
            reserved: { increment: quantity },
          },
        });
        if (count === 0) {
          // Distingue "no alcanza" de "no existe el registro de stock" (dato inconsistente)
          const exists = await tx.stockItem.findUnique({
            where: { isbn },
            select: { isbn: true },
          });
          throw exists
            ? new OutOfStockError(isbn)
            : new StockItemNotFoundError(isbn);
        }
      }

      try {
        await tx.reservation.createMany({
          data: lines.map(({ isbn, quantity }) => ({
            orderId,
            isbn,
            quantity,
          })),
        });
      } catch (error) {
        // Otra petición reservó el mismo pedido justo después de la comprobación de arriba
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw alreadyReserved(orderId);
        }
        throw error;
      }
    });
  }
}

function alreadyReserved(orderId: string): ConflictError {
  return new ConflictError(
    'ORDER_ALREADY_RESERVED',
    `El pedido ${orderId} ya tiene stock reservado`,
  );
}

function assertValid(lines: Line[]): void {
  if (lines.length === 0) {
    throw new DomainError('EMPTY_RESERVATION', 'No hay libros que reservar');
  }
  const seen = new Set<string>();
  for (const { isbn, quantity } of lines) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new DomainError(
        'INVALID_QUANTITY',
        `La cantidad de ${isbn} debe ser un entero de al menos 1`,
      );
    }
    if (seen.has(isbn)) {
      throw new DomainError(
        'DUPLICATE_RESERVATION_LINE',
        `El libro ${isbn} aparece más de una vez`,
      );
    }
    seen.add(isbn);
  }
}
