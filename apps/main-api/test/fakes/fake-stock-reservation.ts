import { OutOfStockError } from '../../src/contracts/inventory/stock.errors.js';
import {
  StockReservation,
  type StockLine,
} from '../../src/contexts/sales/domain/order/stock-reservation.port.js';

// Reserva en memoria. `released` guarda los pedidos cuya reserva se devolvió
export class FakeStockReservation extends StockReservation {
  readonly reserved: { orderId: string; lines: StockLine[] }[] = [];
  readonly released: string[] = [];

  constructor(private readonly options: { outOfStock?: string[] } = {}) {
    super();
  }

  reserve(orderId: string, lines: StockLine[]): Promise<void> {
    const missing = lines.find((l) =>
      this.options.outOfStock?.includes(l.isbn),
    );
    if (missing) return Promise.reject(new OutOfStockError(missing.isbn));
    this.reserved.push({ orderId, lines });
    return Promise.resolve();
  }

  // Idempotente, como la liberación real: sin reserva no hace nada
  release(orderId: string): Promise<void> {
    const index = this.reserved.findIndex((r) => r.orderId === orderId);
    if (index !== -1) {
      this.reserved.splice(index, 1);
      this.released.push(orderId);
    }
    return Promise.resolve();
  }
}
