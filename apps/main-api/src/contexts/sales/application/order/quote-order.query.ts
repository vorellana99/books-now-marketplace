import { Query } from '@nestjs/cqrs';
import type { CartItem } from '../../domain/ports/catalog-pricing.port.js';
import type { Currency, Money } from '../../domain/shared/money.vo.js';

export interface QuoteLine {
  isbn: string;
  unitPrice: Money;
  quantity: number;
  subtotal: Money; // precio unitario × cantidad, exacto
}

// El total antes de pagar, con las mismas reglas que el cobro. Todos los montos salen redondeados y suman: subtotal −
// descuento + envío = total (el total es lo único que se redondea, RN-06). Se serializa como { amount: "90.00", currency }
export interface OrderQuote {
  currency: Currency;
  lines: QuoteLine[]; // ordenadas por ISBN, con las repetidas ya sumadas
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
}

// Cotiza un carrito para un cliente sin reservar stock, cobrar ni guardar nada. Los datos llegan sin validar: el handler
// normaliza los ISBN y aplica las reglas de la compra. Falla con NotFoundError (el cliente o un libro no existe o está
// inactivo) o con el DomainError que daría la compra: INVALID_ISBN, CURRENCY_MISMATCH, MAX_QUANTITY_EXCEEDED,
// INVALID_QUANTITY, EMPTY_ORDER o UNSUPPORTED_CURRENCY. No avisa de falta de stock: eso se descubre al pagar
export class QuoteOrderQuery extends Query<OrderQuote> {
  constructor(
    readonly customerId: string,
    readonly items: CartItem[],
  ) {
    super();
  }
}
