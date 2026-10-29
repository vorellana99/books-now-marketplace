import { randomUUID } from 'node:crypto';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import { CustomerRepository } from '../../domain/customer/customer.repository.js';
import { CatalogPricing } from '../../domain/order/catalog-pricing.port.js';
import { OrderFactory } from '../../domain/order/order.factory.js';
import { freeShippingSpec } from '../../domain/pricing/free-shipping.specification.js';
import { PricingService } from '../../domain/pricing/pricing.service.js';
import { QuoteOrderQuery, type OrderQuote } from './quote-order.query.js';

// Lado de lectura: arma el pedido en memoria igual que la compra y le pide el desglose al mismo PricingService. No recibe
// el stock, la pasarela ni los repositorios de escritura: no puede reservar, cobrar ni guardar nada
@QueryHandler(QuoteOrderQuery)
export class QuoteOrderHandler implements IQueryHandler<QuoteOrderQuery> {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly catalog: CatalogPricing,
    private readonly pricing: PricingService,
  ) {}

  async execute({ customerId, items }: QuoteOrderQuery): Promise<OrderQuote> {
    // Como en la compra: "978-0-…" y "978…" son el mismo libro
    const normalized = items.map((i) => ({
      isbn: Isbn.create(i.isbn).value,
      quantity: i.quantity,
    }));
    const customer = await this.customers.findById(customerId);
    if (!customer) throw new NotFoundError('Customer', customerId);
    // Sin dirección: cotizar no es comprar, y `Order.place()` la exige solo al confirmar
    const order = OrderFactory.fromCart(
      randomUUID(),
      customer.id,
      await this.catalog.priceCart(normalized),
      null,
    );
    const parts = this.pricing
      .breakdown(
        order,
        customer,
        freeShippingSpec.isSatisfiedBy({ order, customer }),
      )
      .rounded();
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
