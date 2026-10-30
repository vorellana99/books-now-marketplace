import { randomUUID } from 'node:crypto';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { normalizeCart } from '../../../domain/model/order/normalize-cart.js';
import { OrderPricer } from '../../services/order-pricer.js';
import { QuoteOrderQuery, type OrderQuote } from './quote-order.query.js';

// Lado de lectura: arma el pedido en memoria igual que la compra y le pide el desglose al mismo PricingService. No recibe
// el stock, la pasarela ni los repositorios de escritura: no puede reservar, cobrar ni guardar nada
@QueryHandler(QuoteOrderQuery)
export class QuoteOrderHandler implements IQueryHandler<QuoteOrderQuery> {
  constructor(private readonly pricer: OrderPricer) {}

  async execute({ customerId, items }: QuoteOrderQuery): Promise<OrderQuote> {
    // Sin dirección: cotizar no es comprar, y `Order.place()` la exige solo al confirmar
    const { order, breakdown } = await this.pricer.price({
      orderId: randomUUID(),
      customerId,
      items: normalizeCart(items),
      address: null,
    });
    const parts = breakdown.rounded();
    return {
      currency: parts.total.currency,
      lines: order
        .getLines()
        .sort((a, b) => (a.isbn.value < b.isbn.value ? -1 : 1))
        .map((line) => ({
          isbn: line.isbn.value,
          unitPrice: line.unitPrice.toFinal(),
          quantity: line.quantity,
          subtotal: line.total().toFinal(),
        })),
      subtotal: parts.subtotal,
      discount: parts.discount,
      shipping: parts.shipping,
      total: parts.total,
    };
  }
}
