import { DomainError } from '../../shared-kernel/domain.errors.js';

// → 422
export class OutOfStockError extends DomainError {
  constructor(isbn: string) {
    super('OUT_OF_STOCK', `Sin stock suficiente para ${isbn}`);
  }
}

// → 422 (no 404: el libro existe en Catálogo)
export class StockItemNotFoundError extends DomainError {
  constructor(isbn: string) {
    super('STOCK_ITEM_NOT_FOUND', `No hay registro de stock para ${isbn}`);
  }
}
