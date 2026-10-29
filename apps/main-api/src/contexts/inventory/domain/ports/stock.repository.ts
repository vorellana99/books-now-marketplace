import type { TransactionHandle } from '../../../../shared-kernel/transaction-handle.js';
import type { StockLevel, StockLine } from '../stock/stock-rules.js';

// Dónde vive el stock. Las operaciones son atómicas por contrato, con nombres de negocio: cómo se garantiza (un `UPDATE`
// condicional, un bloqueo por pedido, el orden de bloqueo por ISBN) es cosa del adaptador y de la base, que son quienes
// lo pueden garantizar bajo concurrencia. Las que reciben `tx` se unen a una transacción que otro abrió
export abstract class StockRepository {
  // Reserva todas las líneas o ninguna. Nunca deja el stock en negativo, aunque haya pedidos simultáneos. Lanza
  // OutOfStockError, StockItemNotFoundError o ConflictError ORDER_ALREADY_RESERVED (el pedido ya tiene reservas)
  abstract reserve(orderId: string, lines: StockLine[]): Promise<void>;

  // Devuelve el stock de las reservas HELD del pedido, una sola vez. Idempotente: sin reservas no hace nada. Una reserva
  // CONFIRMED ya es definitiva y no se libera
  abstract release(orderId: string): Promise<void>;

  // Pasa a CONFIRMED las reservas HELD del pedido. Repetirlo no hace daño: solo toca las HELD
  abstract confirm(orderId: string, tx?: TransactionHandle): Promise<void>;

  // Suma unidades al stock de un libro que ya tiene registro, sin pisar una reserva simultánea y solo si el resultado
  // respeta MAX_AVAILABLE. Lanza StockItemNotFoundError o DomainError STOCK_LIMIT_EXCEEDED
  abstract add(isbn: string, quantity: number): Promise<StockLevel>;

  // Crea el registro de stock de un libro, en cero. Si ya existe no lo toca ni pisa su stock
  abstract createItem(isbn: string, tx?: TransactionHandle): Promise<void>;

  // Borra, como mucho `limit`, las reservas CONFIRMED con más de N días y devuelve cuántas. Nunca borra una HELD
  abstract purgeConfirmed(
    olderThanDays: number,
    limit: number,
  ): Promise<number>;
}
