import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';
import { Customer } from '../../domain/model/customer/customer.aggregate.js';
import { CustomerRepository } from '../../domain/ports/customer.repository.js';
import {
  CatalogPricing,
  type CartItem,
} from '../../domain/ports/catalog-pricing.port.js';
import { OrderFactory } from '../../domain/model/order/order.factory.js';
import type { Order } from '../../domain/model/order/order.aggregate.js';
import type { ShippingAddress } from '../../domain/model/order/shipping-address.vo.js';
import { freeShippingSpec } from '../../domain/model/pricing/free-shipping.specification.js';
import type { PriceBreakdown } from '../../domain/model/pricing/price-breakdown.js';
import { PricingService } from '../../domain/model/pricing/pricing.service.js';

export interface PriceOrderInput {
  orderId: string;
  customerId: string;
  items: CartItem[]; // ya normalizados con `normalizeCart`
  address: ShippingAddress | null; // null solo para cotizar: `Order.place()` la exige al confirmar
}

export interface PricedOrder {
  customer: Customer;
  order: Order;
  breakdown: PriceBreakdown; // sin redondear: quien cobra o muestra redondea una sola vez
}

// El armado del pedido, en un solo sitio: lo comparten la compra y la cotización, así que el total cotizado y el cobrado
// no pueden divergir antes del cálculo. Sin efectos: no reserva, no cobra ni guarda nada. El orden de los errores también
// es único: primero el cliente (NotFoundError), después los precios del catálogo
@Injectable()
export class OrderPricer {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly catalog: CatalogPricing,
    private readonly pricing: PricingService,
  ) {}

  async price(input: PriceOrderInput): Promise<PricedOrder> {
    const customer = await this.customers.findById(input.customerId);
    if (!customer) throw new NotFoundError('Customer', input.customerId);
    const order = OrderFactory.fromCart(
      input.orderId,
      customer.id,
      await this.catalog.priceCart(input.items),
      input.address,
    );
    const breakdown = this.pricing.breakdown(
      order,
      customer,
      freeShippingSpec.isSatisfiedBy({ order, customer }),
    );
    return { customer, order, breakdown };
  }
}
