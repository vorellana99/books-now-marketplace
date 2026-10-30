import { randomUUID } from 'node:crypto';
import { PrismaStockRepository } from '../../../src/contexts/inventory/infrastructure/persistence/prisma-stock.repository.js';
import { ReserveStockCommand } from '../../../src/contracts/inventory/reserve-stock.command.js';
import { Prisma } from '../../../src/platform/prisma/generated/client.js';
import type { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { ConflictError } from '../../../src/shared-kernel/domain.errors.js';

// Base simulada: solo para provocar el error de clave duplicada que, en la práctica, depende de la carrera entre dos peticiones
function repoWhereCreateFails(error: Error): PrismaStockRepository {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1), // el bloqueo por pedido
    reservation: {
      count: vi.fn().mockResolvedValue(0), // la comprobación previa no ve nada
      createMany: vi.fn().mockRejectedValue(error),
    },
    stockItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
  return new PrismaStockRepository(prisma as unknown as PrismaService);
}

const command = new ReserveStockCommand(randomUUID(), [
  { isbn: '9780306406157', quantity: 1 },
]);

describe('PrismaStockRepository.reserve: carrera entre dos reservas del mismo pedido', () => {
  it('una clave duplicada al crear la reserva (P2002) se vuelve ConflictError', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );

    const error = await repoWhereCreateFails(duplicate)
      .reserve(command.orderId, command.lines)
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('ORDER_ALREADY_RESERVED');
  });

  it('cualquier otro error de la base sale sin cambiar', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('Connection lost', {
      code: 'P1001',
      clientVersion: 'test',
    });

    await expect(
      repoWhereCreateFails(other).reserve(command.orderId, command.lines),
    ).rejects.toBe(other);
  });
});
