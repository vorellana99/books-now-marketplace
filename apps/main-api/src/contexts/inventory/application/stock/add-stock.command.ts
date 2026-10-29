import { Command } from '@nestjs/cqrs';
import type { StockLevel } from '../../domain/stock/stock-rules.js';

// Los límites y la forma del nivel de stock son del dominio; se reexportan aquí para quien ya los importaba de este archivo
export {
  MAX_ADDITION,
  MAX_AVAILABLE,
  type StockLevel,
} from '../../domain/stock/stock-rules.js';

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
