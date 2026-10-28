import { Command } from '@nestjs/cqrs';

// Unidades por carga: una carga enorme casi siempre es un cero de más
export const MAX_ADDITION = 100_000;
// Tope de lo disponible de un libro. `available` es un entero de 32 bits en la base: sin un tope, una carga muy grande
// lo desbordaría y el error saldría como un 500. Un millón de ejemplares de un título queda muy por encima de lo real
export const MAX_AVAILABLE = 1_000_000;

export interface StockLevel {
  isbn: string;
  available: number;
  reserved: number;
}

// Suma unidades al stock de un libro que ya tiene registro. Es una suma y no un "fijar en N": una carga y una reserva
// al mismo tiempo no se pisan. Falla con INVALID_QUANTITY, STOCK_LIMIT_EXCEEDED o StockItemNotFoundError
export class AddStockCommand extends Command<StockLevel> {
  constructor(
    readonly isbn: string,
    readonly quantity: number,
  ) {
    super();
  }
}
