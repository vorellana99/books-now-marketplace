import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ReleaseStockCommand } from '../../../../contracts/inventory/release-stock.command.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { sortByIsbn } from './lock-order.js';
import { assertOrderId } from './order-id.js';

// Idempotente y segura bajo concurrencia: devuelve el stock de las reservas HELD del pedido, una sola vez
@CommandHandler(ReleaseStockCommand)
export class ReleaseStockHandler implements ICommandHandler<ReleaseStockCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ orderId }: ReleaseStockCommand): Promise<void> {
    assertOrderId(orderId);

    await this.prisma.$transaction(async (tx) => {
      // Borra y devuelve en un solo paso. Si dos liberaciones corren a la vez, la segunda espera
      // el bloqueo de fila, ya no encuentra reservas y no devuelve el stock otra vez.
      // Solo HELD: una reserva CONFIRMED ya es definitiva y no se libera
      const released = await tx.$queryRaw<{ isbn: string; quantity: number }[]>`
        DELETE FROM inventory.reservations
        WHERE order_id = ${orderId}::uuid AND status = 'HELD'
        RETURNING isbn, quantity`;

      // Mismo orden de bloqueo que la reserva (lock-order.ts)
      for (const { isbn, quantity } of sortByIsbn(released)) {
        await tx.stockItem.update({
          where: { isbn },
          data: {
            available: { increment: quantity },
            reserved: { decrement: quantity },
          },
        });
      }
    });
  }
}
