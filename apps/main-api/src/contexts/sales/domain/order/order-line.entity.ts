import type { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import type { Money } from '../shared/money.vo.js';

// Snapshot: el título y el precio se copian al comprar; si el catálogo cambia, el pedido conserva lo que se pagó
export class OrderLine {
  private _quantity: number;

  constructor(
    readonly isbn: Isbn,
    readonly title: string,
    readonly unitPrice: Money,
    quantity: number,
  ) {
    this._quantity = quantity;
  }

  get quantity(): number {
    return this._quantity;
  }

  // Sin redondear: el redondeo ocurre una sola vez, sobre el total
  total(): Money {
    return this.unitPrice.multiply(String(this._quantity));
  }

  increase(by: number): void {
    this._quantity += by;
  }
}
