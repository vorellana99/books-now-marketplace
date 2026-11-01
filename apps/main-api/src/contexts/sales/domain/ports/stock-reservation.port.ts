export interface StockLine {
  isbn: string;
  quantity: number;
}

export abstract class StockReservation {
  abstract reserve(orderId: string, lines: StockLine[]): Promise<void>; // lanza OutOfStockError
  abstract release(orderId: string): Promise<void>; // idempotente: sin reservas, no hace nada
}
