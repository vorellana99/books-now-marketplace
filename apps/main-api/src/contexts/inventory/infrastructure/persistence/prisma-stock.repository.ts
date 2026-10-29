import { Injectable } from '@nestjs/common';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../../../contracts/inventory/stock.errors.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { fromTransactionHandle } from '../../../../platform/prisma/transaction-handle.js';
import { isUniqueViolation } from '../../../../platform/prisma/unique-violation.js';
import {
  ConflictError,
  DomainError,
} from '../../../../shared-kernel/domain.errors.js';
import type { TransactionHandle } from '../../../../shared-kernel/transaction-handle.js';
import { StockRepository } from '../../domain/ports/stock.repository.js';
import {
  MAX_AVAILABLE,
  type StockLevel,
  type StockLine,
} from '../../domain/stock/stock-rules.js';
import { sortByIsbn } from './lock-order.js';

const alreadyReserved = (orderId: string) =>
  new ConflictError(
    'ORDER_ALREADY_RESERVED',
    `El pedido ${orderId} ya tiene stock reservado`,
  );

// El stock en PostgreSQL. La atomicidad vive aquí, con el SQL que ya estaba probado a fondo: un `UPDATE` condicional que
// nunca deja el stock en negativo, un bloqueo de aviso por pedido y el orden de bloqueo por ISBN
@Injectable()
export class PrismaStockRepository extends StockRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Reserva todas las líneas o ninguna: una sola transacción, y el primer fallo la revierte entera
  async reserve(orderId: string, lines: StockLine[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serializa las reservas del MISMO pedido. Con libros distintos no compiten por ninguna fila de stock ni
      // chocan en la clave primaria, y sin esto dos llamadas a la vez pasarían la comprobación de abajo.
      // Pedidos distintos no se esperan. El bloqueo se libera solo al terminar la transacción
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inventory.reserve-stock'), hashtext(${orderId}))`;

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
        if (isUniqueViolation(error)) throw alreadyReserved(orderId);
        throw error;
      }
    });
  }

  // Idempotente y segura bajo concurrencia: devuelve el stock de las reservas HELD del pedido, una sola vez
  async release(orderId: string): Promise<void> {
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

  async confirm(orderId: string, tx?: TransactionHandle): Promise<void> {
    const db = fromTransactionHandle(tx) ?? this.prisma;
    await db.reservation.updateMany({
      where: { orderId, status: 'HELD' },
      data: { status: 'CONFIRMED' },
    });
  }

  async add(isbn: string, quantity: number): Promise<StockLevel> {
    // Un solo UPDATE atómico: suma en la base (no lee, suma y escribe), así que una reserva simultánea no se pisa, y
    // solo suma si el resultado respeta el tope. Toca una sola fila, de modo que no rompe la regla de bloquear en
    // orden de ISBN
    const updated = await this.prisma.$queryRaw<StockLevel[]>`
      UPDATE inventory.stock_items
      SET available = available + ${quantity}
      WHERE isbn = ${isbn} AND available <= ${MAX_AVAILABLE - quantity}
      RETURNING isbn, available, reserved`;
    if (updated.length === 1) return updated[0] as StockLevel;

    // No actualizó: o no existe el registro, o la carga pasaría del tope
    const exists = await this.prisma.stockItem.findUnique({ where: { isbn } });
    if (!exists) throw new StockItemNotFoundError(isbn);
    throw new DomainError(
      'STOCK_LIMIT_EXCEEDED',
      `Con ${quantity} unidades más, ${isbn} pasaría del máximo de ${MAX_AVAILABLE} disponibles`,
    );
  }

  // Repetirlo no hace daño ni pisa un stock que ya exista: INSERT … ON CONFLICT DO NOTHING
  async createItem(isbn: string, tx?: TransactionHandle): Promise<void> {
    const db = fromTransactionHandle(tx) ?? this.prisma;
    await db.stockItem.createMany({
      data: [{ isbn, available: 0, reserved: 0 }],
      skipDuplicates: true,
    });
  }

  // SKIP LOCKED: dos instancias a la vez no se pisan. La clave de una reserva es pedido + libro
  async purgeConfirmed(olderThanDays: number, limit: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM inventory.reservations
      WHERE (order_id, isbn) IN (
        SELECT order_id, isbn FROM inventory.reservations
        WHERE status = 'CONFIRMED'
          AND created_at < now() - make_interval(days => ${olderThanDays})
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)`;
  }
}
